"""Routes internes des statistiques (protégées par le token de service)."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select

from app.core.db import db_is_up, get_engine, table
from app.core.security import require_service_token
from app.statistics.loader import load_config, load_valid_draws
from app.statistics.numbers import compute_number_rows
from app.statistics.pairs import compute_pair_rows
from app.statistics.refresh import refresh_statistics
from app.statistics.shapes import compute_shape_rows

router = APIRouter(prefix="/internal/statistics", dependencies=[Depends(require_service_token)])


@router.post("/refresh")
def refresh(background: BackgroundTasks, triggered_by: str = "manual") -> dict:
    if not db_is_up():
        raise HTTPException(status_code=503, detail="Base de données indisponible")
    background.add_task(refresh_statistics, triggered_by)
    return {"status": "ACCEPTED", "detail": "Recalcul lancé — suivre ops.ingestion_runs"}


@router.get("/status")
def status() -> dict:
    numbers_t = table("analytics", "number_stats")
    pairs_t = table("analytics", "pair_stats")
    shapes_t = table("analytics", "draw_shape_stats")
    with get_engine().connect() as conn:
        computed_at = conn.execute(select(func.max(numbers_t.c.computed_at))).scalar()
        counts = {
            "number_stats": conn.execute(
                select(func.count()).select_from(numbers_t)
            ).scalar(),
            "pair_stats": conn.execute(select(func.count()).select_from(pairs_t)).scalar(),
            "draw_shape_stats": conn.execute(
                select(func.count()).select_from(shapes_t)
            ).scalar(),
        }
        as_of = conn.execute(select(numbers_t.c.as_of_draw_id).limit(1)).scalar()
    return {
        "computed_at": computed_at.isoformat() if computed_at else None,
        "as_of_draw_id": str(as_of) if as_of else None,
        "counts": counts,
    }


class ComputeRequest(BaseModel):
    """Calcul à la volée sur une période personnalisée — sans persistance."""

    date_from: date | None = None
    date_to: date | None = None
    set_code: str = "WINNING"
    draw_type_code: str | None = None
    families: list[str] = ["numbers"]  # 'numbers' | 'pairs' | 'shapes'


@router.post("/compute")
def compute(req: ComputeRequest) -> dict:
    config = load_config()
    if req.set_code not in config.set_types:
        raise HTTPException(status_code=422, detail=f"Ensemble inconnu : {req.set_code}")
    data = load_valid_draws(config, req.date_from, req.date_to)
    seq = data.sequences.get(req.set_code)
    if seq is None or seq.empty:
        return {"draws": 0, "results": {}}
    if req.draw_type_code:
        seq = seq[seq["type_code"] == req.draw_type_code].reset_index(drop=True)
        if seq.empty:
            return {"draws": 0, "results": {}}

    set_cfg = config.set_types[req.set_code]
    results: dict = {}
    if "numbers" in req.families:
        rows = compute_number_rows(seq, set_cfg["number_min"], set_cfg["number_max"], None)
        for r in rows:
            if r["last_seen_date"] is not None:
                r["last_seen_date"] = r["last_seen_date"].isoformat()
        results["numbers"] = rows
    if "pairs" in req.families:
        pairs = compute_pair_rows(seq, None)
        pairs.sort(key=lambda r: r["frequency"], reverse=True)
        results["pairs"] = pairs[:500]  # top 500 — réponse bornée
    if "shapes" in req.families:
        results["shapes"] = compute_shape_rows(
            seq, set_cfg["number_min"], set_cfg["number_max"], None
        )
    return {"draws": int(len(seq)), "results": results}
