"""Backtesting walk-forward des stratégies — la preuve honnête du produit.

Pour t de min_history à T−1 : les features ne connaissent QUE [0..t−1]
(cutoff = tirage t−1, structurellement antérieur à la cible t), la stratégie
joue sa meilleure combinaison (top-5 des poids — sa variante la plus
favorable), comparée aux numéros réellement sortis en t.

STRATEGY_RANDOM est toujours incluse : c'est la référence de comparaison,
et la convergence de sa moyenne vers E = 5×5/90 ≈ 0,2778 auto-valide le
harnais. L'attendu scientifique sur un tirage équitable est qu'AUCUNE
stratégie ne batte durablement cette baseline — et le produit l'affiche.
"""

from __future__ import annotations

import datetime as dt
import math
import time

import numpy as np
import structlog
from sqlalchemy import delete, insert, select

from app.analyst.templates import make_rng
from app.backtesting.incremental import IncrementalInputs
from app.core.db import get_engine, table
from app.core.runlog import RunLogger
from app.generation.strategies import REGISTRY, build_spec
from app.statistics.loader import load_config, load_valid_draws

log = structlog.get_logger()

BACKTEST_SOURCE = "backtest-engine"
THEORY_AVG = 5 * 5 / 90  # ≈ 0,2778 correspondances attendues par pas
POINT_BATCH = 5000


def run_backtest(
    strategy_codes: list[str] | None = None,
    min_history: int = 300,
    triggered_by: str = "manual",
) -> dict:
    runlog = RunLogger(BACKTEST_SOURCE, triggered_by)
    started = time.monotonic()
    try:
        stats = _run(strategy_codes, min_history, runlog)
        stats["duration_s"] = round(time.monotonic() - started, 2)
        runlog.finish("SUCCESS", stats)
        return {"run_id": str(runlog.run_id), "status": "SUCCESS", "stats": stats}
    except Exception as exc:  # noqa: BLE001
        log.error("backtest_failed", error=str(exc))
        runlog.finish("FAILED", {}, error=str(exc))
        raise


def _pvalue_two_means(a: np.ndarray, b: np.ndarray) -> float:
    """Test z bilatéral de différence de moyennes (approximation normale)."""
    va, vb = a.var(ddof=1), b.var(ddof=1)
    se = math.sqrt(va / len(a) + vb / len(b))
    if se == 0:
        return 1.0
    z = (a.mean() - b.mean()) / se
    return round(math.erfc(abs(z) / math.sqrt(2)), 6)


def _run(strategy_codes: list[str] | None, min_history: int, runlog: RunLogger) -> dict:
    config = load_config()
    data = load_valid_draws(config)
    seq = data.sequences.get("WINNING")
    if seq is None or len(seq) <= min_history + 10:
        raise ValueError("Historique insuffisant pour un backtest")
    set_cfg = config.set_types["WINNING"]

    numbers_col = [sorted(set(ns)) for ns in seq["numbers"]]
    ids = seq["draw_id"].tolist()
    dates = seq["draw_date"].tolist()
    total = len(numbers_col)

    strategies_t = table("ml", "strategies")
    with get_engine().connect() as conn:
        rows = conn.execute(
            select(strategies_t.c.id, strategies_t.c.code)
            .where(strategies_t.c.is_enabled)
            .order_by(strategies_t.c.code)
        ).all()
    enabled = {r.code: str(r.id) for r in rows if r.code in REGISTRY}
    wanted = set(strategy_codes) if strategy_codes else set(enabled)
    wanted &= set(enabled)
    wanted.add("STRATEGY_RANDOM")  # référence obligatoire
    codes = sorted(wanted)

    inputs = IncrementalInputs(set_cfg["number_min"], set_cfg["number_max"])
    for i in range(min_history):
        inputs.update(numbers_col[i])

    rngs = {code: make_rng(code, f"backtest:{ids[-1]}") for code in codes}
    matches_by_code: dict[str, list[int]] = {code: [] for code in codes}
    points_by_code: dict[str, list[dict]] = {code: [] for code in codes}
    lo = inputs.number_min

    runlog.event("INFO", f"Walk-forward : {total - min_history} pas × {len(codes)} stratégies")

    for t in range(min_history, total):
        actual = set(numbers_col[t])
        for code in codes:
            if code == "STRATEGY_RANDOM":
                predicted = sorted(
                    rngs[code]
                    .choice(
                        np.arange(lo, inputs.number_max + 1), size=5, replace=False
                    )
                    .tolist()
                )
            else:
                spec = build_spec(code, inputs)
                w = spec.weights[lo:]
                # Top-5 des poids, égalités départagées par numéro croissant.
                order = np.argsort(-w, kind="stable")[:5]
                predicted = sorted(int(i) + lo for i in order)
            m = len(actual.intersection(predicted))
            matches_by_code[code].append(m)
            points_by_code[code].append(
                {
                    "target_draw_id": ids[t],
                    "cutoff_draw_id": ids[t - 1],
                    "predicted": predicted,
                    "actual": sorted(actual),
                    "matches": m,
                }
            )
        inputs.update(numbers_col[t])

    random_arr = np.array(matches_by_code["STRATEGY_RANDOM"], dtype=float)
    from_date, to_date = dates[min_history], dates[-1]
    years = [d.year for d in dates[min_history:]]

    backtests_t = table("ml", "backtests")
    points_t = table("ml", "backtest_points")
    summary: dict[str, dict] = {}

    for code in codes:
        arr = np.array(matches_by_code[code], dtype=float)
        by_year: dict[str, float] = {}
        for year in sorted(set(years)):
            mask = np.array([y == year for y in years])
            by_year[str(year)] = round(float(arr[mask].mean()), 4)
        metrics = {
            "points": int(len(arr)),
            "avg_matches": round(float(arr.mean()), 4),
            "match_distribution": {
                str(k): int((arr == k).sum()) for k in range(6)
            },
            "by_year": by_year,
            "vs_theory": {"expected_avg": round(THEORY_AVG, 4)},
            "vs_random": {
                "random_avg": round(float(random_arr.mean()), 4),
                "delta": round(float(arr.mean() - random_arr.mean()), 4),
                "p_value": 1.0 if code == "STRATEGY_RANDOM"
                else _pvalue_two_means(arr, random_arr),
            },
            "method": "walk-forward, meilleure combinaison (top-5 des poids) à chaque pas",
        }
        with get_engine().begin() as conn:
            conn.execute(
                delete(backtests_t).where(backtests_t.c.strategy_id == enabled[code])
            )  # points en cascade — un seul backtest « courant » par stratégie
            backtest_id = conn.execute(
                insert(backtests_t)
                .values(
                    game_id=config.game_id,
                    draw_type_id=None,
                    strategy_id=enabled[code],
                    config={"min_history": min_history, "evaluation": "top5-weights"},
                    from_draw_date=from_date,
                    to_draw_date=to_date,
                    status="SUCCESS",
                    metrics=metrics,
                    finished_at=dt.datetime.now(dt.UTC),
                )
                .returning(backtests_t.c.id)
            ).scalar_one()
            points = [{"backtest_id": backtest_id, **p} for p in points_by_code[code]]
            for start in range(0, len(points), POINT_BATCH):
                conn.execute(insert(points_t), points[start : start + POINT_BATCH])
        summary[code] = {
            "avg": metrics["avg_matches"],
            "delta_vs_random": metrics["vs_random"]["delta"],
            "p_value": metrics["vs_random"]["p_value"],
        }
        runlog.event("INFO", f"{code}: moyenne {metrics['avg_matches']}", metrics["vs_random"])

    return {
        "strategies": len(codes),
        "points_per_strategy": total - min_history,
        "from": str(from_date),
        "to": str(to_date),
        "summary": summary,
    }
