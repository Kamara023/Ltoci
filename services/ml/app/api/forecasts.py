"""Routes internes des prévisions TOP 5."""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select

from app.core.db import db_is_up, get_engine, table
from app.core.security import require_service_token
from app.forecasting.evaluate import evaluate_forecasts
from app.forecasting.service import generate_forecasts

router = APIRouter(prefix="/internal/forecasts", dependencies=[Depends(require_service_token)])


class TriggerRequest(BaseModel):
    triggered_by: str = "manual"


@router.post("/generate")
def generate(req: TriggerRequest, background: BackgroundTasks) -> dict:
    if not db_is_up():
        raise HTTPException(status_code=503, detail="Base de données indisponible")
    background.add_task(generate_forecasts, req.triggered_by)
    return {"status": "ACCEPTED", "detail": "Génération des prévisions lancée"}


@router.post("/evaluate")
def evaluate(req: TriggerRequest) -> dict:
    try:
        return evaluate_forecasts(req.triggered_by)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Évaluation échouée : {exc}") from exc


@router.get("/status")
def status() -> dict:
    forecasts_t = table("ml", "forecasts")
    results_t = table("ml", "forecast_results")
    with get_engine().connect() as conn:
        active = conn.execute(
            select(func.count()).where(forecasts_t.c.superseded_at.is_(None))
        ).scalar()
        evaluated = conn.execute(select(func.count()).select_from(results_t)).scalar()
        latest = conn.execute(select(func.max(forecasts_t.c.generated_at))).scalar()
    return {
        "active_forecasts": active,
        "evaluated": evaluated,
        "generated_at": latest.isoformat() if latest else None,
    }
