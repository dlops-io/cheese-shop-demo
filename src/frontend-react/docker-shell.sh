#!/bin/bash

set -e

IMAGE_NAME="cheese-shop-demo-frontend-react"
HOST_PORT=5810

# Create the shared network if it does not exist yet.
docker network inspect cheese-shop-demo-network >/dev/null 2>&1 || docker network create cheese-shop-demo-network

if docker ps --format "{{.Names}}" | grep -qx "${IMAGE_NAME}"; then
    echo "Container '${IMAGE_NAME}' is already running. Shelling into it..."
    docker exec -it "$IMAGE_NAME" /bin/bash
else
    echo "Building ${IMAGE_NAME} (Dockerfile.dev)..."
    docker build -t "$IMAGE_NAME" -f Dockerfile.dev .

    # Run container
    docker run --rm --name "$IMAGE_NAME" -ti \
        -v "$(pwd)":/app \
        -v "${IMAGE_NAME}-node_modules:/app/node_modules" \
        -p "${HOST_PORT}:5173" \
        -e HOST_PORT="${HOST_PORT}" \
        --network cheese-shop-demo-network \
        "$IMAGE_NAME"
fi
