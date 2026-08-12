"""Test d'intégration du refresh contre la base de dev (données réelles).

Sauté si la base est injoignable. C'est l'opération réelle de production :
il matérialise les statistiques du jeu — comportement voulu.
"""

import time

import pytest
from sqlalchemy import func, select

from app.core.db import db_is_up, get_engine, table

pytestmark = pytest.mark.skipif(
    not db_is_up(), reason="Base de données indisponible (docker compose up requis)"
)


def test_refresh_complet_et_invariants():
    from app.statistics.loader import load_config, load_valid_draws
    from app.statistics.refresh import refresh_statistics

    started = time.monotonic()
    result = refresh_statistics(triggered_by="test")
    duration = time.monotonic() - started
    assert result["status"] == "SUCCESS"
    stats = result["stats"]
    assert duration < 30, f"Refresh trop lent : {duration:.1f}s (critère roadmap < 30 s)"

    config = load_config()
    data = load_valid_draws(config)
    winning_id = config.set_types["WINNING"]["id"]
    n_winning = len(data.sequences["WINNING"])
    assert n_winning > 10000  # historique réel chargé

    numbers_t = table("analytics", "number_stats")
    with get_engine().connect() as conn:
        # Scope global (draw_type NULL, fenêtre ALL, ensemble WINNING)
        scope = (
            (numbers_t.c.set_type_id == winning_id)
            & (numbers_t.c.draw_type_id.is_(None))
            & (numbers_t.c.window_code == "ALL")
        )
        rows = conn.execute(
            select(func.count(), func.sum(numbers_t.c.frequency)).where(scope)
        ).one()
        assert rows[0] == 90  # les 90 numéros matérialisés
        # Invariant : somme des fréquences = 5 numéros × nb de tirages
        assert int(rows[1]) == 5 * n_winning

        bad = conn.execute(
            select(func.count()).where(
                (numbers_t.c.relative_freq < 0) | (numbers_t.c.relative_freq > 1)
            )
        ).scalar()
        assert bad == 0

        as_of = conn.execute(select(numbers_t.c.as_of_draw_id).limit(1)).scalar()
        assert str(as_of) == data.last_draw_id

    assert stats["rows_numbers"] > 0 and stats["rows_pairs"] > 0 and stats["rows_shapes"] > 0

    # Nettoyage des runs de test du moteur de stats.
    runs_t = table("ops", "ingestion_runs")
    src_t = table("ops", "data_sources")
    from sqlalchemy import delete

    with get_engine().begin() as conn:
        src = conn.execute(select(src_t.c.id).where(src_t.c.code == "stats-engine")).scalar_one()
        conn.execute(
            delete(runs_t).where((runs_t.c.source_id == src) & (runs_t.c.triggered_by == "test"))
        )
