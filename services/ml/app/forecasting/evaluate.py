"""Évaluation automatique des prévisions : dès que le tirage cible est en
base (VALID), comparaison TOP 5/TOP 10 vs numéros gagnants réels, insertion
du résultat IMMUABLE (trigger SQL). Appelée après chaque collecte.

Nettoyage : une prévision dont la date cible est dépassée depuis plus de
GRACE_DAYS sans qu'aucun tirage ne soit arrivé ne sera JAMAIS évaluable
(tirage annulé, ou calendrier du type mal estimé au moment de la génération).
Elle est alors SUPERSEDÉE — jamais supprimée : l'historique des expériences
reste intact, mais elle cesse d'apparaître comme « tirage à venir ».
"""

from __future__ import annotations

import datetime as dt

import structlog
from sqlalchemy import and_, insert, select, update

from app.core.db import get_engine, table
from app.core.runlog import RunLogger

log = structlog.get_logger()

FORECAST_SOURCE = "forecast-engine"
# Délai de grâce : la source publie parfois un tirage avec un jour de retard.
GRACE_DAYS = 2


def evaluate_forecasts(triggered_by: str = "manual") -> dict:
    runlog = RunLogger(FORECAST_SOURCE, triggered_by)
    try:
        stats = _evaluate(runlog)
        runlog.finish("SUCCESS", stats)
        return {"run_id": str(runlog.run_id), "status": "SUCCESS", "stats": stats}
    except Exception as exc:  # noqa: BLE001
        log.error("forecast_evaluation_failed", error=str(exc))
        runlog.finish("FAILED", {}, error=str(exc))
        raise


def _evaluate(runlog: RunLogger) -> dict:
    forecasts_t = table("ml", "forecasts")
    entries_t = table("ml", "forecast_entries")
    results_t = table("ml", "forecast_results")
    draws_t = table("core", "draws")
    sets_t = table("core", "draw_number_sets")
    set_types_t = table("core", "game_number_set_types")

    engine_db = get_engine()
    evaluated = 0
    hits_summary: dict[str, int] = {str(k): 0 for k in range(6)}

    with engine_db.connect() as conn:
        # Prévisions ACTIVES sans résultat dont le tirage cible VALID existe.
        pending = conn.execute(
            select(
                forecasts_t.c.id,
                forecasts_t.c.draw_type_id,
                forecasts_t.c.target_date,
                draws_t.c.id.label("draw_id"),
            )
            .select_from(
                forecasts_t.join(
                    draws_t,
                    (draws_t.c.draw_type_id == forecasts_t.c.draw_type_id)
                    & (draws_t.c.draw_date == forecasts_t.c.target_date)
                    & (draws_t.c.status == "VALID"),
                ).outerjoin(results_t, results_t.c.forecast_id == forecasts_t.c.id)
            )
            .where(forecasts_t.c.superseded_at.is_(None) & results_t.c.id.is_(None))
        ).all()

    for row in pending:
        with engine_db.begin() as conn:
            actual = conn.execute(
                select(sets_t.c.numbers)
                .select_from(
                    sets_t.join(set_types_t, sets_t.c.set_type_id == set_types_t.c.id)
                )
                .where((sets_t.c.draw_id == row.draw_id) & (set_types_t.c.code == "WINNING"))
            ).scalar()
            if actual is None:
                continue
            # `actual` porte l'ORDRE DE SORTIE publié — conservé tel quel dans
            # le résultat ; les hits se calculent en ensembliste.
            actual_order = [int(n) for n in actual]
            actual_set = set(actual_order)

            entry_rows = conn.execute(
                select(entries_t.c.rank, entries_t.c.number)
                .where(entries_t.c.forecast_id == row.id)
                .order_by(entries_t.c.rank)
            ).all()
            top5 = {int(e.number) for e in entry_rows if e.rank <= 5}
            top10 = {int(e.number) for e in entry_rows}
            matched5 = sorted(top5 & actual_set)
            matched10 = sorted(top10 & actual_set)

            conn.execute(
                insert(results_t).values(
                    forecast_id=row.id,
                    actual_draw_id=row.draw_id,
                    actual_numbers=actual_order,
                    hits_top5=len(matched5),
                    hits_top10=len(matched10),
                    matched_numbers=matched5,
                )
            )
        evaluated += 1
        hits_summary[str(len(matched5))] += 1
        if len(matched5) >= 3:
            runlog.event(
                "INFO",
                f"Hit notable : {len(matched5)}/5 sur {row.target_date} (numéros {matched5})",
            )

    obsolete = _supersede_unevaluable(engine_db, forecasts_t, results_t, draws_t, runlog)

    stats = {
        "evaluated": evaluated,
        "hits_top5_distribution": hits_summary,
        "superseded_unevaluable": obsolete,
    }
    if evaluated or obsolete:
        runlog.event("INFO", "Évaluations effectuées", stats)
    return stats


def _supersede_unevaluable(engine_db, forecasts_t, results_t, draws_t, runlog: RunLogger) -> int:
    """Retire des « tirages à venir » les prévisions devenues inévaluables :
    cible dépassée de plus de GRACE_DAYS et aucun tirage correspondant."""
    cutoff = dt.date.today() - dt.timedelta(days=GRACE_DAYS)
    has_draw = (
        select(draws_t.c.id)
        .where(
            and_(
                draws_t.c.draw_type_id == forecasts_t.c.draw_type_id,
                draws_t.c.draw_date == forecasts_t.c.target_date,
            )
        )
        .exists()
    )
    has_result = (
        select(results_t.c.id).where(results_t.c.forecast_id == forecasts_t.c.id).exists()
    )
    with engine_db.begin() as conn:
        result = conn.execute(
            update(forecasts_t)
            .where(
                forecasts_t.c.superseded_at.is_(None)
                & (forecasts_t.c.target_date < cutoff)
                & ~has_result
                & ~has_draw
            )
            .values(superseded_at=dt.datetime.now(dt.UTC))
        )
    count = result.rowcount or 0
    if count:
        runlog.event(
            "INFO",
            f"{count} prévision(s) sans tirage correspondant archivée(s) (cible < {cutoff})",
        )
    return count
