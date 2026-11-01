#!/usr/bin/env bash
# Rehearse Part 2 before class: delete the cluster, build a new one, run all four steps and check each
# result. Takes about 20 minutes, prints the numbers for the slide, and exits non-zero if a check failed.
#   ./scripts/verify.sh
set -uo pipefail
cd "$(dirname -- "${BASH_SOURCE[0]}")/.."
export KUBECONFIG="${KUBECONFIG:-/app/.local/kubeconfig}"
page=http://localhost:8080
timeline=$(mktemp)
results=$(mktemp)
passed=0
failed=0
ordered=0 # the tickets the shop should be holding

step() { printf '\n=== %s\n' "$*"; }

check() { # check "what should be true" <command>
    local claim=$1
    shift
    if "$@" >/dev/null; then
        passed=$((passed + 1))
        echo "PASS  ${claim}"
    else
        failed=$((failed + 1))
        echo "FAIL  ${claim}"
    fi
}

wait_until() { # wait_until <seconds> <command>
    local deadline=$((SECONDS + $1))
    shift
    until "$@" 2>/dev/null; do
        ((SECONDS < deadline)) || return 1
        sleep 1
    done
}

between() { (($1 >= $2 && $1 <= $3)); }
finished() { [[ -n "${done_s}" ]] && ((wrong == 0)); } # after measure: every ticket ready, every poll right

shop() { curl -fsS "${page}/api/orders"; }
tickets() { jq '[.queued, .aging, .ready] | map(length) | add'; }
shop_is_empty() { [[ "$(shop | tickets)" == 0 ]]; }

pods() { # how many pods a Deployment has
    local count
    count=$(kubectl get deployment "$1" -o jsonpath='{.status.replicas}')
    echo "${count:-0}"
}
pod_names() { kubectl get pods -l "app=$1" -o jsonpath='{.items[*].metadata.name}'; }
pod_count_is() { [[ "$(kubectl get pods -l "app=$1" --no-headers | wc -l)" -eq $2 ]]; }
pod_shop() { kubectl get --raw "/api/v1/namespaces/cheese-shop/pods/$1:9000/proxy/api/orders"; }
restarts() {
    kubectl get pods -o jsonpath='{.items[*].status.containerStatuses[*].restartCount}' |
        tr ' ' '\n' | awk '{ sum += $1 } END { print sum + 0 }'
}
ready() {
    local deployment
    for deployment in "$@"; do
        kubectl rollout status "deployment/${deployment}" --timeout=120s >/dev/null
    done
}

cpu() { kubectl get hpa worker -o jsonpath='{.status.currentMetrics[0].resource.current.averageUtilization}' 2>/dev/null; }
cpu_has_a_reading() { [[ -n "$(cpu)" ]]; }
workers_are() { [[ "$(pods worker)" -eq $1 ]]; }
hpa_is_quiet() { (($(cpu) < 60)) && pod_count_is worker 1; }

order() {
    ./scripts/order.sh "$1" >/dev/null
    ordered=$((ordered + $1))
}

# Order, then sample once a second until every ticket is ready and the workers are back to <floor>.
# Sets done_s, more_s (first new pod), peak, settled_s, wrong (polls that failed or showed a different
# shop) and last_high_s (last CPU reading over the target).
measure() { # measure <tickets> <floor> <keep watching for at least this many seconds>
    local count=$1 floor=$2 at_least=$3 start=$SECONDS first_pods now queued aging done_tickets workers reading
    first_pods=$(pods worker)
    done_s='' more_s='' settled_s='' last_high_s='' peak=0 wrong=0
    : >"${timeline}"
    ((count == 0)) || order "${count}"

    while ((SECONDS - start < 480)); do
        now=$((SECONDS - start))
        read -r queued aging done_tickets < <(shop | jq -r '[(.queued, .aging, .ready) | length] | @tsv')
        workers=$(pods worker)
        reading=$(cpu)
        if [[ -z "${queued:-}" ]] || ((queued + aging + done_tickets != ordered)); then
            wrong=$((wrong + 1))
        else
            printf '%s\t%s\t%s\t%s\n' "${now}" "${queued}" "${workers}" "${reading:-0}" >>"${timeline}"
            [[ -z "${done_s}" ]] && ((done_tickets == ordered)) && done_s=${now}
        fi
        ((workers > peak)) && peak=${workers}
        [[ -z "${more_s}" ]] && ((workers > first_pods)) && more_s=${now}
        ((${reading:-0} >= 60)) && last_high_s=${now}
        if [[ -n "${done_s}" ]] && ((workers == floor && now >= at_least)); then
            settled_s=${now}
            # A worker told to stop can still get a ticket from the BLPOP it is in, so let it leave
            wait_until 30 pod_count_is worker "${floor}"
            return 0
        fi
        sleep 1
    done
}

row() { # row <autoscaler> <tickets>
    printf '%-6s %8s %8s %12s %6s %12s\n' "$1" "$2" "${done_s:--}" "${more_s:--}" "${peak}" "${settled_s:--}" >>"${results}"
}

step "Set up a clean cluster"
./scripts/delete-cluster.sh
./scripts/create-cluster.sh || exit 1
./scripts/install-keda.sh || exit 1
./scripts/deploy.sh || exit 1
check "The page answers" curl -fsS -o /dev/null "${page}/"
check "The API answers through the page, with an empty shop" shop_is_empty

step "Step 1: scale the app as it is"
wait_until 60 pod_count_is api-service 1 # deploy.sh restarts it, so the old pod may still be leaving
check "One API pod" pod_count_is api-service 1
kubectl scale deployment api-service --replicas=3 >/dev/null
ready api-service
wait_until 60 pod_count_is api-service 3
for _ in 1 2 3 4 5 6; do order 50; done

count_per_pod() {
    local pod
    for pod in $(pod_names api-service); do
        printf '%s %s\n' "$(pod_shop "${pod}" | tickets)" "${pod}"
    done | sort -n
}
before=$(count_per_pod)
echo "${before}"
total_before=$(awk '{ sum += $1 } END { print sum }' <<<"${before}")
holding=$(awk '$1 > 0' <<<"${before}" | wc -l)
check "All 300 tickets are in pods (got ${total_before})" [ "${total_before}" -eq 300 ]
check "Tickets are spread over more than one pod (${holding})" [ "${holding}" -ge 2 ]

seen=$(for _ in {1..20}; do shop | tickets; done | sort -nu | tr '\n' ' ')
check "20 polls of the page saw different shops (${seen})" [ "$(wc -w <<<"${seen}")" -ge 2 ]

read -r busiest busiest_pod <<<"$(tail -1 <<<"${before}")"
kubectl delete pod "${busiest_pod}" >/dev/null
ready api-service
after=$(count_per_pod)
echo "${after}"
total_after=$(awk '{ sum += $1 } END { print sum }' <<<"${after}")
check "Deleting a pod lost its ${busiest} tickets for good (${total_before} to ${total_after})" \
    [ "${total_after}" -eq $((total_before - busiest)) ]
check "Its replacement started empty" [ "$(head -1 <<<"${after}" | cut -d' ' -f1)" -eq 0 ]

step "Step 2: move the shop into Redis"
polls=$(mktemp)
(while :; do
    curl -s -o /dev/null -w '%{http_code}\n' "${page}/api/orders"
    sleep 0.5
done) >"${polls}" &
poller=$!
kubectl apply -k k8s/2-redis >/dev/null
ready redis api-service worker
wait_until 60 pod_count_is api-service 3
kill "${poller}"
wait "${poller}" 2>/dev/null
check "No poll failed during the switch ($(wc -l <"${polls}") polls)" [ "$(grep -cv '^200$' "${polls}")" -eq 0 ]
ordered=0
wait_until 30 shop_is_empty
check "The old tickets are gone" shop_is_empty
check "The API kept its 3 pods" pod_count_is api-service 3

measure 20 1 0
check "One worker ages about one cheese every 1.5 s (20 in ${done_s:-?} s)" between "${done_s:-0}" 27 36
check "Every poll showed the same shop" [ "${wrong}" -eq 0 ]
check "No ticket number repeats" [ "$(shop | jq '[.ready[].id] | unique | length')" -eq "${ordered}" ]

kubectl scale deployment worker --replicas=3 >/dev/null
ready worker
first_id=${ordered}
measure 30 3 0
check "Three workers age 30 in about 16 s (${done_s:-?} s)" [ "${done_s:-99}" -le 22 ]
colours=$(shop | jq --argjson after "${first_id}" '[.ready[] | select(.id > $after) | .worker] | unique | length')
check "All three workers took tickets (${colours})" [ "${colours}" -eq 3 ]

order 30
sleep 2
kubectl delete pod --wait=false "$(pod_names worker | cut -d' ' -f1)" "$(pod_names api-service | cut -d' ' -f1)" >/dev/null
measure 0 3 0
check "Deleting a busy worker and an API pod lost nothing (${done_s:-never} s)" [ -n "${done_s}" ]
check "No poll failed while they were replaced" [ "${wrong}" -eq 0 ]

kubectl delete pod -l app=redis >/dev/null
ready redis
ordered=0
wait_until 60 shop_is_empty
check "Deleting Redis emptied the shop" shop_is_empty
measure 5 3 0
check "The shop works again without help (${done_s:-never} s)" [ -n "${done_s}" ]
check "Nothing restarted" [ "$(restarts)" -eq 0 ]

step "Step 3: let an HPA scale on CPU"
kubectl scale deployment worker --replicas=1 >/dev/null
wait_until 60 pod_count_is worker 1
sleep 45 # the time it takes to talk through it: an HPA applied sooner reads step 2's CPU and jumps to 5 pods
kubectl apply -f k8s/3-hpa.yaml >/dev/null
reading_from=$SECONDS
wait_until 120 cpu_has_a_reading
check "The HPA has a CPU reading after $((SECONDS - reading_from)) s" cpu_has_a_reading
check "It starts quiet: $(pods worker) pod at $(cpu)%" hpa_is_quiet

measure 5 1 75
row HPA 5
check "One worker finishes five cheeses (${done_s:-?} s)" between "${done_s:-0}" 7 15
check "New pods arrive after the work is done (done ${done_s:-?} s, pods ${more_s:-never} s)" \
    [ "${more_s:-0}" -gt "${done_s:-99}" ]
check "It is back to one pod" workers_are 1

measure 20 1 75
row HPA 20
check "20 tickets finished, none lost (${done_s:-?} s)" finished

measure 500 1 75
row HPA 500
awk -F'\t' 'BEGIN { print "time queue pods cpu" } $1 >= due { print $1, $2, $3, $4 "%"; due = $1 + 15 }' "${timeline}"
check "It reached 6 pods (${peak})" [ "${peak}" -eq 6 ]
check "All 500 finished, none lost (${done_s:-?} s)" finished
read -r low high from to < <(awk -F'\t' '$2 <= 300 && $2 >= 30 {
    if (!low || $4 < low) low = $4
    if ($4 > high) high = $4
    if (!from) from = $2
    to = $2
} END { print low + 0, high + 0, from + 0, to + 0 }' "${timeline}")
check "CPU stayed at its ceiling while the queue fell from ${from} to ${to} (lowest ${low}%)" [ "${low}" -ge 450 ]
check "CPU could not read higher (highest ${high}%)" [ "${high}" -le 520 ]
check "CPU stayed high after the queue emptied (${last_high_s:-?} s against ${done_s:-?} s)" \
    [ "${last_high_s:-0}" -gt "${done_s:-99}" ]
check "It went back to one pod (${settled_s:-never} s)" [ -n "${settled_s}" ]

step "Step 4: scale on the queue with KEDA"
refused=$(kubectl apply -f k8s/4-keda.yaml 2>&1)
check "KEDA is refused while the HPA exists" grep -q 'already managed by the hpa' <<<"${refused}"
kubectl delete -f k8s/3-hpa.yaml >/dev/null
kubectl apply -f k8s/4-keda.yaml >/dev/null
zero_from=$SECONDS
wait_until 120 workers_are 0
check "The worker goes to zero ($((SECONDS - zero_from)) s)" workers_are 0
check "KEDA made its own HPA" kubectl get hpa keda-hpa-worker -o name
check "The page shows no workers" [ "$(shop | jq .workers)" -eq 0 ]

measure 5 0 0
row KEDA 5
check "5 tickets take 1 pod (${peak})" [ "${peak}" -eq 1 ]
check "They finish in about 15 s (${done_s:-?} s)" [ "${done_s:-99}" -le 25 ]

measure 20 0 0
row KEDA 20
check "20 tickets take more than one pod (${peak})" between "${peak}" 2 6
check "They finish faster than one worker could from zero (${done_s:-?} s)" [ "${done_s:-99}" -le 33 ]

measure 500 0 0
row KEDA 500
awk -F'\t' 'BEGIN { print "time queue pods" } $1 >= due { print $1, $2, $3; due = $1 + 15 }' "${timeline}"
check "It reached 6 pods from zero (${peak})" [ "${peak}" -eq 6 ]
check "All 500 finished, none lost (${done_s:-?} s)" finished
check "It went back to zero (${settled_s:-never} s)" [ -n "${settled_s}" ]

step "The whole shop at the end"
shop | jq -c '{queued: (.queued | length), aging: (.aging | length), ready: (.ready | length)}'
check "Every ticket is ready" [ "$(shop | jq '.ready | length')" -eq "${ordered}" ]
check "Nothing restarted" [ "$(restarts)" -eq 0 ]

printf '\n%-6s %8s %8s %12s %6s %12s\n' scaler tickets 'done s' 'new pod s' peak 'floor s'
cat "${results}"
printf '\n%s passed, %s failed\n' "${passed}" "${failed}"
((failed == 0))
