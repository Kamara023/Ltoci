"""Routes internes de génération des combinaisons candidates."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select

from app.core.db import db_is_up, get_engine, table
from app.core.security import require_service_token
from app.generation.persist import generate_and_store

router = APIRouter(prefix="/internal/predictions", dependencies=[Depends(require_service_token)])


class GenerateRequest(BaseModel):
    strategies: list[str] | None = None  # None = toutes les stratégies actives
    target_date: date | None = None      # None = demain
    triggered_by: str = "manual"


@router.post("/generate")
def generate(req: GenerateRequest, background: BackgroundTasks) -> dict:
    if not db_is_up():
        raise HTTPException(status_code=503, detail="Base de données indisponible")
    if req.strategies and len(req.strategies) == 1:
        try:
            return generate_and_store(req.strategies, req.target_date, req.triggered_by)
        except KeyError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
    background.add_task(generate_and_store, req.strategies, req.target_date, req.triggered_by)
    return {"status": "ACCEPTED", "detail": "Génération lancée — suivre ops.ingestion_runs"}


@router.get("/status")
def status() -> dict:
    predictions_t = table("ml", "predictions")
    with get_engine().connect() as conn:
        latest = conn.execute(select(func.max(predictions_t.c.generated_at))).scalar()
        count = conn.execute(select(func.count()).select_from(predictions_t)).scalar()
    return {
        "generated_at": latest.isoformat() if latest else None,
        "predictions": count,
    }
