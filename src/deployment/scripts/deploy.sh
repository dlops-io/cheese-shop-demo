#!/usr/bin/env bash
# Build the production images, copy them into the cluster's nodes and apply k8s/1-in-memory.
#   ./scripts/deploy.sh
set -euo pipefail
cd "$(dirname -- "${BASH_SOURCE[0]}")/.."
cluster=cheese-shop
tag=v1
redis_image=redis:8.10.3-alpine

for service in api-service frontend-react; do
    docker build -t "cheese-shop-demo-${service}:${tag}" "/${service}"
    # No registry here: kind copies the image straight into every node
    kind load docker-image "cheese-shop-demo-${service}:${tag}" --name "${cluster}"
done

# Pull Redis onto every node now, so that the step that needs it downloads nothing. `kind load` can't
# do this one: it is a multi-architecture image, and Docker holds only this machine's half of it.
for node in $(kind get nodes --name "${cluster}"); do
    docker exec "${node}" crictl pull "${redis_image}"
done

kubectl apply -k k8s/1-in-memory
kubectl rollout restart deployment/api-service deployment/frontend-react # pick up rebuilt images
for deployment in api-service frontend-react; do
    kubectl rollout status "deployment/${deployment}" --timeout=120s
done

echo "Deployed: http://localhost:8080"
