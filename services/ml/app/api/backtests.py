"""Routes internes du backtesting."""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select

from app.backtesting.runner import run_backtest
from app.core.db import db_is_up, get_engine, table
from app.core.security import require_service_token

router = APIRouter(prefix="/internal/backtests", dependencies=[Depends(require_service_token)])


class RunRequest(BaseModel):
    strategies: list[str] | None = None
    min_history: int = 300
    triggered_by: str = "manual"


@router.post("/run")
def run(req: RunRequest, background: BackgroundTasks) -> dict:
    if not db_is_up():
        raise HTTPException(status_code=503, detail="Base de données indisponible")
    background.add_task(run_backtest, req.strategies, req.min_history, req.triggered_by)
    return {"status": "ACCEPTED", "detail": "Backtest lancé — suivre ops.ingestion_runs"}


@router.get("/status")
def status() -> dict:
    backtests_t = table("ml", "backtests")
    with get_engine().connect() as conn:
        latest = conn.execute(select(func.max(backtests_t.c.finished_at))).scalar()
        count = conn.execute(select(func.count()).select_from(backtests_t)).scalar()
    return {"finished_at": latest.isoformat() if latest else None, "backtests": count}
