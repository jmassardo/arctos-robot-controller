#!/bin/bash

set -e

echo "Deploying Arctos Robot Controller..."

# Pull latest images
docker-compose pull

# Stop existing containers
docker-compose down

# Start services
docker-compose up -d

# Wait for health check
echo "Waiting for application to be healthy..."
timeout 60 bash -c 'until docker-compose ps | grep -q "healthy"; do sleep 2; done'

echo "Deployment completed successfully!"
echo "Application is running at http://localhost:5000"

# Show status
docker-compose ps