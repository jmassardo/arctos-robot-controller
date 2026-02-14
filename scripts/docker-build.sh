#!/bin/bash

# Build production Docker image
echo "Building Arctos Robot Controller Docker image..."

# Build multi-stage production image
docker build -t arctos-robot-controller:latest .

# Tag with version
VERSION=$(node -p "require('./package.json').version")
docker tag arctos-robot-controller:latest arctos-robot-controller:$VERSION

echo "Build completed:"
echo "  arctos-robot-controller:latest"
echo "  arctos-robot-controller:$VERSION"

# Optional: Push to registry
if [ "$1" = "--push" ]; then
    echo "Pushing to registry..."
    docker push arctos-robot-controller:latest
    docker push arctos-robot-controller:$VERSION
fi