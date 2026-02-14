#!/bin/bash

# Disaster Recovery Script for Arctos Robot Controller
set -e

ENVIRONMENT=${1:-production}
BACKUP_TIMESTAMP=${2}
RECOVERY_TYPE=${3:-full}  # full, data-only, config-only

if [ -z "$BACKUP_TIMESTAMP" ]; then
    echo "Error: Backup timestamp is required"
    echo "Usage: $0 <environment> <backup_timestamp> [recovery_type]"
    echo "Example: $0 production 20241201_143022 full"
    exit 1
fi

S3_BUCKET="arctos-backups-${ENVIRONMENT}"
RECOVERY_DIR="/recovery/arctos-robot-controller"
NAMESPACE="arctos-robot-controller${ENVIRONMENT:+-$ENVIRONMENT}"

echo "Starting disaster recovery for $ENVIRONMENT environment"
echo "Backup timestamp: $BACKUP_TIMESTAMP"
echo "Recovery type: $RECOVERY_TYPE"

# Create recovery directory
mkdir -p "$RECOVERY_DIR"

# Function to download backup from S3
download_backup() {
    echo "Downloading backup from S3..."
    
    aws s3 sync "s3://$S3_BUCKET/$ENVIRONMENT/$BACKUP_TIMESTAMP/" "$RECOVERY_DIR/" \
    --exclude "*" --include "*${BACKUP_TIMESTAMP}*"
    
    # Verify manifest
    if [ -f "$RECOVERY_DIR/manifest_${BACKUP_TIMESTAMP}.json" ]; then
        echo "Backup manifest found:"
        cat "$RECOVERY_DIR/manifest_${BACKUP_TIMESTAMP}.json"
    else
        echo "Warning: Backup manifest not found"
    fi
}

# Function to restore database
restore_database() {
    echo "Restoring database..."
    
    if [ "$ENVIRONMENT" = "dev" ]; then
        # For development (SQLite)
        if [ -f "$RECOVERY_DIR/database_${BACKUP_TIMESTAMP}.sqlite" ]; then
            kubectl cp "$RECOVERY_DIR/database_${BACKUP_TIMESTAMP}.sqlite" \
            "$NAMESPACE/$(kubectl get pod -n $NAMESPACE -l app=arctos-robot-controller -o jsonpath='{.items[0].metadata.name}'):/app/data/database.sqlite"
        fi
    else
        # For production (PostgreSQL via RDS)
        if [ -f "$RECOVERY_DIR/database_${BACKUP_TIMESTAMP}.sql.gz" ]; then
            DB_HOST=$(aws rds describe-db-instances --db-instance-identifier arctos-robot-controller-postgres --query 'DBInstances[0].Endpoint.Address' --output text)
            DB_PASSWORD=$(aws secretsmanager get-secret-value --secret-id arctos-robot-controller/database/password --query SecretString --output text | jq -r .password)
            
            # Create a new database for recovery
            PGPASSWORD="$DB_PASSWORD" createdb -h "$DB_HOST" -U arctos_user arctos_recovery || true
            
            # Restore from backup
            gunzip -c "$RECOVERY_DIR/database_${BACKUP_TIMESTAMP}.sql.gz" | \
            PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U arctos_user -d arctos_recovery
            
            echo "Database restored to arctos_recovery. Please verify and manually switch if needed."
        fi
    fi
}

# Function to restore application data
restore_application_data() {
    echo "Restoring application data..."
    
    POD_NAME=$(kubectl get pod -n "$NAMESPACE" -l app=arctos-robot-controller -o jsonpath='{.items[0].metadata.name}')
    
    # Restore data directory
    if [ -f "$RECOVERY_DIR/data_${BACKUP_TIMESTAMP}.tar.gz" ]; then
        kubectl cp "$RECOVERY_DIR/data_${BACKUP_TIMESTAMP}.tar.gz" "$NAMESPACE/$POD_NAME:/tmp/data_restore.tar.gz"
        kubectl exec -n "$NAMESPACE" "$POD_NAME" -- tar xzf /tmp/data_restore.tar.gz -C /app/
        kubectl exec -n "$NAMESPACE" "$POD_NAME" -- rm /tmp/data_restore.tar.gz
    fi
    
    # Restore config directory
    if [ -f "$RECOVERY_DIR/config_${BACKUP_TIMESTAMP}.tar.gz" ]; then
        kubectl cp "$RECOVERY_DIR/config_${BACKUP_TIMESTAMP}.tar.gz" "$NAMESPACE/$POD_NAME:/tmp/config_restore.tar.gz"
        kubectl exec -n "$NAMESPACE" "$POD_NAME" -- tar xzf /tmp/config_restore.tar.gz -C /app/
        kubectl exec -n "$NAMESPACE" "$POD_NAME" -- rm /tmp/config_restore.tar.gz
    fi
    
    echo "Application data restored. Restarting pods..."
    kubectl rollout restart deployment/arctos-robot-controller -n "$NAMESPACE"
    kubectl rollout status deployment/arctos-robot-controller -n "$NAMESPACE" --timeout=300s
}

# Function to restore Kubernetes resources
restore_kubernetes_resources() {
    echo "Restoring Kubernetes resources..."
    
    # Create namespace if it doesn't exist
    kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -
    
    # Restore ConfigMaps (safe to apply)
    if [ -f "$RECOVERY_DIR/k8s_configmaps_${BACKUP_TIMESTAMP}.yaml" ]; then
        kubectl apply -f "$RECOVERY_DIR/k8s_configmaps_${BACKUP_TIMESTAMP}.yaml" -n "$NAMESPACE"
    fi
    
    # Restore Services
    if [ -f "$RECOVERY_DIR/k8s_services_${BACKUP_TIMESTAMP}.yaml" ]; then
        kubectl apply -f "$RECOVERY_DIR/k8s_services_${BACKUP_TIMESTAMP}.yaml" -n "$NAMESPACE"
    fi
    
    # Restore Deployments
    if [ -f "$RECOVERY_DIR/k8s_deployments_${BACKUP_TIMESTAMP}.yaml" ]; then
        kubectl apply -f "$RECOVERY_DIR/k8s_deployments_${BACKUP_TIMESTAMP}.yaml" -n "$NAMESPACE"
    fi
    
    echo "Kubernetes resources restored. Checking status..."
    kubectl get all -n "$NAMESPACE"
}

# Function to restore Redis
restore_redis() {
    echo "Restoring Redis data..."
    
    if [ "$ENVIRONMENT" = "dev" ]; then
        # For development Redis
        if [ -f "$RECOVERY_DIR/redis_${BACKUP_TIMESTAMP}.rdb" ]; then
            POD_NAME=$(kubectl get pod -n "$NAMESPACE" -l app=redis -o jsonpath='{.items[0].metadata.name}')
            
            # Stop Redis temporarily
            kubectl exec -n "$NAMESPACE" "$POD_NAME" -- redis-cli SHUTDOWN NOSAVE || true
            sleep 5
            
            # Copy backup file
            kubectl cp "$RECOVERY_DIR/redis_${BACKUP_TIMESTAMP}.rdb" "$NAMESPACE/$POD_NAME:/data/dump.rdb"
            
            # Restart Redis pod
            kubectl delete pod "$POD_NAME" -n "$NAMESPACE"
            kubectl wait --for=condition=Ready pod -l app=redis -n "$NAMESPACE" --timeout=120s
        fi
    else
        # For production ElastiCache
        echo "For ElastiCache, use AWS console or CLI to restore from snapshot: arctos-redis-backup-$BACKUP_TIMESTAMP"
        echo "Command: aws elasticache create-replication-group --replication-group-id arctos-redis-restored --replication-group-description 'Restored Redis' --snapshot-name arctos-redis-backup-$BACKUP_TIMESTAMP"
    fi
}

# Function to verify recovery
verify_recovery() {
    echo "Verifying recovery..."
    
    # Check if pods are running
    kubectl wait --for=condition=Ready pod -l app=arctos-robot-controller -n "$NAMESPACE" --timeout=300s
    
    # Run health checks
    POD_NAME=$(kubectl get pod -n "$NAMESPACE" -l app=arctos-robot-controller -o jsonpath='{.items[0].metadata.name}')
    
    for i in {1..5}; do
        if kubectl exec -n "$NAMESPACE" "$POD_NAME" -- curl -f http://localhost:5000/api/health; then
            echo "Health check $i passed"
        else
            echo "Health check $i failed"
            return 1
        fi
        sleep 10
    done
    
    echo "All health checks passed!"
    
    # Check database connectivity
    kubectl exec -n "$NAMESPACE" "$POD_NAME" -- node -e "
        const { Sequelize } = require('sequelize');
        const sequelize = new Sequelize(process.env.DB_PATH || 'sqlite:/app/data/database.sqlite');
        sequelize.authenticate().then(() => {
            console.log('Database connection successful');
            process.exit(0);
        }).catch(err => {
            console.error('Database connection failed:', err);
            process.exit(1);
        });
    "
}

# Function to create recovery report
create_recovery_report() {
    echo "Creating recovery report..."
    
    REPORT_FILE="$RECOVERY_DIR/recovery_report_$(date +%Y%m%d_%H%M%S).json"
    
    cat > "$REPORT_FILE" << EOF
{
  "recovery_timestamp": "$(date -Iseconds)",
  "environment": "$ENVIRONMENT",
  "backup_timestamp": "$BACKUP_TIMESTAMP",
  "recovery_type": "$RECOVERY_TYPE",
  "status": "completed",
  "restored_components": [
$([ "$RECOVERY_TYPE" = "full" ] || [ "$RECOVERY_TYPE" = "data-only" ] && echo '    "database",'; [ "$RECOVERY_TYPE" = "full" ] || [ "$RECOVERY_TYPE" = "data-only" ] && echo '    "application_data",'; [ "$RECOVERY_TYPE" = "full" ] || [ "$RECOVERY_TYPE" = "config-only" ] && echo '    "kubernetes_resources",'; [ "$RECOVERY_TYPE" = "full" ] && echo '    "redis"')
  ],
  "verification_status": "passed",
  "recovery_duration_seconds": $SECONDS
}
EOF
    
    echo "Recovery report created: $REPORT_FILE"
    cat "$REPORT_FILE"
}

# Main recovery execution
main() {
    download_backup
    
    case $RECOVERY_TYPE in
        "full")
            restore_kubernetes_resources
            restore_database
            restore_application_data
            restore_redis
            ;;
        "data-only")
            restore_database
            restore_application_data
            ;;
        "config-only")
            restore_kubernetes_resources
            ;;
        *)
            echo "Unknown recovery type: $RECOVERY_TYPE"
            exit 1
            ;;
    esac
    
    verify_recovery
    create_recovery_report
    
    echo "Disaster recovery completed successfully!"
    echo "Please verify the application is functioning correctly."
}

# Execute main function
main

# Send notification
if command -v curl &> /dev/null && [ -n "$SLACK_WEBHOOK_URL" ]; then
    curl -X POST -H 'Content-type: application/json' \
    --data "{\"text\":\"🔄 Arctos Robot Controller disaster recovery completed for $ENVIRONMENT environment\\nBackup: $BACKUP_TIMESTAMP\\nRecovery type: $RECOVERY_TYPE\"}" \
    "$SLACK_WEBHOOK_URL"
fi