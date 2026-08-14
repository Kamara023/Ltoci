"""Tests d'intégration du writer contre la base de dev (schéma Prisma réel).

Sautés automatiquement si la base est injoignable. Les données créées portent
des codes de tirage dédiés ('test-writer-…') et sont nettoyées en fin de test.
"""

import os
import uuid
from datetime import date

import pytest

os.environ.setdefault("ML_SERVICE_TOKEN", "token-de-test-123456")

from sqlalchemy import delete, select  # noqa: E402

from app.core.db import db_is_up, get_engine, table  # noqa: E402
from app.parsers.lonaci_api import ParsedDraw  # noqa: E402
from app.runlog import RunLogger  # noqa: E402
from app.writer import DrawWriter  # noqa: E402

pytestmark = pytest.mark.skipif(
    not db_is_up(), reason="Base de données indisponible (docker compose up requis)"
)

TEST_CODE = f"test-writer-{uuid.uuid4().hex[:8]}"
TEST_DATE = date(2026, 1, 15)


def make_draw(winning, machine=None) -> ParsedDraw:
    return ParsedDraw(
        draw_name=f"Test Writer {TEST_CODE[-8:]}",
        draw_code=TEST_CODE,
        category="standard",
        draw_date=TEST_DATE,
        winning=winning,
        machine=machine,
        raw={"test": True},
    )


@pytest.fixture
def runlog():
    rl = RunLogger("manual-admin", "test")
    yield rl
    _cleanup(rl)


def _cleanup(rl: RunLogger) -> None:
    engine = get_engine()
    draws_t = table("core", "draws")
    types_t = table("core", "draw_types")
    runs_t = table("ops", "ingestion_runs")
    with engine.begin() as conn:
        # data_quality_issues et draw_number_sets cascadent depuis draws.
        conn.execute(delete(draws_t).where(draws_t.c.ingestion_run_id == rl.run_id))
        conn.execute(delete(types_t).where(types_t.c.code == TEST_CODE))
        conn.execute(delete(runs_t).where(runs_t.c.id == rl.run_id))  # events cascadent


def test_insert_idempotence_reordre_puis_conflit(runlog):
    writer = DrawWriter(runlog)

    # 1) Insertion : draw_type créé automatiquement, tirage + 2 ensembles.
    #    L'ORDRE PUBLIÉ (ordre de sortie des boules) est préservé tel quel.
    stats = writer.write([make_draw([89, 4, 58, 17, 33], [1, 2, 3, 4, 5])])
    assert stats.inserted == 1 and stats.duplicates == 0 and stats.conflicts == 0
    assert TEST_CODE in stats.created_draw_types

    engine = get_engine()
    draws_t = table("core", "draws")
    sets_t = table("core", "draw_number_sets")
    with engine.connect() as conn:
        draw_id = conn.execute(
            select(draws_t.c.id).where(draws_t.c.ingestion_run_id == runlog.run_id)
        ).scalar_one()
        stored = sorted(
            (list(row.numbers) for row in conn.execute(
                select(sets_t.c.numbers).where(sets_t.c.draw_id == draw_id)
            )),
            key=len,
        )
    assert [89, 4, 58, 17, 33] in stored, "ordre de sortie préservé à l'insertion"
    assert [1, 2, 3, 4, 5] in stored

    # 2) Re-collecte STRICTEMENT identique : no-op compté en duplicates.
    stats2 = writer.write([make_draw([89, 4, 58, 17, 33], [1, 2, 3, 4, 5])])
    assert stats2.inserted == 0 and stats2.duplicates == 1 and stats2.conflicts == 0
    assert stats2.reordered == 0

    # 2b) Même ENSEMBLE mais ordre différent (cas historique trié en base) :
    #     l'ordre publié fait foi → restauration comptée en `reordered`,
    #     PAS de conflit, PAS d'update « lourd ».
    stats2b = writer.write([make_draw([4, 17, 33, 58, 89], [1, 2, 3, 4, 5])])
    assert stats2b.reordered == 1 and stats2b.conflicts == 0 and stats2b.updated == 0
    with engine.connect() as conn:
        winning_now = [
            list(row.numbers)
            for row in conn.execute(select(sets_t.c.numbers).where(sets_t.c.draw_id == draw_id))
            if len(row.numbers) == 5 and sorted(row.numbers) == [4, 17, 33, 58, 89]
        ]
    assert winning_now == [[4, 17, 33, 58, 89]], "ordre mis à jour vers l'ordre publié"

    # 3) Numéros différents EN ENSEMBLE : SOURCE_CONFLICT, existant conservé.
    stats3 = writer.write([make_draw([10, 20, 30, 40, 50], [1, 2, 3, 4, 5])])
    assert stats3.conflicts == 1 and stats3.inserted == 0
    issues_t = table("ops", "data_quality_issues")
    with engine.connect() as conn:
        issue = conn.execute(
            select(issues_t.c.rule_code).where(issues_t.c.run_id == runlog.run_id)
        ).scalar_one()
        kept = conn.execute(
            select(sets_t.c.numbers).where(sets_t.c.draw_id == draw_id)
        ).all()
    assert issue == "SOURCE_CONFLICT"
    assert sorted(map(tuple, (sorted(r.numbers) for r in kept))) == [
        (1, 2, 3, 4, 5),
        (4, 17, 33, 58, 89),
    ]


def test_tirage_invalide_rejete_sans_bloquer_le_lot(runlog):
    writer = DrawWriter(runlog)
    bad = make_draw([1, 2, 3, 4, 95])  # 95 hors plage -> rejeté par le trigger SQL
    good = ParsedDraw(
        draw_name=f"Test Writer {TEST_CODE[-8:]}",
        draw_code=TEST_CODE,
        category="standard",
        draw_date=date(2026, 1, 16),
        winning=[5, 10, 15, 20, 25],
        machine=None,
        raw={},
    )
    stats = writer.write([bad, good])
    assert stats.invalid == 1
    assert stats.inserted == 1
