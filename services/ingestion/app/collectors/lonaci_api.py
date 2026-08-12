"""Collecteur de l'API JSON publique de lotobonheur.ci.

Collecte respectueuse : robots.txt permissif (vérifié), User-Agent
identifiable, timeout, retries mesurés, délai entre requêtes en backfill.
Aucun contournement de protection.
"""

from __future__ import annotations

import time

import httpx
import structlog
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from app.core.settings import get_settings
from app.parsers.lonaci_api import ParseResult, parse_month

log = structlog.get_logger()

RESULTS_PATH = "/api/results"
ALL_DRAWS_FILTER = "Tous les tirages"


def _client() -> httpx.Client:
    s = get_settings()
    return httpx.Client(
        base_url=s.lonaci_api_base,
        headers={"User-Agent": s.collect_user_agent, "Accept": "application/json"},
        timeout=30.0,
    )


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=2, min=2, max=20),
    retry=retry_if_exception_type((httpx.TransportError, httpx.HTTPStatusError)),
    reraise=True,
)
def fetch_month(client: httpx.Client, month_year: str | None = None) -> dict:
    """Récupère un mois de résultats (mois courant si month_year est None)."""
    params = {}
    if month_year:
        params = {"monthYear": month_year, "drawType": ALL_DRAWS_FILTER}
    resp = client.get(RESULTS_PATH, params=params)
    resp.raise_for_status()
    return resp.json()


def collect_latest() -> tuple[ParseResult, dict]:
    """Mois courant. Retourne (résultat parsé, payload brut)."""
    with _client() as client:
        payload = fetch_month(client)
    return parse_month(payload), payload


def list_available_months() -> list[str]:
    """Liste 'monthYears' publiée par la source (ex. 'août 2026' … 'octobre 2020')."""
    with _client() as client:
        payload = fetch_month(client)
    return parse_month(payload).month_years


def collect_months(months: list[str], on_month) -> None:
    """Backfill : itère les mois demandés avec un délai de politesse.

    `on_month(month_year, parse_result | None, error | None)` est appelé
    après chaque mois — la persistance et la journalisation appartiennent
    à l'appelant (writer + runlog).
    """
    delay = get_settings().backfill_delay_seconds
    with _client() as client:
        for i, month_year in enumerate(months):
            if i > 0:
                time.sleep(delay)
            try:
                payload = fetch_month(client, month_year)
                on_month(month_year, parse_month(payload), None)
            except Exception as exc:  # noqa: BLE001 — remonté via on_month
                log.error("collect_month_failed", month=month_year, error=str(exc))
                on_month(month_year, None, exc)
