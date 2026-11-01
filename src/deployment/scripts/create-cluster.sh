#!/usr/bin/env bash
# Create the local cluster and everything autoscaling needs. Safe to run twice.
set -euo pipefail
cd "$(dirname -- "${BASH_SOURCE[0]}")/.."
cluster=cheese-shop
metrics_server=v0.9.1
export KUBECONFIG="${KUBECONFIG:-/app/.local/kubeconfig}"

if kind get clusters | grep -qx "${cluster}"; then
    kind export kubeconfig --name "${cluster}"
else
    kind create cluster --name "${cluster}" --config kind.yaml --wait 180s
fi

# metrics-server measures pod CPU for the autoscaler. kind's kubelets use self-signed certificates,
# which is what --kubelet-insecure-tls is for; a real cluster does not need it.
kubectl apply -f "https://github.com/kubernetes-sigs/metrics-server/releases/download/${metrics_server}/components.yaml"
if ! kubectl -n kube-system get deployment metrics-server -o yaml | grep -q -- --kubelet-insecure-tls; then
    kubectl -n kube-system patch deployment metrics-server --type=json \
        -p '[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'
fi
kubectl -n kube-system rollout status deployment/metrics-server --timeout=180s

# Every kubectl command in the tutorial works on this namespace
kubectl apply -f k8s/namespace.yaml
kubectl config set-context --current --namespace=cheese-shop

kubectl get nodes
