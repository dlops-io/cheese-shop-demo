"""A worker: take a ticket from the queue, age the cheese, repeat.

It ages one cheese at a time, so to age more at once, run more pods. Aging burns real CPU here, unlike
the `await asyncio.sleep` in service.py, because CPU is what the autoscaler measures.

    python -m api.worker
"""

import json
import os
import signal
import socket
import time

import redis

CPU_S = 0.75  # of CPU time per cheese: about 1.5 s on the clock, at the pod's limit of half a CPU
POD = socket.gethostname()  # the pod's name in Kubernetes

db = redis.Redis(host=os.getenv("REDIS_HOST", "redis"), decode_responses=True)
stopping = False


def stop(signum, frame):
    global stopping
    stopping = True


def burn_cpu(seconds):
    # Counts CPU time, not clock time: a pod short of CPU takes longer, as a real workload would
    end = time.thread_time() + seconds
    while time.thread_time() < end:
        sum(range(1000))


def save(ticket):
    db.hset("tickets", ticket["id"], json.dumps(ticket))


def age_one():
    """Age one cheese, if a ticket arrives within a second."""
    item = db.blpop("queue", timeout=1)  # the timeout lets the loop below notice `stopping`
    if item is None:
        return
    ticket = json.loads(db.hget("tickets", item[1]))
    save(ticket | {"state": "aging", "worker": POD})
    burn_cpu(CPU_S)
    save(ticket | {"state": "ready", "worker": POD})
    print(f"Aged #{ticket['id']}")


def main():
    # Kubernetes sends SIGTERM to remove a pod, even mid-cheese. Finish that cheese, then take no more
    signal.signal(signal.SIGTERM, stop)
    while not stopping:
        age_one()


if __name__ == "__main__":
    main()
