from fastapi.testclient import TestClient

from api import service

client = TestClient(service.app)


def test_cheese_says_which_pod_answered():
    body = client.get("/api/cheese").json()
    assert body["cheese"] in service.CHEESES
    assert body["pod"] == service.POD
    assert body["version"] == "v1"


def test_each_answer_counts_up():
    first = client.get("/api/cheese").json()["served"]
    assert client.get("/api/work?ms=1").json()["served"] == first + 1


def test_work_is_bounded():
    assert client.get("/api/work?ms=0").status_code == 422
    assert client.get("/api/work?ms=1001").status_code == 422


def test_docs_are_served_under_api():
    assert client.get("/api/docs").status_code == 200


def test_probes(monkeypatch):
    assert client.get("/healthz").json() == {"ok": True}
    monkeypatch.setattr(service, "WARMUP_S", 3600)
    assert client.get("/readyz").status_code == 503
    monkeypatch.setattr(service, "WARMUP_S", 0)
    assert client.get("/readyz").status_code == 200
