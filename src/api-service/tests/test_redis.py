import fakeredis
import pytest
from fastapi.testclient import TestClient

from api import service_redis, worker


@pytest.fixture
def client(monkeypatch):
    server = fakeredis.FakeServer()  # the API and the worker share it, as they share Redis
    monkeypatch.setattr(service_redis, "db", fakeredis.FakeAsyncRedis(server=server, decode_responses=True))
    monkeypatch.setattr(worker, "db", fakeredis.FakeRedis(server=server, decode_responses=True))
    monkeypatch.setattr(worker, "CPU_S", 0.001)
    monkeypatch.setattr(worker, "POD", "worker-abc12")
    monkeypatch.setattr(worker, "stopping", False)
    with TestClient(service_redis.app) as client:
        yield client


def test_an_order_creates_tickets_in_the_queue(client):
    response = client.post("/api/orders", json={"count": 3})
    assert response.status_code == 201
    assert [ticket["id"] for ticket in response.json()] == [1, 2, 3]
    assert len(client.get("/api/orders").json()["queued"]) == 3


def test_the_json_matches_the_in_memory_api(client):
    client.post("/api/orders", json={"count": 1})
    shop = client.get("/api/orders").json()
    assert set(shop) == {"workers", "age_s", "queued", "aging", "ready"}
    assert set(shop["queued"][0]) == {"id", "name", "state", "worker"}


def test_one_ticket_and_a_missing_one(client):
    client.post("/api/orders", json={"count": 1})
    assert client.get("/api/orders/1").json()["state"] == "queued"
    response = client.get("/api/orders/9999")
    assert response.status_code == 404
    assert response.json()["detail"] == "No such ticket"


def test_tickets_come_back_in_order_however_redis_keeps_them(client):
    # Real Redis shuffles a large hash; this fake keeps insertion order, so store them backwards
    for ticket_id in (3, 2, 1):
        ticket = {"id": ticket_id, "name": "Baby brie", "state": "queued", "worker": None}
        worker.save(ticket)
    assert [ticket["id"] for ticket in client.get("/api/orders").json()["queued"]] == [1, 2, 3]


def test_a_worker_ages_the_oldest_ticket_and_signs_it(client):
    client.post("/api/orders", json={"count": 2})
    worker.age_one()
    shop = client.get("/api/orders").json()
    assert [ticket["id"] for ticket in shop["ready"]] == [1]
    assert shop["ready"][0]["worker"] == "worker-abc12"
    assert [ticket["id"] for ticket in shop["queued"]] == [2]


def test_the_shop_counts_workers_that_are_aging_a_cheese(client, monkeypatch):
    client.post("/api/orders", json={"count": 1})
    seen = []
    monkeypatch.setattr(worker, "burn_cpu", lambda seconds: seen.append(client.get("/api/orders").json()))
    worker.age_one()
    assert seen[0]["workers"] == 1
    assert seen[0]["aging"][0]["worker"] == "worker-abc12"
    assert client.get("/api/orders").json()["workers"] == 0


def test_a_stopping_worker_finishes_its_cheese_and_takes_no_more(client, monkeypatch):
    client.post("/api/orders", json={"count": 2})
    monkeypatch.setattr(worker, "burn_cpu", lambda seconds: worker.stop(None, None))  # SIGTERM, mid-cheese
    worker.main()
    shop = client.get("/api/orders").json()
    assert [ticket["id"] for ticket in shop["ready"]] == [1]
    assert [ticket["id"] for ticket in shop["queued"]] == [2]
