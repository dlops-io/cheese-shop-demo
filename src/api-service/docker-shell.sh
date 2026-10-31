#!/bin/bash

set -e

export IMAGE_NAME="cheese-shop-demo-api-service"
export CONTAINER_NAME=$IMAGE_NAME
export HOST_PORT=9810

# Create the shared network if it does not exist yet.
docker network inspect cheese-shop-demo-network >/dev/null 2>&1 || docker network create cheese-shop-demo-network

if docker ps --format "{{.Names}}" | grep -qx "${CONTAINER_NAME}"; then
    echo "Container '${CONTAINER_NAME}' is already running. Shelling into it..."
    docker exec -it "$CONTAINER_NAME" /bin/bash
else
    echo "Building ${IMAGE_NAME} (Dockerfile.dev)..."
    docker build -t "$IMAGE_NAME" -f Dockerfile.dev .

    # Run container
    docker run --rm --name "$CONTAINER_NAME" -ti \
        -v "$(pwd)":/app \
        -v "${IMAGE_NAME}-uv-cache:/home/app/.cache/uv" \
        -p "${HOST_PORT}:9000" \
        -e HOST_PORT="${HOST_PORT}" \
        --network cheese-shop-demo-network \
        --network-alias api-service \
        "$IMAGE_NAME"
fi
