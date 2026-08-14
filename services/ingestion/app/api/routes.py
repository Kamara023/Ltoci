"""Routes internes du service ingestion (protégées par X-Internal-Token)."""

from __future__ import annotations

from datetime import UTC, datetime

import structlog
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select

from app.collectors import lonaci_api as collector
from app.core.db import db_is_up, get_engine, table
from app.core.security import require_service_token
from app.importers.files import PARSERS_BY_KIND
from app.parsers.lonaci_api import FormatChangeError
from app.quality.runner import run_quality
from app.runlog import RunLogger
from app.schedules import refresh_draw_type_schedules
from app.writer import DrawWriter

log = structlog.get_logger()
router = APIRouter(prefix="/internal", dependencies=[Depends(require_service_token)])

VERSION = "0.1.0"
LONACI_SOURCE = "lonaci-api"


@router.get("/health")
def health() -> dict:
    up = db_is_up()
    return {
        "status": "ok" if up else "degraded",
        "db": "up" if up else "down",
        "version": VERSION,
        "timestamp": datetime.now(UTC).isoformat(),
    }


class CollectRequest(BaseModel):
    mode: str = "latest"  # 'latest' | 'backfill'
    months: list[str] | None = None  # backfill : liste explicite, sinon tous
    triggered_by: str = "manual"


def _chain_quality(runlog: RunLogger, stats: dict) -> None:
    """Statue immédiatement les tirages en attente après une ingestion, puis
    rafraîchit le calendrier des types (le moteur de prévisions en dépend
    pour cibler le PROCHAIN tirage réel de chaque jeu).
    Best-effort : un échec de ces chaînages n'invalide pas l'ingestion."""
    try:
        quality = run_quality("pending", triggered_by="chained")
        stats["quality"] = quality["stats"]
    except Exception as exc:  # noqa: BLE001
        runlog.event("WARN", f"Contrôle qualité enchaîné en échec : {exc}")
    try:
        stats["schedules"] = refresh_draw_type_schedules(runlog)
    except Exception as exc:  # noqa: BLE001
        runlog.event("WARN", f"Rafraîchissement du calendrier en échec : {exc}")


def _collect_latest(triggered_by: str) -> dict:
    runlog = RunLogger(LONACI_SOURCE, triggered_by)
    try:
        parsed, _payload = collector.collect_latest()
        for warning in parsed.warnings:
            runlog.event("WARN", warning)
        stats = DrawWriter(runlog).write(parsed.draws).as_dict()
        _chain_quality(runlog, stats)
        status = "SUCCESS" if stats["invalid"] == 0 else "PARTIAL"
        runlog.finish(status, stats)
        return {"run_id": str(runlog.run_id), "status": status, "stats": stats}
    except FormatChangeError as exc:
        runlog.event("ERROR", f"FORMAT_CHANGE: {exc}")
        runlog.finish("FAILED", {}, error=f"FORMAT_CHANGE: {exc}")
        raise HTTPException(
            status_code=502, detail=f"Structure de la source modifiée : {exc}"
        ) from exc
    except Exception as exc:  # noqa: BLE001
        runlog.finish("FAILED", {}, error=str(exc))
        raise HTTPException(status_code=502, detail=f"Collecte échouée : {exc}") from exc


def _run_backfill(months: list[str] | None, triggered_by: str) -> None:
    runlog = RunLogger(LONACI_SOURCE, triggered_by)
    totals = {"found": 0, "inserted": 0, "updated": 0, "duplicates": 0, "conflicts": 0,
              "invalid": 0, "reordered": 0, "months_ok": 0, "months_failed": 0}
    try:
        if months is None:
            months = collector.list_available_months()
        runlog.event("INFO", f"Backfill de {len(months)} mois", {"months": months})
        writer = DrawWriter(runlog)

        def on_month(month_year, parsed, error):
            if error is not None:
                totals["months_failed"] += 1
                runlog.event("ERROR", f"Mois {month_year} en échec : {error}")
                return
            for warning in parsed.warnings:
                runlog.event("WARN", warning)
            stats = writer.write(parsed.draws)
            totals["months_ok"] += 1
            for key in (
                "found", "inserted", "updated", "duplicates", "conflicts", "invalid", "reordered"
            ):
                totals[key] += getattr(stats, key)
            runlog.event("INFO", f"Mois {month_year} : {stats.as_dict()}")

        collector.collect_months(months, on_month)
        status = "SUCCESS" if totals["months_failed"] == 0 else "PARTIAL"
        runlog.finish(status, totals)
    except Exception as exc:  # noqa: BLE001
        log.error("backfill_failed", error=str(exc))
        runlog.finish("FAILED", totals, error=str(exc))


@router.post("/ingestion/collect")
def collect(req: CollectRequest, background: BackgroundTasks) -> dict:
    if req.mode == "latest":
        return _collect_latest(req.triggered_by)
    if req.mode == "backfill":
        runlog_probe = db_is_up()
        if not runlog_probe:
            raise HTTPException(status_code=503, detail="Base de données indisponible")
        background.add_task(_run_backfill, req.months, req.triggered_by)
        return {
            "status": "ACCEPTED",
            "detail": "Backfill lancé en tâche de fond — suivre ops.ingestion_runs",
        }
    raise HTTPException(status_code=422, detail=f"Mode inconnu : {req.mode}")


@router.post("/schedules/refresh")
def schedules_refresh() -> dict:
    """Recalcule le calendrier (jours/heure) de chaque type depuis l'historique.
    Enchaîné après chaque collecte ; exposé pour un rafraîchissement manuel."""
    if not db_is_up():
        raise HTTPException(status_code=503, detail="Base de données indisponible")
    try:
        return refresh_draw_type_schedules()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Calendrier non calculé : {exc}") from exc


class QualityRequest(BaseModel):
    scope: str = "pending"  # 'pending' | 'all' | 'run:<uuid>' | 'draw:<uuid>'
    triggered_by: str = "manual"


@router.post("/quality/run")
def quality_run(req: QualityRequest, background: BackgroundTasks) -> dict:
    if req.scope in ("all", "pending"):
        if not db_is_up():
            raise HTTPException(status_code=503, detail="Base de données indisponible")
        background.add_task(run_quality, req.scope, req.triggered_by)
        return {
            "status": "ACCEPTED",
            "detail": f"Contrôle qualité ({req.scope}) lancé — suivre ops.ingestion_runs",
        }
    if req.scope.startswith(("run:", "draw:")):
        try:
            return run_quality(req.scope, req.triggered_by)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(status_code=502, detail=f"Contrôle échoué : {exc}") from exc
    raise HTTPException(status_code=422, detail=f"Scope inconnu : {req.scope}")


@router.post("/ingestion/import")
async def import_file(
    file: UploadFile = File(...),
    source_code: str = Form(...),
    triggered_by: str = Form("manual"),
) -> dict:
    sources = table("ops", "data_sources")
    with get_engine().connect() as conn:
        row = conn.execute(
            select(sources.c.kind, sources.c.config).where(sources.c.code == source_code)
        ).first()
    if row is None:
        raise HTTPException(status_code=404, detail=f"Source inconnue : {source_code}")
    parser = PARSERS_BY_KIND.get(str(row.kind))
    if parser is None:
        raise HTTPException(
            status_code=422, detail=f"Source {source_code} n'est pas un import fichier"
        )

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Fichier trop volumineux (max 10 Mo)")

    columns = (row.config or {}).get("columns") if isinstance(row.config, dict) else None
    runlog = RunLogger(source_code, triggered_by, file_name=file.filename)
    try:
        parsed = parser(content, columns)
        for rej in parsed.rejected:
            runlog.event("WARN", f"Ligne {rej['line']} rejetée : {rej['reason']}")
        stats = DrawWriter(runlog).write(parsed.draws).as_dict()
        stats["rejected_lines"] = len(parsed.rejected)
        stats["found"] = parsed.found
        _chain_quality(runlog, stats)
        status = "SUCCESS" if not parsed.rejected and stats["invalid"] == 0 else "PARTIAL"
        runlog.finish(status, stats)
        return {"run_id": str(runlog.run_id), "status": status, "stats": stats}
    except Exception as exc:  # noqa: BLE001
        runlog.finish("FAILED", {}, error=str(exc))
        raise HTTPException(status_code=422, detail=f"Import échoué : {exc}") from exc
