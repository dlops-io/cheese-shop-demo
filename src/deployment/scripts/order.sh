#!/usr/bin/env bash
# Order any number of cheeses. The API takes 50 at most, so this sends them 50 at a time.
#   ./scripts/order.sh 500                          the shop on the cluster
#   ./scripts/order.sh 500 http://localhost:5810    the shop in docker compose
set -euo pipefail
left="${1:?How many cheeses?}"
shop="${2:-http://localhost:8080}"

while (( left > 0 )); do
    count=$(( left < 50 ? left : 50 ))
    curl -fsS -o /dev/null -X POST "${shop}/api/orders" \
        -H 'Content-Type: application/json' -d "{\"count\": ${count}}"
    left=$(( left - count ))
done

echo "Ordered $1 cheeses"
