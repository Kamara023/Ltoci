"""Tests PHASE 11 — moteur de prévisions TOP 5.

Partie pure : consensus vérifié sur des cas jouets calculés à la main.
Partie intégration (skip sans DB) : cycle générer → supersede → évaluer →
figé, immuabilité SQL, nettoyage via l'échappatoire de maintenance.
"""

import datetime as dt
import uuid

import numpy as np
import pytest
from sqlalchemy import ARRAY, SmallInteger, cast, delete, func, insert, select, text

from app.core.db import db_is_up, get_engine, table
from app.forecasting.consensus import (
    DEFAULT_MODEL_WEIGHTS,
    build_consensus,
    consensus_top5_numbers,
)
from app.generation.features import build_inputs

# ---------------------------------------------------------------------------
# Partie PURE — consensus sur historique synthétique
# ---------------------------------------------------------------------------


def _toy_inputs(lo: int = 1, hi: int = 20, n: int = 60):
    """Historique biaisé : 7 sort à chaque tirage, 8 souvent, le reste tourne."""
    import pandas as pd

    rng = np.random.default_rng(42)
    rows = []
    for i in range(n):
        pool = [x for x in range(lo, hi + 1) if x not in (7, 8)]
        picks = rng.choice(pool, size=3, replace=False).tolist()
        numbers = sorted({7, *(picks + ([8] if i % 2 == 0 else [pool[0]]))})[:5]
        while len(numbers) < 5:
            extra = int(rng.choice(pool))
            if extra not in numbers:
                numbers.append(extra)
        rows.append(
            {
                "draw_id": str(i),
                "draw_date": dt.date(2024, 1, 1) + dt.timedelta(days=i),
                "numbers": sorted(numbers),
            }
        )
    return build_inputs(pd.DataFrame(rows), lo, hi)


INTERPRETABLE_ONLY = {
    **{k: 0.0 for k in DEFAULT_MODEL_WEIGHTS},
    "STRATEGY_FREQUENCY": 1.0,
    "STRATEGY_RECENCY": 1.0,
}


def test_cible_prochaine_occurrence_selon_calendrier():
    """La cible d'une prévision est le PROCHAIN tirage réel du type, d'après
    son calendrier hebdomadaire — jamais un jour où le jeu ne sort pas."""
    from app.forecasting.service import next_target_date

    vendredi = dt.date(2026, 8, 14)  # ISO 5

    # Jeu quotidien : aujourd'hui s'il n'a pas encore tiré, demain sinon.
    tous_les_jours = [1, 2, 3, 4, 5, 6, 7]
    assert next_target_date(tous_les_jours, vendredi, False) == vendredi
    assert next_target_date(tous_les_jours, vendredi, True) == dt.date(2026, 8, 15)

    # Jeu du lundi : depuis vendredi, la prochaine occurrence est le lundi.
    assert next_target_date([1], vendredi, False) == dt.date(2026, 8, 17)

    # Jeu du vendredi déjà tiré aujourd'hui : vendredi PROCHAIN (+7 jours).
    assert next_target_date([5], vendredi, True) == dt.date(2026, 8, 21)
    assert next_target_date([5], vendredi, False) == vendredi

    # Week-end : samedi depuis vendredi.
    assert next_target_date([6, 7], vendredi, False) == dt.date(2026, 8, 15)

    # Calendrier inconnu (tirage exceptionnel) : AUCUNE prévision émise.
    assert next_target_date([], vendredi, False) is None
    assert next_target_date(None, vendredi, False) is None


def test_consensus_structure_et_ranking():
    inputs = _toy_inputs()
    result = build_consensus(inputs, INTERPRETABLE_ONLY, top_n=10)

    assert len(result.entries) == 10
    assert [e.rank for e in result.entries] == list(range(1, 11))
    numbers = [e.number for e in result.entries]
    assert len(set(numbers)) == 10, "numéros du TOP 10 tous distincts"
    scores = [e.score for e in result.entries]
    assert scores == sorted(scores, reverse=True), "scores décroissants avec le rang"
    # 7 sort à CHAQUE tirage : il domine fréquence ET récence → rang 1,
    # score = moyenne de deux vecteurs normalisés à max 1 → exactement 1.
    assert result.entries[0].number == 7
    assert result.entries[0].score == pytest.approx(1.0)
    assert result.models_used == 2
    for e in result.entries:
        assert e.confidence in {"faible", "moyenne", "forte"}
        assert 0 <= e.consensus_count <= result.models_used
        assert e.factors["dominants"], "facteurs dominants présents"


def test_consensus_deterministe_et_top5():
    inputs = _toy_inputs()
    r1 = build_consensus(inputs, INTERPRETABLE_ONLY)
    r2 = build_consensus(inputs, INTERPRETABLE_ONLY)
    assert [(e.number, e.score) for e in r1.entries] == [
        (e.number, e.score) for e in r2.entries
    ]
    top5 = consensus_top5_numbers(inputs, INTERPRETABLE_ONLY)
    assert top5 == sorted(e.number for e in r1.entries[:5])


def test_consensus_precompute_remplace_le_modele():
    """Un vecteur précalculé (cas ML) est intégré sans passer par build_spec."""
    inputs = _toy_inputs()
    fake_ml = np.zeros(inputs.number_max + 1)
    fake_ml[13] = 1.0  # le « modèle » ne croit qu'au 13
    weights = {**INTERPRETABLE_ONLY, "STRATEGY_ML_GB": 5.0}
    result = build_consensus(
        inputs, weights, precomputed={"STRATEGY_ML_GB": fake_ml}
    )
    assert result.model_versions["STRATEGY_ML_GB"]["precomputed"] is True
    assert result.models_used == 3
    # Poids 5 vs 1+1 : le 13 (score ≈ 5/7 + composantes) doit entrer au TOP 10.
    assert 13 in [e.number for e in result.entries]


def test_consensus_pondération_zero_exclut():
    inputs = _toy_inputs()
    result = build_consensus(inputs, INTERPRETABLE_ONLY)
    assert "STRATEGY_COLD_NUMBERS" not in result.model_versions
    assert "STRATEGY_RANDOM" not in result.model_versions


def test_consensus_sans_strategie_leve():
    inputs = _toy_inputs()
    with pytest.raises(ValueError):
        build_consensus(inputs, {k: 0.0 for k in DEFAULT_MODEL_WEIGHTS})


def test_confiance_forte_si_accord_et_marge():
    """Cas construit : 2 modèles d'accord sur le même top → confiance forte."""
    inputs = _toy_inputs()
    result = build_consensus(inputs, INTERPRETABLE_ONLY)
    top1 = result.entries[0]
    # 7 est dans le top10 des deux modèles (accord 100 %) avec un score
    # de 1.0 largement au-dessus du 11e → forte, par construction.
    assert top1.consensus_count == 2
    assert top1.confidence == "forte"


# ---------------------------------------------------------------------------
# Partie INTÉGRATION — cycle réel sur la base de dev
# ---------------------------------------------------------------------------

pytestmark_db = pytest.mark.skipif(
    not db_is_up(), reason="Base de données indisponible (docker compose up requis)"
)


def _cleanup_forecasts(conn, forecast_ids: list):
    """Purge de données de TEST uniquement — via l'échappatoire de maintenance
    (SET LOCAL, portée transaction) prévue exactement pour ce cas."""
    if not forecast_ids:
        return
    conn.execute(text("SET LOCAL app.allow_forecast_maintenance = 'on'"))
    results_t = table("ml", "forecast_results")
    entries_t = table("ml", "forecast_entries")
    forecasts_t = table("ml", "forecasts")
    conn.execute(delete(results_t).where(results_t.c.forecast_id.in_(forecast_ids)))
    conn.execute(delete(entries_t).where(entries_t.c.forecast_id.in_(forecast_ids)))
    conn.execute(delete(forecasts_t).where(forecasts_t.c.id.in_(forecast_ids)))


@pytestmark_db
def test_cycle_forecast_evaluation_immuabilite():
    """Sur un tirage RÉEL passé : forecast artificiel → évaluation → hits
    corrects → immuabilité SQL vérifiée → nettoyage par l'échappatoire."""
    from sqlalchemy.exc import DBAPIError

    engine = get_engine()
    draws_t = table("core", "draws")
    sets_t = table("core", "draw_number_sets")
    set_types_t = table("core", "game_number_set_types")
    forecasts_t = table("ml", "forecasts")
    entries_t = table("ml", "forecast_entries")
    results_t = table("ml", "forecast_results")

    with engine.connect() as conn:
        # Tirage réel SANS prévision active sur la même cible : l'index unique
        # uq_forecast_active_target interdit deux prévisions actives par cible.
        occupied = (
            select(forecasts_t.c.id)
            .where(
                (forecasts_t.c.draw_type_id == draws_t.c.draw_type_id)
                & (forecasts_t.c.target_date == draws_t.c.draw_date)
                & forecasts_t.c.superseded_at.is_(None)
            )
            .exists()
        )
        draw = conn.execute(
            select(
                draws_t.c.id,
                draws_t.c.game_id,
                draws_t.c.draw_type_id,
                draws_t.c.draw_date,
                sets_t.c.numbers,
            )
            .select_from(
                draws_t.join(sets_t, sets_t.c.draw_id == draws_t.c.id).join(
                    set_types_t, sets_t.c.set_type_id == set_types_t.c.id
                )
            )
            .where(
                (draws_t.c.status == "VALID") & (set_types_t.c.code == "WINNING") & ~occupied
            )
            .order_by(draws_t.c.draw_date.desc())
            .limit(1)
        ).one()
    actual = sorted(int(n) for n in draw.numbers)
    # TOP 10 artificiel : 3 numéros réellement sortis aux rangs 1-3 (dont
    # 2 dans le top 5), le reste choisi hors tirage.
    others = [n for n in range(1, 91) if n not in actual]
    top10 = actual[:2] + others[:3] + [actual[2]] + others[3:7]
    assert len(top10) == 10
    expected_hits5 = len(set(top10[:5]) & set(actual))  # = 2
    expected_hits10 = len(set(top10) & set(actual))  # = 3

    forecast_id = str(uuid.uuid4())
    with engine.begin() as conn:
        conn.execute(
            insert(forecasts_t).values(
                id=forecast_id,
                game_id=str(draw.game_id),
                draw_type_id=str(draw.draw_type_id),
                target_date=draw.draw_date,
                dataset_cutoff_draw_id=str(draw.id),
                model_versions={"test": True},
                config={"test": True},
            )
        )
        for rank, number in enumerate(top10, start=1):
            conn.execute(
                insert(entries_t).values(
                    forecast_id=forecast_id,
                    rank=rank,
                    number=number,
                    score=round(1.0 - rank * 0.05, 6),
                    confidence="faible",
                    factors={"test": True},
                    consensus_count=1,
                )
            )

    try:
        from app.forecasting.evaluate import evaluate_forecasts

        stats = evaluate_forecasts(triggered_by="test")["stats"]
        assert stats["evaluated"] >= 1

        with engine.connect() as conn:
            result = conn.execute(
                select(results_t).where(results_t.c.forecast_id == forecast_id)
            ).one()
        assert result.hits_top5 == expected_hits5
        assert result.hits_top10 == expected_hits10
        assert sorted(result.matched_numbers) == sorted(set(top10[:5]) & set(actual))
        assert sorted(result.actual_numbers) == actual

        # IMMUABILITÉ : résultat non modifiable, forecast évalué gelé.
        with pytest.raises(DBAPIError, match="FORECAST_RESULT_IMMUTABLE"):
            with engine.begin() as conn:
                conn.execute(
                    text("UPDATE ml.forecast_results SET hits_top5 = 5 WHERE forecast_id = :f"),
                    {"f": forecast_id},
                )
        with pytest.raises(DBAPIError, match="FORECAST_FROZEN"):
            with engine.begin() as conn:
                conn.execute(
                    text("UPDATE ml.forecasts SET target_date = target_date WHERE id = :f"),
                    {"f": forecast_id},
                )
        with pytest.raises(DBAPIError, match="FORECAST_FROZEN"):
            with engine.begin() as conn:
                conn.execute(
                    text("DELETE FROM ml.forecasts WHERE id = :f"), {"f": forecast_id}
                )

        # Ré-évaluation : la prévision déjà évaluée n'est PAS retraitée
        # (toujours exactement UN résultat pour ce forecast).
        evaluate_forecasts(triggered_by="test")
        with engine.connect() as conn:
            n_results = conn.execute(
                select(results_t.c.id).where(results_t.c.forecast_id == forecast_id)
            ).all()
        assert len(n_results) == 1
    finally:
        with engine.begin() as conn:
            _cleanup_forecasts(conn, [forecast_id])
        # Runs de test dans le journal — purge.
        runs_t = table("ops", "ingestion_runs")
        src_t = table("ops", "data_sources")
        with engine.begin() as conn:
            src = conn.execute(
                select(src_t.c.id).where(src_t.c.code == "forecast-engine")
            ).scalar()
            if src:
                conn.execute(
                    delete(runs_t).where(
                        (runs_t.c.source_id == src) & (runs_t.c.triggered_by == "test")
                    )
                )

    # Le nettoyage a bien fonctionné (l'échappatoire est efficace ET explicite).
    with engine.connect() as conn:
        leftover = conn.execute(
            select(forecasts_t.c.id).where(forecasts_t.c.id == forecast_id)
        ).scalar()
    assert leftover is None


@pytestmark_db
def test_generation_reelle_et_supersede():
    """generate_forecasts crée une prévision par tirage RÉELLEMENT à venir
    (types au calendrier connu) ; re-génération = supersede tracé."""
    from app.forecasting.service import generate_forecasts

    forecasts_t = table("ml", "forecasts")
    types_t = table("core", "draw_types")
    engine = get_engine()

    with engine.connect() as conn:
        with_schedule = conn.execute(
            select(func.count())
            .select_from(types_t)
            .where(types_t.c.is_active & (types_t.c.days_of_week != cast([], ARRAY(SmallInteger))))
        ).scalar()
    if not with_schedule:
        pytest.skip(
            "Aucun type n'a de calendrier : lancer POST /internal/schedules/refresh "
            "(service ingestion) avant ce test"
        )

    r1 = generate_forecasts(triggered_by="test")["stats"]
    # Une cible par type au calendrier connu — jamais pour les autres.
    assert r1["targets"] == with_schedule
    assert r1["created"] + r1["skipped_frozen"] == r1["targets"]

    r2 = generate_forecasts(triggered_by="test")["stats"]
    # Chaque cible re-générée doit avoir supersedé la version précédente.
    assert r2["superseded"] == r2["created"]
    assert r2["created"] + r2["skipped_frozen"] == r2["targets"]

    with engine.connect() as conn:
        rows = conn.execute(
            select(
                forecasts_t.c.draw_type_id,
                forecasts_t.c.target_date,
            ).where(forecasts_t.c.superseded_at.is_(None))
        ).all()
    active_targets = [(str(r.draw_type_id), r.target_date) for r in rows]
    assert len(active_targets) == len(set(active_targets)), (
        "unicité : UNE prévision active par (type, date cible)"
    )

    # Chaque prévision active porte un TOP 10 complet.
    entries_t = table("ml", "forecast_entries")
    with engine.connect() as conn:
        bad = conn.execute(
            text(
                """
                SELECT f.id, count(e.id) AS n
                FROM ml.forecasts f
                LEFT JOIN ml.forecast_entries e ON e.forecast_id = f.id
                WHERE f.superseded_at IS NULL
                GROUP BY f.id HAVING count(e.id) <> 10
                """
            )
        ).all()
    assert not bad, f"prévisions sans TOP 10 complet : {bad}"
    assert entries_t is not None

    # Nettoyage du journal de test (les forecasts eux-mêmes RESTENT : ce sont
    # de vraies prévisions utilisables — générées par le vrai moteur).
    runs_t = table("ops", "ingestion_runs")
    src_t = table("ops", "data_sources")
    with engine.begin() as conn:
        src = conn.execute(
            select(src_t.c.id).where(src_t.c.code == "forecast-engine")
        ).scalar()
        if src:
            conn.execute(
                delete(runs_t).where(
                    (runs_t.c.source_id == src) & (runs_t.c.triggered_by == "test")
                )
            )
