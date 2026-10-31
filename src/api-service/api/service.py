"""Cheese Hello API: the smallest service that shows which pod answered you.

    GET /api/cheese   a random cheese, and the pod that served it
    GET /api/work     burn some CPU, so we can watch the autoscaler react
    GET /api/docs     FastAPI's interactive docs
    GET /healthz      liveness: the process is up
    GET /readyz       readiness: past the warm-up

App routes live under /api because the dev proxy and nginx forward the full path, so the API serves
exactly the paths the browser asks for. The probes stay at the root, where the kubelet asks for them.
"""

import itertools
import os
import random
import socket
import time

from fastapi import APIRouter, FastAPI, HTTPException, Query

POD = socket.gethostname()  # the container id in Docker, the pod name in Kubernetes
VERSION = os.getenv("VERSION", "v1")  # changing it is enough to trigger a rolling update
WARMUP_S = float(os.getenv("WARMUP_S", "2"))  # how long a new pod stays "not ready"

STARTED_AT = time.monotonic()
CHEESES = ["Brie", "Camembert", "Cheddar", "Comté", "Gorgonzola", "Gouda", "Gruyère", "Manchego", "Parmesan"]

# Kept in this process's memory on purpose: every pod counts on its own, and a restart starts from
# zero. That is why an app that scales keeps its real state outside the pod.
served = itertools.count(1)

router = APIRouter(prefix="/api")


def answer() -> dict:
    return {"pod": POD, "version": VERSION, "served": next(served)}


@router.get("/cheese")
def cheese():
    return {"cheese": random.choice(CHEESES), **answer()}


@router.get("/work")
def work(ms: int = Query(100, ge=1, le=1000)):
    # A plain `def`, so FastAPI runs this blocking loop in a thread and the probes keep answering.
    # It burns a fixed amount of CPU time: when the pod has too little CPU, requests simply take longer.
    end = time.thread_time() + ms / 1000
    while time.thread_time() < end:
        sum(range(1000))
    return answer()


app = FastAPI(title="Cheese Hello API", docs_url="/api/docs", openapi_url="/api/openapi.json")
app.include_router(router)


@app.get("/healthz")
def healthz():
    return {"ok": True}


@app.get("/readyz")
def readyz():
    if time.monotonic() - STARTED_AT < WARMUP_S:
        raise HTTPException(503, "warming up")
    return {"ok": True}
