"""Tests d'intégration du runner qualité contre la base de dev.

Sautés si la base est injoignable. Tirages de test dédiés, nettoyés.
"""

import os
import uuid
from datetime import date, timedelta

import pytest

os.environ.setdefault("ML_SERVICE_TOKEN", "token-de-test-123456")

from sqlalchemy import delete, insert, select, update  # noqa: E402

from app.core.db import db_is_up, get_engine, table  # noqa: E402
from app.parsers.lonaci_api import ParsedDraw  # noqa: E402
from app.quality.runner import run_quality  # noqa: E402
from app.runlog import RunLogger  # noqa: E402
from app.writer import DrawWriter  # noqa: E402

pytestmark = pytest.mark.skipif(
    not db_is_up(), reason="Base de données indisponible (docker compose up requis)"
)

CODE = f"test-quality-{uuid.uuid4().hex[:8]}"


def make_draw(d: date, winning, machine=None) -> ParsedDraw:
    return ParsedDraw(
        draw_name=f"Test Quality {CODE[-8:]}",
        draw_code=CODE,
        category="standard",
        draw_date=d,
        winning=winning,
        machine=machine,
        raw={},
    )


@pytest.fixture
def env():
    rl = RunLogger("manual-admin", "test")
    yield rl
    engine = get_engine()
    draws_t = table("core", "draws")
    types_t = table("core", "draw_types")
    runs_t = table("ops", "ingestion_runs")
    with engine.begin() as conn:
        conn.execute(delete(draws_t).where(draws_t.c.ingestion_run_id == rl.run_id))
        conn.execute(delete(types_t).where(types_t.c.code == CODE))
        conn.execute(delete(runs_t).where(runs_t.c.id == rl.run_id))


def get_draw(run_id, d: date):
    draws_t = table("core", "draws")
    with get_engine().connect() as conn:
        return conn.execute(
            select(draws_t.c.id, draws_t.c.status, draws_t.c.validated_at)
            .where((draws_t.c.ingestion_run_id == run_id) & (draws_t.c.draw_date == d))
        ).one()


def test_cycle_complet_du_runner(env):
    writer = DrawWriter(env)
    old_complete = date.today() - timedelta(days=30)   # sain -> VALID
    old_no_machine = date.today() - timedelta(days=31) # MISSING_SET auto-résolu -> VALID
    recent_no_machine = date.today() - timedelta(days=1)  # MISSING_SET ouvert -> PENDING
    writer.write(
        [
            make_draw(old_complete, [1, 2, 3, 4, 5], [6, 7, 8, 9, 10]),
            make_draw(old_no_machine, [11, 12, 13, 14, 15]),
            make_draw(recent_no_machine, [21, 22, 23, 24, 25]),
        ]
    )

    result = run_quality(f"run:{env.run_id}", triggered_by="test")
    stats = result["stats"]
    assert stats["checked"] == 3
    assert stats["validated"] == 2
    # Le tirage récent sans machine était déjà PENDING_REVIEW : statut inchangé.
    assert stats["unchanged"] == 1
    assert stats["issues_autoresolved"] == 1

    d1 = get_draw(env.run_id, old_complete)
    assert d1.status == "VALID" and d1.validated_at is not None
    assert get_draw(env.run_id, old_no_machine).status == "VALID"
    assert get_draw(env.run_id, recent_no_machine).status == "PENDING_REVIEW"

    # Idempotence : re-run -> aucune nouvelle issue, statuts inchangés.
    result2 = run_quality(f"run:{env.run_id}", triggered_by="test")
    assert result2["stats"]["issues_created"] == 0
    assert result2["stats"]["validated"] == 0
    assert result2["stats"]["unchanged"] == 3

    # Nettoyage des runs qualité créés par ce test.
    runs_t = table("ops", "ingestion_runs")
    src_t = table("ops", "data_sources")
    with get_engine().begin() as conn:
        qsrc = conn.execute(select(src_t.c.id).where(src_t.c.code == "quality-engine")).scalar_one()
        conn.execute(
            delete(runs_t).where((runs_t.c.source_id == qsrc) & (runs_t.c.triggered_by == "test"))
        )


def test_decision_manuelle_jamais_ecrasee(env):
    writer = DrawWriter(env)
    d = date.today() - timedelta(days=40)
    writer.write([make_draw(d, [31, 32, 33, 34, 35], [36, 37, 38, 39, 40])])

    draws_t = table("core", "draws")
    users_t = table("app", "users")
    with get_engine().begin() as conn:
        admin_id = conn.execute(select(users_t.c.id).limit(1)).scalar_one()
        conn.execute(
            update(draws_t)
            .where(draws_t.c.ingestion_run_id == env.run_id)
            .values(status="INVALID", validated_by=admin_id)
        )

    result = run_quality(f"run:{env.run_id}", triggered_by="test")
    assert result["stats"]["checked"] == 0  # tirage à décision manuelle exclu du scope
    assert get_draw(env.run_id, d).status == "INVALID"

    runs_t = table("ops", "ingestion_runs")
    src_t = table("ops", "data_sources")
    with get_engine().begin() as conn:
        qsrc = conn.execute(select(src_t.c.id).where(src_t.c.code == "quality-engine")).scalar_one()
        conn.execute(
            delete(runs_t).where((runs_t.c.source_id == qsrc) & (runs_t.c.triggered_by == "test"))
        )


def test_invalid_date_bloquante(env):
    """Un tirage à date future doit passer INVALID (insertion directe en SQL
    car le writer/DTO n'en produit pas)."""
    draws_t = table("core", "draws")
    types_t = table("core", "draw_types")
    sets_t = table("core", "draw_number_sets")
    set_types_t = table("core", "game_number_set_types")
    games_t = table("core", "games")
    future = date.today() + timedelta(days=30)
    with get_engine().begin() as conn:
        game_id = conn.execute(
            select(games_t.c.id).where(games_t.c.code == "loto-bonheur")
        ).scalar_one()
        type_id = conn.execute(
            insert(types_t)
            .values(game_id=game_id, code=CODE, name="Test", days_of_week=[], metadata={})
            .returning(types_t.c.id)
        ).scalar_one()
        win_id = conn.execute(
            select(set_types_t.c.id).where(
                (set_types_t.c.game_id == game_id) & (set_types_t.c.code == "WINNING")
            )
        ).scalar_one()
        draw_id = conn.execute(
            insert(draws_t)
            .values(
                game_id=game_id,
                draw_type_id=type_id,
                draw_date=future,
                source_id=env.source_id,
                ingestion_run_id=env.run_id,
                collected_at=__import__("datetime").datetime.now(__import__("datetime").UTC),
                metadata={},
            )
            .returning(draws_t.c.id)
        ).scalar_one()
        conn.execute(
            insert(sets_t).values(draw_id=draw_id, set_type_id=win_id, numbers=[1, 2, 3, 4, 5])
        )

    result = run_quality(f"draw:{draw_id}", triggered_by="test")
    assert result["stats"]["invalidated"] == 1
    assert get_draw(env.run_id, future).status == "INVALID"

    runs_t = table("ops", "ingestion_runs")
    src_t = table("ops", "data_sources")
    with get_engine().begin() as conn:
        qsrc = conn.execute(select(src_t.c.id).where(src_t.c.code == "quality-engine")).scalar_one()
        conn.execute(
            delete(runs_t).where((runs_t.c.source_id == qsrc) & (runs_t.c.triggered_by == "test"))
        )
