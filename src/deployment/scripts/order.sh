#!/usr/bin/env bash
# Order any number of cheeses. The API takes 50 at most, so this sends them 50 at a time.
#   ./scripts/order.sh 500
set -euo pipefail
left="${1:?How many cheeses?}"

while (( left > 0 )); do
    count=$(( left < 50 ? left : 50 ))
    curl -fsS -o /dev/null -X POST http://localhost:8080/api/orders \
        -H 'Content-Type: application/json' -d "{\"count\": ${count}}"
    left=$(( left - count ))
done

echo "Ordered $1 cheeses"
