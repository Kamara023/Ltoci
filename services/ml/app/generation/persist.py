"""Génération + persistance des combinaisons candidates.

Régénération = remplacement : la clé unique (jeu, type NULL, date cible,
stratégie) est purgée puis réinsérée — les candidates suivent toujours le
dernier état des données (dataset_cutoff_draw_id trace ce qui était connu).
"""

from __future__ import annotations

import datetime as dt

import structlog
from sqlalchemy import delete, insert, select

from app.analyst.templates import build_explanation, make_rng
from app.core.db import get_engine, table
from app.core.runlog import RunLogger
from app.generation.engine import generate
from app.generation.features import build_inputs
from app.generation.strategies import REGISTRY, build_spec
from app.statistics.loader import load_config, load_valid_draws

log = structlog.get_logger()

PREDICTION_SOURCE = "prediction-engine"


def generate_and_store(
    strategy_codes: list[str] | None = None,
    target_date: dt.date | None = None,
    triggered_by: str = "manual",
    pool_size: int = 5000,
    top_n: int = 10,
) -> dict:
    runlog = RunLogger(PREDICTION_SOURCE, triggered_by)
    try:
        stats = _run(strategy_codes, target_date, runlog, pool_size, top_n)
        runlog.finish("SUCCESS", stats)
        return {"run_id": str(runlog.run_id), "status": "SUCCESS", "stats": stats}
    except Exception as exc:  # noqa: BLE001
        log.error("prediction_generation_failed", error=str(exc))
        runlog.finish("FAILED", {}, error=str(exc))
        raise


def _enabled_strategies(conn) -> list[dict]:
    strategies_t = table("ml", "strategies")
    return [
        {"id": str(r.id), "code": r.code, "config": r.default_config or {}}
        for r in conn.execute(
            select(strategies_t.c.id, strategies_t.c.code, strategies_t.c.default_config)
            .where(strategies_t.c.is_enabled)
            .order_by(strategies_t.c.code)
        )
        if r.code in REGISTRY
    ]


def _run(
    strategy_codes: list[str] | None,
    target_date: dt.date | None,
    runlog: RunLogger,
    pool_size: int,
    top_n: int,
) -> dict:
    config = load_config()
    data = load_valid_draws(config)
    if data.last_draw_id is None:
        runlog.event("WARN", "Aucun tirage VALID — génération impossible")
        return {"generated": 0}

    seq = data.sequences["WINNING"]
    set_cfg = config.set_types["WINNING"]
    inputs = build_inputs(seq, set_cfg["number_min"], set_cfg["number_max"])
    target = target_date or (dt.date.today() + dt.timedelta(days=1))

    predictions_t = table("ml", "predictions")
    combos_t = table("ml", "prediction_combinations")
    engine_db = get_engine()

    with engine_db.connect() as conn:
        strategies = _enabled_strategies(conn)
    if strategy_codes:
        strategies = [s for s in strategies if s["code"] in strategy_codes]

    generated = 0
    for strat in strategies:
        rng = make_rng(strat["code"], data.last_draw_id)
        spec = build_spec(strat["code"], inputs, strat["config"])
        candidates = generate(spec, inputs, rng, pool_size=pool_size, top_n=top_n)

        with engine_db.begin() as conn:
            existing = conn.execute(
                select(predictions_t.c.id).where(
                    (predictions_t.c.game_id == config.game_id)
                    & (predictions_t.c.draw_type_id.is_(None))
                    & (predictions_t.c.target_draw_date == target)
                    & (predictions_t.c.strategy_id == strat["id"])
                )
            ).scalars().all()
            if existing:
                conn.execute(delete(predictions_t).where(predictions_t.c.id.in_(existing)))
            prediction_id = conn.execute(
                insert(predictions_t)
                .values(
                    game_id=config.game_id,
                    draw_type_id=None,
                    target_draw_date=target,
                    strategy_id=strat["id"],
                    config_used={
                        "pool_size": pool_size,
                        "top_n": top_n,
                        "profile": spec.profile,
                        "constraints": {k: list(v) if isinstance(v, tuple) else v
                                        for k, v in spec.constraints.items()},
                    },
                    dataset_cutoff_draw_id=data.last_draw_id,
                )
                .returning(predictions_t.c.id)
            ).scalar_one()
            for rank, cand in enumerate(candidates, start=1):
                conn.execute(
                    insert(combos_t).values(
                        prediction_id=prediction_id,
                        rank=rank,
                        numbers=cand.numbers,
                        score=cand.score,
                        score_breakdown=cand.breakdown,
                        explanation=build_explanation(
                            strat["code"], cand.numbers, cand.breakdown, inputs
                        ),
                    )
                )
        generated += 1
        runlog.event(
            "INFO",
            f"{strat['code']} : {len(candidates)} candidates pour le {target}",
            {"top_score": candidates[0].score if candidates else None},
        )

    return {
        "generated": generated,
        "target_date": str(target),
        "cutoff_draw_id": data.last_draw_id,
        "draws_used": int(len(seq)),
    }
