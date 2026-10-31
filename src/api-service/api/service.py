"""Cheese Shop API: order cheeses, and workers age them one at a time.

    POST /api/orders       order some cheeses
    GET  /api/orders       every ticket in the shop (the page polls this)
    GET  /api/orders/{id}  one ticket
    GET  /api/docs         FastAPI's interactive docs

Routes live under /api because the dev proxy and nginx forward the full path.
The shop lives in this process's memory, so restarting the API empties it.
"""

import asyncio
import random
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

WORKERS = 2
AGE_S = 1.5
CHEESES = ["Baby brie", "Blue stilton", "Golden comté", "Nutty gruyère", "Sharp cheddar", "Smoky gouda"]

tickets = {}  # id -> ticket
queue = asyncio.Queue()  # tickets waiting for a worker


async def worker(name):
    while True:
        ticket = await queue.get()  # wait here until a ticket arrives
        ticket.update(state="aging", worker=name)
        await asyncio.sleep(AGE_S)  # `await` lets the API keep answering while this cheese ages
        ticket["state"] = "ready"


@asynccontextmanager
async def lifespan(app):
    workers = [asyncio.create_task(worker(f"worker-{n + 1}")) for n in range(WORKERS)]
    yield
    for task in workers:
        task.cancel()


app = FastAPI(
    title="Cheese Shop API", lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json"
)


class Order(BaseModel):
    count: int = Field(ge=1, le=50)  # anything else is answered with 422


@app.post("/api/orders", status_code=201)
async def place_order(order: Order):
    new_tickets = []
    for _ in range(order.count):
        ticket = {"id": len(tickets) + 1, "name": random.choice(CHEESES), "state": "queued", "worker": None}
        tickets[ticket["id"]] = ticket
        queue.put_nowait(ticket)
        new_tickets.append(ticket)
    return new_tickets


@app.get("/api/orders")
async def list_orders():
    shop = {"workers": WORKERS, "age_s": AGE_S, "queued": [], "aging": [], "ready": []}
    for ticket in tickets.values():
        shop[ticket["state"]].append(ticket)
    return shop


@app.get("/api/orders/{ticket_id}")
async def get_order(ticket_id: int):
    if ticket_id not in tickets:
        raise HTTPException(404, "No such ticket")
    return tickets[ticket_id]
