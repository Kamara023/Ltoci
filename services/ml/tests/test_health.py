"""Tests du health check et de l'authentification par token de service."""

import os

from fastapi.testclient import TestClient

import app.api.health as health_module
from app.main import app

client = TestClient(app)
TOKEN = os.environ["ML_SERVICE_TOKEN"]


def test_health_sans_token_retourne_401():
    resp = client.get("/internal/health")
    assert resp.status_code == 401


def test_health_avec_mauvais_token_retourne_401():
    resp = client.get("/internal/health", headers={"X-Internal-Token": "mauvais"})
    assert resp.status_code == 401


def test_health_ok_quand_db_up(monkeypatch):
    monkeypatch.setattr(health_module, "db_is_up", lambda: True)
    resp = client.get("/internal/health", headers={"X-Internal-Token": TOKEN})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["db"] == "up"
    assert body["version"]


def test_health_degrade_quand_db_down(monkeypatch):
    monkeypatch.setattr(health_module, "db_is_up", lambda: False)
    resp = client.get("/internal/health", headers={"X-Internal-Token": TOKEN})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "degraded"
    assert body["db"] == "down"
