"""Cheese Shop API, with the shop in Redis: any number of copies can run, because none of them keeps it.

    POST /api/orders       order some cheeses
    GET  /api/orders       every ticket in the shop (the page polls this)
    GET  /api/orders/{id}  one ticket
    GET  /api/docs         FastAPI's interactive docs

The same routes and JSON as service.py. Compare them: `diff api/service.py api/service_redis.py`
The workers moved out too: they are their own pods now, in worker.py.
"""

import json
import os
import random

import redis.asyncio as redis
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

AGE_S = 1.5
CHEESES = ["Baby brie", "Blue stilton", "Golden comté", "Nutty gruyère", "Sharp cheddar", "Smoky gouda"]

db = redis.Redis(host=os.getenv("REDIS_HOST", "redis"), decode_responses=True)

app = FastAPI(title="Cheese Shop API", docs_url="/api/docs", openapi_url="/api/openapi.json")


class Order(BaseModel):
    count: int = Field(ge=1, le=50)  # anything else is answered with 422


@app.post("/api/orders", status_code=201)
async def place_order(order: Order):
    new_tickets = []
    for _ in range(order.count):
        ticket_id = await db.incr("next_id")  # one counter for every copy of the API
        ticket = {"id": ticket_id, "name": random.choice(CHEESES), "state": "queued", "worker": None}
        await db.hset("tickets", ticket_id, json.dumps(ticket))
        await db.rpush("queue", ticket_id)
        new_tickets.append(ticket)
    return new_tickets


@app.get("/api/orders")
async def list_orders():
    shop = {"workers": 0, "age_s": AGE_S, "queued": [], "aging": [], "ready": []}
    tickets = [json.loads(ticket) for ticket in await db.hvals("tickets")]
    for ticket in sorted(tickets, key=lambda ticket: ticket["id"]):  # Redis keeps no order in a hash
        shop[ticket["state"]].append(ticket)
    shop["workers"] = len({ticket["worker"] for ticket in shop["aging"]})
    return shop


@app.get("/api/orders/{ticket_id}")
async def get_order(ticket_id: int):
    ticket = await db.hget("tickets", ticket_id)
    if ticket is None:
        raise HTTPException(404, "No such ticket")
    return json.loads(ticket)
