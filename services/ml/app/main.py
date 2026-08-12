"""Point d'entrée du service ML LotoStats (FastAPI).

Service INTERNE : accessible uniquement depuis l'API Node via le réseau
privé, authentifié par token de service (X-Internal-Token).
Lancement dev :  uvicorn app.main:app --reload --port 8000
"""

from fastapi import FastAPI

from app.api.health import router as health_router
from app.api.statistics import router as statistics_router
from app.core.logging import configure_logging

configure_logging()

app = FastAPI(
    title="LotoStats ML",
    description=(
        "Service interne de calcul statistique et ML. "
        "Les tirages de loterie sont aléatoires et indépendants : aucun résultat "
        "produit par ce service ne constitue une prédiction."
    ),
    version="0.1.0",
    docs_url="/internal/docs",
    openapi_url="/internal/openapi.json",
)

app.include_router(health_router)
app.include_router(statistics_router)
