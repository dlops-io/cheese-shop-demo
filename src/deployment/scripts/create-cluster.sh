#!/usr/bin/env bash
# Create the local cluster and everything autoscaling needs.
set -euo pipefail
cd "$(dirname -- "${BASH_SOURCE[0]}")/.."
metrics_server=v0.9.1
keda=2.21.0

kind create cluster --name cheese-shop --config kind.yaml --wait 180s

# metrics-server measures pod CPU for the autoscaler. kind's kubelets use self-signed certificates,
# which is what --kubelet-insecure-tls is for; a real cluster does not need it.
kubectl apply -f "https://github.com/kubernetes-sigs/metrics-server/releases/download/${metrics_server}/components.yaml"
kubectl -n kube-system patch deployment metrics-server --type=json \
    -p '[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'
kubectl -n kube-system rollout status deployment/metrics-server --timeout=180s

# KEDA scales pods on an outside signal, here the length of the queue in Redis.
# --server-side: KEDA's CRDs are too large for a normal apply.
kubectl apply --server-side -f "https://github.com/kedacore/keda/releases/download/v${keda}/keda-${keda}.yaml"
for deployment in keda-operator keda-metrics-apiserver keda-admission; do
    kubectl -n keda rollout status "deployment/${deployment}" --timeout=240s
done
kubectl wait --for=condition=Available apiservice/v1beta1.external.metrics.k8s.io --timeout=120s

# Every kubectl command in the tutorial works on this namespace
kubectl apply -f k8s/namespace.yaml
kubectl config set-context --current --namespace=cheese-shop

kubectl get nodes
