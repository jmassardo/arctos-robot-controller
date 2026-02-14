#!/bin/bash

# Blue-Green Deployment Script for Kubernetes
set -e

ENVIRONMENT=${1:-production}
NEW_IMAGE=${2}
NAMESPACE="arctos-robot-controller"

if [ "$ENVIRONMENT" != "production" ]; then
    NAMESPACE="arctos-robot-controller-$ENVIRONMENT"
fi

if [ -z "$NEW_IMAGE" ]; then
    echo "Error: New image tag is required"
    echo "Usage: $0 <environment> <image-tag>"
    exit 1
fi

echo "Starting Blue-Green deployment for $ENVIRONMENT environment"
echo "New image: $NEW_IMAGE"

# Get current deployment
CURRENT_COLOR=$(kubectl get deployment arctos-robot-controller -n $NAMESPACE -o jsonpath='{.metadata.labels.color}' || echo "blue")
if [ "$CURRENT_COLOR" = "blue" ]; then
    NEW_COLOR="green"
else
    NEW_COLOR="blue"
fi

echo "Current color: $CURRENT_COLOR"
echo "New color: $NEW_COLOR"

# Create new deployment with new color
envsubst < k8s/deployment.yaml | sed "s/arctos-robot-controller/arctos-robot-controller-$NEW_COLOR/g" | \
sed "s/latest/$NEW_IMAGE/g" | \
sed "s/app: arctos-robot-controller/app: arctos-robot-controller-$NEW_COLOR/g" | \
kubectl apply -f - -n $NAMESPACE

# Wait for new deployment to be ready
echo "Waiting for new deployment to be ready..."
kubectl wait --for=condition=available --timeout=600s deployment/arctos-robot-controller-$NEW_COLOR -n $NAMESPACE

# Run health checks
echo "Running health checks on new deployment..."
kubectl run health-check-$NEW_COLOR --rm -i --restart=Never --image=curlimages/curl -- \
curl -f http://arctos-robot-controller-$NEW_COLOR:5000/api/health

if [ $? -ne 0 ]; then
    echo "Health check failed! Rolling back..."
    kubectl delete deployment arctos-robot-controller-$NEW_COLOR -n $NAMESPACE
    exit 1
fi

# Update service to point to new deployment
kubectl patch service arctos-robot-controller-service -n $NAMESPACE \
-p '{"spec":{"selector":{"app":"arctos-robot-controller-'$NEW_COLOR'"}}}'

# Wait a bit for traffic to switch
echo "Waiting for traffic to switch..."
sleep 30

# Run additional health checks
echo "Running final health checks..."
for i in {1..5}; do
    kubectl run final-health-check-$i --rm -i --restart=Never --image=curlimages/curl -- \
    curl -f http://arctos-robot-controller-service:5000/api/health
    
    if [ $? -ne 0 ]; then
        echo "Final health check $i failed! Rolling back..."
        # Rollback service
        kubectl patch service arctos-robot-controller-service -n $NAMESPACE \
        -p '{"spec":{"selector":{"app":"arctos-robot-controller-'$CURRENT_COLOR'"}}}'
        # Delete new deployment
        kubectl delete deployment arctos-robot-controller-$NEW_COLOR -n $NAMESPACE
        exit 1
    fi
    sleep 10
done

# Update main deployment label
kubectl patch deployment arctos-robot-controller -n $NAMESPACE \
-p '{"metadata":{"labels":{"color":"'$NEW_COLOR'"}},"spec":{"selector":{"matchLabels":{"app":"arctos-robot-controller-'$NEW_COLOR'"}},"template":{"metadata":{"labels":{"app":"arctos-robot-controller-'$NEW_COLOR'"}}}}}'

# Clean up old deployment after successful switch
if [ -n "$CURRENT_COLOR" ] && [ "$CURRENT_COLOR" != "$NEW_COLOR" ]; then
    echo "Cleaning up old deployment..."
    kubectl delete deployment arctos-robot-controller-$CURRENT_COLOR -n $NAMESPACE || true
fi

echo "Blue-Green deployment completed successfully!"
echo "Active color: $NEW_COLOR"

# Show deployment status
kubectl get deployments -n $NAMESPACE
kubectl get services -n $NAMESPACE