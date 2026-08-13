"""Intégration : génération + persistance sur la base de dev (skip si down)."""

from datetime import date

import pytest
from sqlalchemy import delete, select

from app.core.db import db_is_up, get_engine, table

pytestmark = pytest.mark.skipif(
    not db_is_up(), reason="Base de données indisponible (docker compose up requis)"
)

TEST_DATE = date(2031, 6, 15)  # date cible dédiée aux tests


def _cleanup():
    predictions_t = table("ml", "predictions")
    runs_t = table("ops", "ingestion_runs")
    src_t = table("ops", "data_sources")
    with get_engine().begin() as conn:
        conn.execute(
            delete(predictions_t).where(predictions_t.c.target_draw_date == TEST_DATE)
        )  # combinations cascade
        src = conn.execute(
            select(src_t.c.id).where(src_t.c.code == "prediction-engine")
        ).scalar_one()
        conn.execute(
            delete(runs_t).where((runs_t.c.source_id == src) & (runs_t.c.triggered_by == "test"))
        )


def test_generation_reelle_et_remplacement():
    from app.generation.persist import generate_and_store

    try:
        result = generate_and_store(
            ["STRATEGY_FREQUENCY"], TEST_DATE, triggered_by="test", pool_size=1000
        )
        assert result["status"] == "SUCCESS"
        assert result["stats"]["generated"] == 1

        predictions_t = table("ml", "predictions")
        combos_t = table("ml", "prediction_combinations")
        with get_engine().connect() as conn:
            pred = conn.execute(
                select(predictions_t.c.id, predictions_t.c.dataset_cutoff_draw_id).where(
                    predictions_t.c.target_draw_date == TEST_DATE
                )
            ).one()
            assert pred.dataset_cutoff_draw_id is not None
            combos = conn.execute(
                select(combos_t.c.rank, combos_t.c.numbers, combos_t.c.score,
                       combos_t.c.score_breakdown, combos_t.c.explanation)
                .where(combos_t.c.prediction_id == pred.id)
                .order_by(combos_t.c.rank)
            ).all()
        assert len(combos) == 10
        assert combos[0].score >= combos[-1].score  # tri par score
        assert "indépendant" in combos[0].explanation

        # Régénération = remplacement, pas de doublon de clé.
        result2 = generate_and_store(
            ["STRATEGY_FREQUENCY"], TEST_DATE, triggered_by="test", pool_size=1000
        )
        assert result2["status"] == "SUCCESS"
        with get_engine().connect() as conn:
            count = conn.execute(
                select(predictions_t.c.id).where(predictions_t.c.target_draw_date == TEST_DATE)
            ).all()
        assert len(count) == 1
    finally:
        _cleanup()
