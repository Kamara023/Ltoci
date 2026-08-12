"""Health check interne du service ML."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends

from app.core.db import db_is_up
from app.core.security import require_service_token

router = APIRouter(prefix="/internal", dependencies=[Depends(require_service_token)])

VERSION = "0.1.0"


@router.get("/health")
def health() -> dict:
    db_up = db_is_up()
    return {
        "status": "ok" if db_up else "degraded",
        "db": "up" if db_up else "down",
        "version": VERSION,
        "timestamp": datetime.now(UTC).isoformat(),
    }
