"""Génération des prévisions TOP 5 par tirage à venir + persistance FIGÉE.

Cibles : pour chaque type de tirage actif — aujourd'hui si son tirage du
jour n'est pas encore en base, sinon demain. Séquence du type si ≥ 300
tirages, sinon séquence globale. Les modèles ML sont entraînés UNE fois
sur l'historique global puis appliqués aux features de chaque cible.

FIGÉ : une prévision active non évaluée peut être remplacée (supersede
tracé, l'historique est conservé) ; une prévision ÉVALUÉE est immuable
(trigger SQL FORECAST_FROZEN).
"""

from __future__ import annotations

import datetime as dt

import structlog
from sqlalchemy import insert, select, update

from app.core.db import get_engine, table
from app.core.runlog import RunLogger
from app.forecasting.consensus import DEFAULT_MODEL_WEIGHTS, build_consensus
from app.generation.features import build_inputs
from app.mlmodels.trainer import ML_ALGOS, predict_weights, train_model
from app.statistics.loader import load_config, load_valid_draws

log = structlog.get_logger()

FORECAST_SOURCE = "forecast-engine"
MIN_TYPE_HISTORY = 300


def generate_forecasts(triggered_by: str = "manual") -> dict:
    runlog = RunLogger(FORECAST_SOURCE, triggered_by)
    try:
        stats = _generate(runlog)
        runlog.finish("SUCCESS", stats)
        return {"run_id": str(runlog.run_id), "status": "SUCCESS", "stats": stats}
    except Exception as exc:  # noqa: BLE001
        log.error("forecast_generation_failed", error=str(exc))
        runlog.finish("FAILED", {}, error=str(exc))
        raise


def _consensus_config(conn) -> dict[str, float]:
    """Pondérations éditables au backoffice (strategies.default_config de
    FORECAST_CONSENSUS) — repli sur les valeurs par défaut."""
    strategies_t = table("ml", "strategies")
    row = conn.execute(
        select(strategies_t.c.default_config).where(
            strategies_t.c.code == "FORECAST_CONSENSUS"
        )
    ).scalar()
    if isinstance(row, dict) and isinstance(row.get("model_weights"), dict):
        return {str(k): float(v) for k, v in row["model_weights"].items()}
    return dict(DEFAULT_MODEL_WEIGHTS)


def _generate(runlog: RunLogger) -> dict:
    config = load_config()
    data = load_valid_draws(config)
    seq_global = data.sequences.get("WINNING")
    if seq_global is None or seq_global.empty:
        raise ValueError("Aucun tirage VALID")
    set_cfg = config.set_types["WINNING"]
    lo, hi = set_cfg["number_min"], set_cfg["number_max"]

    inputs_global = build_inputs(seq_global, lo, hi)
    engine_db = get_engine()
    with engine_db.connect() as conn:
        model_weights = _consensus_config(conn)

    # Modèles ML entraînés UNE fois (historique global), appliqués par cible.
    ml_trained = {}
    for code in ML_ALGOS:
        if model_weights.get(code, 0) > 0 and inputs_global.history:
            try:
                ml_trained[code] = train_model(code, inputs_global.history, lo, hi)
            except Exception as exc:  # noqa: BLE001
                runlog.event("WARN", f"{code} indisponible : {exc}")

    today = dt.date.today()
    draws_t = table("core", "draws")
    types_t = table("core", "draw_types")
    forecasts_t = table("ml", "forecasts")
    entries_t = table("ml", "forecast_entries")
    results_t = table("ml", "forecast_results")

    with engine_db.connect() as conn:
        active_types = conn.execute(
            select(types_t.c.id, types_t.c.code)
            .where((types_t.c.game_id == config.game_id) & types_t.c.is_active)
            .order_by(types_t.c.code)
        ).all()
        drawn_today = {
            str(r.draw_type_id)
            for r in conn.execute(
                select(draws_t.c.draw_type_id).where(
                    (draws_t.c.game_id == config.game_id)
                    & (draws_t.c.draw_date == today)
                )
            )
        }

    created = 0
    superseded = 0
    skipped = 0
    for type_row in active_types:
        type_id = str(type_row.id)
        target = today if type_id not in drawn_today else today + dt.timedelta(days=1)

        type_seq = seq_global[seq_global["draw_type_id"] == type_id]
        use_type_seq = len(type_seq) >= MIN_TYPE_HISTORY
        inputs = (
            build_inputs(type_seq.reset_index(drop=True), lo, hi)
            if use_type_seq
            else inputs_global
        )
        precomputed = {
            code: predict_weights(trained, inputs) for code, trained in ml_trained.items()
        }
        consensus = build_consensus(inputs, model_weights, top_n=10, precomputed=precomputed)

        with engine_db.begin() as conn:
            existing = conn.execute(
                select(forecasts_t.c.id).where(
                    (forecasts_t.c.game_id == config.game_id)
                    & (forecasts_t.c.draw_type_id == type_id)
                    & (forecasts_t.c.target_date == target)
                    & forecasts_t.c.superseded_at.is_(None)
                )
            ).scalar()
            if existing:
                has_result = conn.execute(
                    select(results_t.c.id).where(results_t.c.forecast_id == existing)
                ).scalar()
                if has_result:
                    skipped += 1  # évaluée = immuable, on ne touche à rien
                    continue
                conn.execute(
                    update(forecasts_t)
                    .where(forecasts_t.c.id == existing)
                    .values(superseded_at=dt.datetime.now(dt.UTC))
                )
                superseded += 1

            forecast_id = conn.execute(
                insert(forecasts_t)
                .values(
                    game_id=config.game_id,
                    draw_type_id=type_id,
                    target_date=target,
                    dataset_cutoff_draw_id=data.last_draw_id,
                    model_versions=consensus.model_versions,
                    config={
                        "sequence": "type" if use_type_seq else "global",
                        "draws_used": int(len(type_seq) if use_type_seq else len(seq_global)),
                        "model_weights": model_weights,
                    },
                )
                .returning(forecasts_t.c.id)
            ).scalar_one()
            for entry in consensus.entries:
                conn.execute(
                    insert(entries_t).values(
                        forecast_id=forecast_id,
                        rank=entry.rank,
                        number=entry.number,
                        score=entry.score,
                        confidence=entry.confidence,
                        factors=entry.factors,
                        consensus_count=entry.consensus_count,
                    )
                )
        created += 1

    stats = {
        "targets": len(active_types),
        "created": created,
        "superseded": superseded,
        "skipped_frozen": skipped,
        "cutoff_draw_id": data.last_draw_id,
    }
    runlog.event("INFO", "Prévisions générées", stats)
    return stats
