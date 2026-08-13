"""Intégration : backtest réel sur l'historique (skip si DB indisponible).

C'est l'opération de production : elle remplace les backtests « courants ».
Auto-validation du harnais : RANDOM doit converger vers E ≈ 0,2778.
"""

import time

import pytest
from sqlalchemy import func, select

from app.core.db import db_is_up, get_engine, table

pytestmark = pytest.mark.skipif(
    not db_is_up(), reason="Base de données indisponible (docker compose up requis)"
)


def test_backtest_random_et_antifuite():
    from app.backtesting.runner import run_backtest

    started = time.monotonic()
    result = run_backtest(["STRATEGY_RANDOM", "STRATEGY_FREQUENCY"], triggered_by="test")
    duration = time.monotonic() - started
    assert result["status"] == "SUCCESS"
    assert duration < 600, f"{duration:.0f}s — critère roadmap < 10 min"

    summary = result["stats"]["summary"]
    random_avg = summary["STRATEGY_RANDOM"]["avg"]
    # Auto-validation du harnais : convergence vers 5×5/90 ≈ 0,2778.
    assert 0.25 <= random_avg <= 0.31, f"harnais suspect : RANDOM = {random_avg}"

    # Anti-fuite : sur TOUS les points persistés, cutoff antérieur (ou égal
    # en date — ordre intra-journée) à la cible, et jamais le même tirage.
    points_t = table("ml", "backtest_points")
    draws_t = table("core", "draws")
    with get_engine().connect() as conn:
        target = draws_t.alias("target")
        cutoff = draws_t.alias("cutoff")
        violations = conn.execute(
            select(func.count())
            .select_from(
                points_t.join(target, points_t.c.target_draw_id == target.c.id).join(
                    cutoff, points_t.c.cutoff_draw_id == cutoff.c.id
                )
            )
            .where(
                (cutoff.c.draw_date > target.c.draw_date)
                | (points_t.c.cutoff_draw_id == points_t.c.target_draw_id)
            )
        ).scalar()
        assert violations == 0

        # Remplacement : un seul backtest « courant » GLOBAL par stratégie
        # (FORECAST_CONSENSUS a en plus des backtests par type de tirage).
        backtests_t = table("ml", "backtests")
        strategies_t = table("ml", "strategies")
        per_strategy = conn.execute(
            select(strategies_t.c.code, func.count())
            .select_from(backtests_t.join(strategies_t))
            .where(backtests_t.c.draw_type_id.is_(None))
            .group_by(strategies_t.c.code)
        ).all()
    for code, count in per_strategy:
        assert count == 1, f"{code}: {count} backtests courants"

    # Nettoyage des runs de test.
    runs_t = table("ops", "ingestion_runs")
    src_t = table("ops", "data_sources")
    from sqlalchemy import delete

    with get_engine().begin() as conn:
        src = conn.execute(
            select(src_t.c.id).where(src_t.c.code == "backtest-engine")
        ).scalar_one()
        conn.execute(
            delete(runs_t).where((runs_t.c.source_id == src) & (runs_t.c.triggered_by == "test"))
        )
