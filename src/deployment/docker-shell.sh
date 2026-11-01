#!/bin/bash

set -e

# Define some environment variables
export IMAGE_NAME="cheese-shop-demo-deployment"
export BASE_DIR=$(pwd)

# Check if container is already running
if docker ps --format "table {{.Names}}" | grep -q "^${IMAGE_NAME}$"; then
    echo "Container '${IMAGE_NAME}' is already running. Shelling into existing container..."
    docker exec -it $IMAGE_NAME /bin/bash ./docker-entrypoint.sh
else
    echo "Container '${IMAGE_NAME}' is not running. Building and starting new container..."

    # Build the image based on the Dockerfile, for this machine's architecture (no emulation)
    docker build -t $IMAGE_NAME -f Dockerfile .

    # Run the container
    # --network host: kind's kubeconfig points at 127.0.0.1 on the Docker host
    # The Docker socket: kind's nodes are containers, started on the laptop's Docker
    docker run --rm --name $IMAGE_NAME -ti \
    --network host \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v "$BASE_DIR":/app \
    -v "$BASE_DIR/../api-service":/api-service \
    -v "$BASE_DIR/../frontend-react":/frontend-react \
    $IMAGE_NAME
fi
