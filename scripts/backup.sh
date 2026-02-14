#!/bin/bash

# Comprehensive backup script for Arctos Robot Controller
set -e

ENVIRONMENT=${1:-production}
BACKUP_TYPE=${2:-full}  # full, incremental, config-only
RETENTION_DAYS=${3:-30}

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/arctos-robot-controller"
S3_BUCKET="arctos-backups-${ENVIRONMENT}"

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo "Starting $BACKUP_TYPE backup for $ENVIRONMENT environment at $TIMESTAMP"

# Function to backup database
backup_database() {
    echo "Backing up database..."
    
    if [ "$ENVIRONMENT" = "dev" ]; then
        # For development (SQLite)
        kubectl exec -n arctos-robot-controller-dev deployment/arctos-robot-controller -- \
        sqlite3 /app/data/database.sqlite ".backup /tmp/database_backup.sqlite"
        
        kubectl cp arctos-robot-controller-dev/$(kubectl get pod -n arctos-robot-controller-dev -l app=arctos-robot-controller -o jsonpath='{.items[0].metadata.name}'):/tmp/database_backup.sqlite \
        "$BACKUP_DIR/database_${TIMESTAMP}.sqlite"
    else
        # For production (PostgreSQL via RDS)
        DB_HOST=$(aws rds describe-db-instances --db-instance-identifier arctos-robot-controller-postgres --query 'DBInstances[0].Endpoint.Address' --output text)
        DB_PASSWORD=$(aws secretsmanager get-secret-value --secret-id arctos-robot-controller/database/password --query SecretString --output text | jq -r .password)
        
        PGPASSWORD="$DB_PASSWORD" pg_dump -h "$DB_HOST" -U arctos_user -d arctos > "$BACKUP_DIR/database_${TIMESTAMP}.sql"
        gzip "$BACKUP_DIR/database_${TIMESTAMP}.sql"
    fi
}

# Function to backup application data
backup_application_data() {
    echo "Backing up application data..."
    
    # Get pod name
    POD_NAME=$(kubectl get pod -n arctos-robot-controller${ENVIRONMENT:+-$ENVIRONMENT} -l app=arctos-robot-controller -o jsonpath='{.items[0].metadata.name}')
    
    # Backup data directory
    kubectl exec -n arctos-robot-controller${ENVIRONMENT:+-$ENVIRONMENT} "$POD_NAME" -- tar czf /tmp/data_backup.tar.gz -C /app data/
    kubectl cp "arctos-robot-controller${ENVIRONMENT:+-$ENVIRONMENT}/$POD_NAME:/tmp/data_backup.tar.gz" "$BACKUP_DIR/data_${TIMESTAMP}.tar.gz"
    
    # Backup config directory
    kubectl exec -n arctos-robot-controller${ENVIRONMENT:+-$ENVIRONMENT} "$POD_NAME" -- tar czf /tmp/config_backup.tar.gz -C /app config/
    kubectl cp "arctos-robot-controller${ENVIRONMENT:+-$ENVIRONMENT}/$POD_NAME:/tmp/config_backup.tar.gz" "$BACKUP_DIR/config_${TIMESTAMP}.tar.gz"
    
    # Backup logs (last 7 days)
    kubectl exec -n arctos-robot-controller${ENVIRONMENT:+-$ENVIRONMENT} "$POD_NAME" -- find /app/logs -name "*.log" -mtime -7 -exec tar czf /tmp/logs_backup.tar.gz {} +
    kubectl cp "arctos-robot-controller${ENVIRONMENT:+-$ENVIRONMENT}/$POD_NAME:/tmp/logs_backup.tar.gz" "$BACKUP_DIR/logs_${TIMESTAMP}.tar.gz" || true
}

# Function to backup Kubernetes resources
backup_kubernetes_resources() {
    echo "Backing up Kubernetes resources..."
    
    NAMESPACE="arctos-robot-controller${ENVIRONMENT:+-$ENVIRONMENT}"
    
    # Backup all resources
    kubectl get all,configmaps,secrets,persistentvolumeclaims,ingress -n "$NAMESPACE" -o yaml > "$BACKUP_DIR/k8s_resources_${TIMESTAMP}.yaml"
    
    # Backup specific resource types with more detail
    kubectl get deployment -n "$NAMESPACE" -o yaml > "$BACKUP_DIR/k8s_deployments_${TIMESTAMP}.yaml"
    kubectl get service -n "$NAMESPACE" -o yaml > "$BACKUP_DIR/k8s_services_${TIMESTAMP}.yaml"
    kubectl get configmap -n "$NAMESPACE" -o yaml > "$BACKUP_DIR/k8s_configmaps_${TIMESTAMP}.yaml"
    
    # Note: Secrets backup should be handled carefully with encryption
    kubectl get secret -n "$NAMESPACE" -o yaml | grep -v 'kubernetes.io/service-account-token' > "$BACKUP_DIR/k8s_secrets_${TIMESTAMP}.yaml"
}

# Function to backup Redis data
backup_redis() {
    echo "Backing up Redis data..."
    
    if [ "$ENVIRONMENT" = "dev" ]; then
        # For development Redis in Kubernetes
        POD_NAME=$(kubectl get pod -n arctos-robot-controller-dev -l app=redis -o jsonpath='{.items[0].metadata.name}')
        kubectl exec -n arctos-robot-controller-dev "$POD_NAME" -- redis-cli BGSAVE
        sleep 10  # Wait for background save to complete
        kubectl cp "arctos-robot-controller-dev/$POD_NAME:/data/dump.rdb" "$BACKUP_DIR/redis_${TIMESTAMP}.rdb"
    else
        # For production ElastiCache, use snapshot
        aws elasticache create-snapshot \
        --cache-cluster-id arctos-robot-controller-redis \
        --snapshot-name "arctos-redis-backup-$TIMESTAMP" \
        --region us-west-2
        
        echo "ElastiCache snapshot created: arctos-redis-backup-$TIMESTAMP"
    fi
}

# Function to create backup manifest
create_backup_manifest() {
    echo "Creating backup manifest..."
    
    cat > "$BACKUP_DIR/manifest_${TIMESTAMP}.json" << EOF
{
  "backup_timestamp": "$TIMESTAMP",
  "environment": "$ENVIRONMENT",
  "backup_type": "$BACKUP_TYPE",
  "files": [
$(find "$BACKUP_DIR" -name "*_${TIMESTAMP}.*" -exec basename {} \; | sed 's/.*/"&"/' | paste -sd,)
  ],
  "size_bytes": $(du -sb "$BACKUP_DIR" | cut -f1),
  "created_by": "$(whoami)",
  "retention_date": "$(date -d "+${RETENTION_DAYS} days" +%Y-%m-%d)"
}
EOF
}

# Function to upload to S3
upload_to_s3() {
    echo "Uploading backup to S3..."
    
    # Create S3 bucket if it doesn't exist
    aws s3 mb "s3://$S3_BUCKET" --region us-west-2 || true
    
    # Enable versioning
    aws s3api put-bucket-versioning --bucket "$S3_BUCKET" --versioning-configuration Status=Enabled
    
    # Upload backup files
    aws s3 sync "$BACKUP_DIR" "s3://$S3_BUCKET/$ENVIRONMENT/$TIMESTAMP/" \
    --storage-class STANDARD_IA \
    --server-side-encryption AES256
    
    echo "Backup uploaded to s3://$S3_BUCKET/$ENVIRONMENT/$TIMESTAMP/"
}

# Function to cleanup old backups
cleanup_old_backups() {
    echo "Cleaning up old backups..."
    
    # Local cleanup
    find "/backups" -name "*" -type d -mtime +$RETENTION_DAYS -exec rm -rf {} + || true
    
    # S3 cleanup
    aws s3api put-bucket-lifecycle-configuration --bucket "$S3_BUCKET" --lifecycle-configuration file://- << EOF
{
    "Rules": [
        {
            "ID": "ArchiveAndDelete",
            "Status": "Enabled",
            "Transitions": [
                {
                    "Days": 30,
                    "StorageClass": "GLACIER"
                },
                {
                    "Days": 90,
                    "StorageClass": "DEEP_ARCHIVE"
                }
            ],
            "Expiration": {
                "Days": $RETENTION_DAYS
            }
        }
    ]
}
EOF
}

# Main backup execution
main() {
    case $BACKUP_TYPE in
        "full")
            backup_database
            backup_application_data
            backup_kubernetes_resources
            backup_redis
            ;;
        "incremental")
            backup_application_data
            ;;
        "config-only")
            backup_kubernetes_resources
            ;;
        *)
            echo "Unknown backup type: $BACKUP_TYPE"
            exit 1
            ;;
    esac
    
    create_backup_manifest
    upload_to_s3
    cleanup_old_backups
    
    echo "Backup completed successfully!"
    echo "Backup location: s3://$S3_BUCKET/$ENVIRONMENT/$TIMESTAMP/"
    echo "Local backup: $BACKUP_DIR"
}

# Execute main function
main

# Send notification (optional)
if command -v curl &> /dev/null && [ -n "$SLACK_WEBHOOK_URL" ]; then
    curl -X POST -H 'Content-type: application/json' \
    --data "{\"text\":\"✅ Arctos Robot Controller backup completed for $ENVIRONMENT environment\\nBackup type: $BACKUP_TYPE\\nTimestamp: $TIMESTAMP\"}" \
    "$SLACK_WEBHOOK_URL"
fi