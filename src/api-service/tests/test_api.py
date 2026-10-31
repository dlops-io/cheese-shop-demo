import asyncio
import time

import pytest
from fastapi.testclient import TestClient

from api import service


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(service, "AGE_S", 0.05)
    monkeypatch.setattr(service, "queue", asyncio.Queue())
    service.tickets.clear()
    with TestClient(service.app) as client:  # `with` runs the lifespan, which starts the workers
        yield client


def wait_until_ready(client, count):
    for _ in range(100):
        if len(client.get("/api/orders").json()["ready"]) == count:
            return
        time.sleep(0.01)
    raise AssertionError("the cheeses never got ready")


def test_an_order_creates_tickets_in_the_queue(client):
    response = client.post("/api/orders", json={"count": 3})
    assert response.status_code == 201
    assert [ticket["id"] for ticket in response.json()] == [1, 2, 3]


@pytest.mark.parametrize("count", [0, 51, "lots"])
def test_a_bad_order_is_refused(client, count):
    assert client.post("/api/orders", json={"count": count}).status_code == 422


def test_workers_age_every_cheese(client):
    client.post("/api/orders", json={"count": 5})
    wait_until_ready(client, 5)
    shop = client.get("/api/orders").json()
    assert shop["queued"] == shop["aging"] == []
    assert {ticket["worker"] for ticket in shop["ready"]} == {"worker-1", "worker-2"}


def test_only_as_many_cheeses_age_as_there_are_workers(client):
    client.post("/api/orders", json={"count": 6})
    assert len(client.get("/api/orders").json()["aging"]) <= service.WORKERS


def test_one_ticket(client):
    client.post("/api/orders", json={"count": 1})
    assert client.get("/api/orders/1").json()["id"] == 1
    assert client.get("/api/orders/2").status_code == 404


def test_docs_are_served_under_api(client):
    assert client.get("/api/docs").status_code == 200
