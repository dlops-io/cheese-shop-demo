#!/usr/bin/env bash
# Rehearse the Kubernetes tutorial before class: delete the cluster, build a new one, run every step on
# it and check each result. Takes about 15 minutes, prints the numbers for the slides, and exits non-zero
# if a check failed. The overload step runs in docker compose and needs no rehearsal: 500 cheeses at
# 1.5 s each. Each 500-cheese run's timeline is kept in .local/ (seconds, queue, workers, CPU %).
#   ./scripts/verify.sh
set -uo pipefail
cd "$(dirname -- "${BASH_SOURCE[0]}")/.."
page=http://localhost:8080
timeline=$(mktemp)
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
# Sets done_s, more_s (first new pod), peak, settled_s and wrong (polls that failed or showed a
# different shop).
measure() { # measure <tickets> <floor> <keep watching for at least this many seconds>
    local count=$1 floor=$2 at_least=$3 start=$SECONDS first_pods now queued aging done_tickets workers reading
    first_pods=$(pods worker)
    done_s='' more_s='' settled_s='' peak=0 wrong=0
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
        if [[ -n "${done_s}" ]] && ((workers == floor && now >= at_least)); then
            settled_s=${now}
            # A worker told to stop can still get a ticket from the BLPOP it is in, so let it leave
            wait_until 30 pod_count_is worker "${floor}"
            return 0
        fi
        sleep 1
    done
}

step "Set up, before class"
./scripts/delete-cluster.sh
./scripts/create-cluster.sh || exit 1
./scripts/deploy.sh || exit 1
check "The page answers" curl -fsS -o /dev/null "${page}/"
check "The API answers through the page, with an empty shop" shop_is_empty

step "Run the shop on Kubernetes"
for app in frontend-react api-service redis worker; do
    wait_until 60 pod_count_is "${app}" 1 # deploy.sh restarts them, so an old pod may still be leaving
    check "One ${app} pod" pod_count_is "${app}" 1
done

measure 5 1 0
check "One worker ages five cheeses in about 8 s (${done_s:-?} s)" between "${done_s:-0}" 6 15

order 10
sleep 3
busy=$(pod_names worker)
kubectl delete pod --wait=false "${busy}" >/dev/null
wait_until 60 pod_count_is worker 1
ready worker
check "A deleted worker is replaced ($(pod_names worker))" [ "$(pod_names worker)" != "${busy}" ]
measure 0 1 0
check "Nothing was lost: the new worker finished the rest (${done_s:-never} s)" finished

kubectl scale deployment api-service --replicas=3 >/dev/null
ready api-service
wait_until 60 pod_count_is api-service 3
check "Three API pods" pod_count_is api-service 3
measure 20 1 0
check "Every poll showed the same shop, whichever API pod answered (20 in ${done_s:-?} s)" finished
check "No ticket number repeats" [ "$(shop | jq '[.ready[].id] | unique | length')" -eq "${ordered}" ]

step "Let Kubernetes add workers: the HPA on CPU"
sleep 45 # the time it takes to talk through it: an HPA applied sooner reads the last order's CPU
kubectl apply -f k8s/hpa.yaml >/dev/null
reading_from=$SECONDS
wait_until 120 cpu_has_a_reading
check "The HPA has a CPU reading after $((SECONDS - reading_from)) s" cpu_has_a_reading
check "It starts quiet: $(pods worker) pod at $(cpu)%" hpa_is_quiet

measure 500 1 75
awk -F'\t' 'BEGIN { print "time queue pods cpu" } $1 >= due { print $1, $2, $3, $4 "%"; due = $1 + 15 }' "${timeline}"
check "The first new worker arrived within a minute (${more_s:-never} s)" [ "${more_s:-99}" -le 60 ]
check "It reached 6 workers (${peak})" [ "${peak}" -eq 6 ]
check "All 500 finished in about 2.5 minutes, none lost (${done_s:-?} s)" finished
check "That is far faster than one worker's 750 s (${done_s:-?} s)" between "${done_s:-0}" 100 220
read -r low high from to < <(awk -F'\t' '$2 <= 300 && $2 >= 30 {
    if (!low || $4 < low) low = $4
    if ($4 > high) high = $4
    if (!from) from = $2
    to = $2
} END { print low + 0, high + 0, from + 0, to + 0 }' "${timeline}")
check "CPU stayed at its ceiling while the queue fell from ${from} to ${to} (${low}% to ${high}%)" \
    between "${low}" 450 520
check "It went back to one worker (${settled_s:-never} s)" [ -n "${settled_s}" ]
cp "${timeline}" .local/timeline-cpu.tsv
hpa_row="${more_s:--} ${peak} ${done_s:--} ${settled_s:--}"

step "Scale on the queue with KEDA"
refused=$(kubectl apply -f k8s/keda.yaml 2>&1)
check "KEDA is refused while our HPA exists" grep -q 'already managed by the hpa' <<<"${refused}"
kubectl delete -f k8s/hpa.yaml >/dev/null
kubectl apply -f k8s/keda.yaml >/dev/null
zero_from=$SECONDS
wait_until 120 workers_are 0
check "The worker goes to zero ($((SECONDS - zero_from)) s)" workers_are 0
check "KEDA made its own HPA" kubectl get hpa keda-hpa-worker -o name
check "The page shows no workers" [ "$(shop | jq .workers)" -eq 0 ]

measure 5 0 0
check "5 cheeses take one worker (${peak})" [ "${peak}" -eq 1 ]
check "They are ready in about 15 s, from no workers (${done_s:-?} s)" [ "${done_s:-99}" -le 25 ]

measure 500 0 0
awk -F'\t' 'BEGIN { print "time queue pods" } $1 >= due { print $1, $2, $3; due = $1 + 15 }' "${timeline}"
check "The first worker arrived within 15 s (${more_s:-never} s)" [ "${more_s:-99}" -le 15 ]
check "It reached 6 workers from zero (${peak})" [ "${peak}" -eq 6 ]
check "All 500 finished, none lost (${done_s:-?} s)" finished
check "It went back to zero workers (${settled_s:-never} s)" [ -n "${settled_s}" ]
cp "${timeline}" .local/timeline-keda.tsv
keda_row="${more_s:--} ${peak} ${done_s:--} ${settled_s:--}"

step "The whole shop at the end"
shop | jq -c '{queued: (.queued | length), aging: (.aging | length), ready: (.ready | length)}'
check "Every ticket is ready" [ "$(shop | jq '.ready | length')" -eq "${ordered}" ]
check "Nothing restarted" [ "$(restarts)" -eq 0 ]

printf '\n500 cheeses   %s  %s  %s  %s\n' 'first new worker s' 'peak' 'all ready s' 'settled s'
read -r a b c d <<<"${hpa_row}"
printf '%-12s %19s %5s %12s %10s\n' 'HPA on CPU' "${a}" "${b}" "${c}" "${d} (1 worker)"
read -r a b c d <<<"${keda_row}"
printf '%-12s %19s %5s %12s %10s\n' 'KEDA' "${a}" "${b}" "${c}" "${d} (0 workers)"
printf '%s passed, %s failed\n' "${passed}" "${failed}"
((failed == 0))
