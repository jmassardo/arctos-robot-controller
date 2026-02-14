#!/bin/bash

# Infrastructure as Code deployment script
set -e

ENVIRONMENT=${1:-dev}
ACTION=${2:-plan}  # plan, apply, destroy
AUTO_APPROVE=${3:-false}

TERRAFORM_DIR="terraform"
STATE_KEY="infrastructure/terraform-${ENVIRONMENT}.tfstate"

echo "Terraform Infrastructure Management"
echo "Environment: $ENVIRONMENT"
echo "Action: $ACTION"

# Validate inputs
case $ENVIRONMENT in
    "dev"|"staging"|"prod")
        ;;
    *)
        echo "Error: Invalid environment. Use: dev, staging, prod"
        exit 1
        ;;
esac

case $ACTION in
    "plan"|"apply"|"destroy")
        ;;
    *)
        echo "Error: Invalid action. Use: plan, apply, destroy"
        exit 1
        ;;
esac

# Set environment-specific variables
case $ENVIRONMENT in
    "dev")
        TFVARS_FILE="terraform.dev.tfvars"
        CLUSTER_NAME="arctos-robot-controller-dev"
        ;;
    "staging")
        TFVARS_FILE="terraform.staging.tfvars"
        CLUSTER_NAME="arctos-robot-controller-staging"
        ;;
    "prod")
        TFVARS_FILE="terraform.prod.tfvars"
        CLUSTER_NAME="arctos-robot-controller"
        ;;
esac

cd $TERRAFORM_DIR

# Initialize Terraform
echo "Initializing Terraform..."
terraform init \
    -backend-config="key=$STATE_KEY" \
    -backend-config="bucket=arctos-terraform-state-${ENVIRONMENT}" \
    -backend-config="region=us-west-2" \
    -reconfigure

# Validate configuration
echo "Validating Terraform configuration..."
terraform validate

# Format check
terraform fmt -check=true || {
    echo "Terraform files need formatting. Running terraform fmt..."
    terraform fmt
}

# Select or create workspace
terraform workspace select $ENVIRONMENT || terraform workspace new $ENVIRONMENT

# Execute action
case $ACTION in
    "plan")
        echo "Creating Terraform plan..."
        terraform plan \
            -var-file="$TFVARS_FILE" \
            -var="environment=$ENVIRONMENT" \
            -var="cluster_name=$CLUSTER_NAME" \
            -out="tfplan-$ENVIRONMENT"
        
        echo "Plan created: tfplan-$ENVIRONMENT"
        echo "To apply: ./scripts/terraform-deploy.sh $ENVIRONMENT apply"
        ;;
    
    "apply")
        if [ -f "tfplan-$ENVIRONMENT" ]; then
            echo "Applying Terraform plan..."
            if [ "$AUTO_APPROVE" = "true" ]; then
                terraform apply -auto-approve "tfplan-$ENVIRONMENT"
            else
                terraform apply "tfplan-$ENVIRONMENT"
            fi
        else
            echo "No plan file found. Creating and applying..."
            if [ "$AUTO_APPROVE" = "true" ]; then
                terraform apply \
                    -var-file="$TFVARS_FILE" \
                    -var="environment=$ENVIRONMENT" \
                    -var="cluster_name=$CLUSTER_NAME" \
                    -auto-approve
            else
                terraform apply \
                    -var-file="$TFVARS_FILE" \
                    -var="environment=$ENVIRONMENT" \
                    -var="cluster_name=$CLUSTER_NAME"
            fi
        fi
        
        # Save outputs
        terraform output -json > "../terraform-outputs-$ENVIRONMENT.json"
        echo "Terraform outputs saved to terraform-outputs-$ENVIRONMENT.json"
        ;;
    
    "destroy")
        echo "⚠️  WARNING: This will destroy all infrastructure in $ENVIRONMENT!"
        read -p "Are you sure? Type 'yes' to continue: " -r
        if [[ $REPLY =~ ^yes$ ]]; then
            if [ "$AUTO_APPROVE" = "true" ]; then
                terraform destroy \
                    -var-file="$TFVARS_FILE" \
                    -var="environment=$ENVIRONMENT" \
                    -var="cluster_name=$CLUSTER_NAME" \
                    -auto-approve
            else
                terraform destroy \
                    -var-file="$TFVARS_FILE" \
                    -var="environment=$ENVIRONMENT" \
                    -var="cluster_name=$CLUSTER_NAME"
            fi
        else
            echo "Destroy cancelled"
            exit 0
        fi
        ;;
esac

# Show current state summary
if [ "$ACTION" != "destroy" ]; then
    echo ""
    echo "Current infrastructure summary:"
    terraform show -json | jq -r '
        .values.root_module.resources[] |
        select(.type | test("aws_")) |
        "\(.type): \(.values.id // .values.name // "unnamed")"
    ' | sort | uniq -c
fi

echo "Terraform $ACTION completed for $ENVIRONMENT environment"

# Send notification if webhook is configured
if [ -n "$SLACK_WEBHOOK_URL" ]; then
    STATUS_EMOJI=""
    case $ACTION in
        "plan") STATUS_EMOJI="📋" ;;
        "apply") STATUS_EMOJI="✅" ;;
        "destroy") STATUS_EMOJI="🗑️" ;;
    esac
    
    curl -X POST -H 'Content-type: application/json' \
    --data "{\"text\":\"$STATUS_EMOJI Terraform $ACTION completed for $ENVIRONMENT environment\"}" \
    "$SLACK_WEBHOOK_URL"
fi