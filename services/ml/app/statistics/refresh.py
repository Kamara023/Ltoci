"""Matérialisation des statistiques dans analytics.* (recalcul complet).

Dimensions :
- number_stats : ensemble × (type de tirage + agrégat NULL) × fenêtre ;
- pair_stats / draw_shape_stats : ensemble × fenêtre (tous types confondus),
  conformément aux clés primaires posées en PHASE 1.

Recalcul intégral en transaction (DELETE puis INSERT) — la simplicité prime
à cette volumétrie ; `as_of_draw_id` (dernier VALID inclus) et `computed_at`
tracent la fraîcheur de chaque ligne.
"""

from __future__ import annotations

import datetime as dt
import time

import structlog
from sqlalchemy import delete, insert

from app.core.db import get_engine, table
from app.core.runlog import RunLogger
from app.statistics.loader import LoadedData, load_config, load_valid_draws
from app.statistics.numbers import compute_number_rows
from app.statistics.pairs import compute_pair_rows
from app.statistics.shapes import compute_shape_rows

log = structlog.get_logger()

STATS_SOURCE = "stats-engine"
WINDOWS: list[tuple[str, int | None]] = [
    ("ALL", None),
    ("LAST_100", 100),
    ("LAST_50", 50),
    ("LAST_20", 20),
    ("LAST_10", 10),
]
INSERT_BATCH = 5000


def refresh_statistics(triggered_by: str = "manual") -> dict:
    runlog = RunLogger(STATS_SOURCE, triggered_by)
    started = time.monotonic()
    try:
        stats = _refresh(runlog)
        stats["duration_s"] = round(time.monotonic() - started, 2)
        runlog.finish("SUCCESS", stats)
        return {"run_id": str(runlog.run_id), "status": "SUCCESS", "stats": stats}
    except Exception as exc:  # noqa: BLE001
        log.error("stats_refresh_failed", error=str(exc))
        runlog.finish("FAILED", {}, error=str(exc))
        raise


def _refresh(runlog: RunLogger) -> dict:
    config = load_config()
    data = load_valid_draws(config)
    if data.last_draw_id is None:
        runlog.event("WARN", "Aucun tirage VALID — rien à matérialiser")
        return {"rows_numbers": 0, "rows_pairs": 0, "rows_shapes": 0}

    now = dt.datetime.now(dt.UTC)
    number_rows, pair_rows, shape_rows = build_all_rows(data, now)

    numbers_t = table("analytics", "number_stats")
    pairs_t = table("analytics", "pair_stats")
    shapes_t = table("analytics", "draw_shape_stats")

    with get_engine().begin() as conn:
        conn.execute(delete(numbers_t).where(numbers_t.c.game_id == config.game_id))
        conn.execute(delete(pairs_t).where(pairs_t.c.game_id == config.game_id))
        conn.execute(delete(shapes_t).where(shapes_t.c.game_id == config.game_id))
        for start in range(0, len(number_rows), INSERT_BATCH):
            conn.execute(insert(numbers_t), number_rows[start : start + INSERT_BATCH])
        for start in range(0, len(pair_rows), INSERT_BATCH):
            conn.execute(insert(pairs_t), pair_rows[start : start + INSERT_BATCH])
        conn.execute(insert(shapes_t), shape_rows)

    stats = {
        "rows_numbers": len(number_rows),
        "rows_pairs": len(pair_rows),
        "rows_shapes": len(shape_rows),
        "valid_draws": {code: len(seq) for code, seq in data.sequences.items()},
        "as_of_draw_id": data.last_draw_id,
    }
    runlog.event("INFO", "Matérialisation terminée", stats)
    return stats


def build_all_rows(
    data: LoadedData, now: dt.datetime
) -> tuple[list[dict], list[dict], list[dict]]:
    """Construit toutes les lignes à insérer (pur vis-à-vis de la DB)."""
    config = data.config
    number_rows: list[dict] = []
    pair_rows: list[dict] = []
    shape_rows: list[dict] = []

    for set_code, seq in data.sequences.items():
        set_cfg = config.set_types[set_code]
        scopes: list[tuple[str | None, object]] = [(None, seq)]  # agrégat tous types
        scopes += [
            (str(type_id), group.reset_index(drop=True))
            for type_id, group in seq.groupby("draw_type_id", sort=False)
        ]

        for window_code, window_size in WINDOWS:
            for draw_type_id, scoped in scopes:
                rows = compute_number_rows(
                    scoped, set_cfg["number_min"], set_cfg["number_max"], window_size
                )
                for r in rows:
                    number_rows.append(
                        {
                            **r,
                            "game_id": config.game_id,
                            "set_type_id": set_cfg["id"],
                            "draw_type_id": draw_type_id,
                            "window_code": window_code,
                            "computed_at": now,
                            "as_of_draw_id": data.last_draw_id,
                        }
                    )

            for r in compute_pair_rows(seq, window_size):
                pair_rows.append(
                    {
                        **r,
                        "game_id": config.game_id,
                        "set_type_id": set_cfg["id"],
                        "window_code": window_code,
                        "computed_at": now,
                    }
                )
            for r in compute_shape_rows(
                seq, set_cfg["number_min"], set_cfg["number_max"], window_size
            ):
                shape_rows.append(
                    {
                        "game_id": config.game_id,
                        "set_type_id": set_cfg["id"],
                        "window_code": window_code,
                        "metric": r["metric"],
                        "histogram": r["histogram"],
                        "summary": r["summary"],
                        "computed_at": now,
                    }
                )
    return number_rows, pair_rows, shape_rows
