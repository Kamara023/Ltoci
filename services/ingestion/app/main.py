"""Point d'entrée du service ingestion LotoStats (FastAPI).

Service INTERNE (X-Internal-Token) — collecte lotobonheur.ci, imports
CSV/Excel/JSON, journalisation ops.ingestion_runs/events.
Lancement dev :  uvicorn app.main:app --reload --port 8001
"""

from fastapi import FastAPI

from app.api.routes import router
from app.core.logging import configure_logging

configure_logging()

app = FastAPI(
    title="LotoStats Ingestion",
    description=(
        "Service interne d'ingestion des résultats de tirages. "
        "Collecte respectueuse des sources (robots.txt, User-Agent identifiable, "
        "délai entre requêtes) ; toute opération est journalisée."
    ),
    version="0.1.0",
    docs_url="/internal/docs",
    openapi_url="/internal/openapi.json",
)

app.include_router(router)
