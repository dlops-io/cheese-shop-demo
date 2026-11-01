#!/usr/bin/env bash
# Add KEDA, which scales pods on an outside signal such as queue length. Safe to run twice.
set -euo pipefail
keda=2.21.0
export KUBECONFIG="${KUBECONFIG:-/app/.local/kubeconfig}"

# --server-side: KEDA's CRDs are too large for a normal apply
kubectl apply --server-side -f "https://github.com/kedacore/keda/releases/download/v${keda}/keda-${keda}.yaml"
for deployment in keda-operator keda-metrics-apiserver keda-admission; do
    kubectl -n keda rollout status "deployment/${deployment}" --timeout=240s
done
kubectl wait --for=condition=Available apiservice/v1beta1.external.metrics.k8s.io --timeout=120s
