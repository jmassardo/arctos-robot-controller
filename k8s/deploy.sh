#!/bin/bash

# Kubernetes deployment script for Arctos Robot Controller
set -e

NAMESPACE=${1:-arctos-robot-controller}
ENVIRONMENT=${2:-production}

echo "Deploying Arctos Robot Controller to Kubernetes..."
echo "Namespace: $NAMESPACE"
echo "Environment: $ENVIRONMENT"

# Create namespace if it doesn't exist
kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

# Apply configurations in order
echo "Applying Kubernetes configurations..."

# 1. Create namespace and basic resources
kubectl apply -f namespace.yaml

# 2. Create persistent volumes
kubectl apply -f pvc.yaml

# 3. Create config maps
kubectl apply -f configmap.yaml

# 4. Apply secrets (ensure secrets are properly configured first)
if [ -f "secrets.yaml" ] && [ "$ENVIRONMENT" != "development" ]; then
    echo "Warning: Please ensure secrets are properly configured before applying"
    read -p "Continue with secrets application? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        kubectl apply -f secrets.yaml
    else
        echo "Skipping secrets - please apply manually with proper values"
    fi
fi

# 5. Deploy Redis
kubectl apply -f redis.yaml

# 6. Deploy main application
kubectl apply -f deployment.yaml

# 7. Create services
kubectl apply -f service.yaml

# 8. Setup autoscaling
kubectl apply -f autoscaling.yaml

# 9. Setup ingress (if not development)
if [ "$ENVIRONMENT" != "development" ]; then
    kubectl apply -f ingress.yaml
fi

# Wait for deployments to be ready
echo "Waiting for deployments to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/arctos-redis -n $NAMESPACE
kubectl wait --for=condition=available --timeout=300s deployment/arctos-robot-controller -n $NAMESPACE

# Show status
echo "Deployment completed! Status:"
kubectl get pods -n $NAMESPACE
kubectl get services -n $NAMESPACE
kubectl get ingress -n $NAMESPACE

echo ""
echo "To access the application:"
if [ "$ENVIRONMENT" = "development" ]; then
    echo "kubectl port-forward service/arctos-robot-controller-service 5000:5000 -n $NAMESPACE"
else
    echo "https://arctos-robot-controller.example.com"
fi

echo ""
echo "To check logs:"
echo "kubectl logs -f deployment/arctos-robot-controller -n $NAMESPACE"

echo ""
echo "To check health:"
echo "kubectl exec -it deployment/arctos-robot-controller -n $NAMESPACE -- curl http://localhost:5000/api/health"