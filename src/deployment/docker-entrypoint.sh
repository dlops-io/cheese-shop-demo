#!/bin/bash

echo "Container is running!!!"
echo "Architecture: $(uname -m)"
echo "kubectl $(kubectl version --client 2>/dev/null | head -1), $(kind version)"
docker info >/dev/null 2>&1 || echo "WARNING: cannot reach Docker through /var/run/docker.sock"

# The kind cluster's kubeconfig stays in the ignored .local/
mkdir -p /app/.local
export KUBECONFIG=/app/.local/kubeconfig

# Run Bash for interactive mode, or the given script
if [[ $# -eq 0 ]]; then
    echo -en "\033[92m
The following commands are available:
    ./scripts/create-cluster.sh
        Create the local cluster: 1 control plane and 2 workers, with metrics-server and KEDA
    ./scripts/deploy.sh
        Build the images, load them into the cluster and start the shop: http://localhost:8080
    ./scripts/order.sh 500
        Order any number of cheeses (add http://localhost:5810 for the shop in docker compose)
    ./scripts/verify.sh
        Rehearse the Kubernetes tutorial on a new cluster, about 15 minutes (it deletes the one you have)
    ./scripts/delete-cluster.sh
        Delete the cluster
\033[0m
"
    exec /bin/bash
else
    exec /bin/bash "$@"
fi
