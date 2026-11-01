#!/usr/bin/env bash
# Build the production images, copy them into the cluster's nodes and apply k8s/1-in-memory.
#   ./scripts/deploy.sh
set -euo pipefail
cd "$(dirname -- "${BASH_SOURCE[0]}")/.."
cluster=cheese-shop
tag=v1
export KUBECONFIG="${KUBECONFIG:-/app/.local/kubeconfig}"

for service in api-service frontend-react; do
    docker build -t "cheese-shop-demo-${service}:${tag}" "/${service}"
    # No registry here: kind copies the image straight into every node
    kind load docker-image "cheese-shop-demo-${service}:${tag}" --name "${cluster}"
done

kubectl apply -k k8s/1-in-memory
kubectl rollout restart deployment/api-service deployment/frontend-react # pick up rebuilt images
for deployment in api-service frontend-react; do
    kubectl rollout status "deployment/${deployment}" --timeout=120s
done

echo "Deployed: http://localhost:8080"
