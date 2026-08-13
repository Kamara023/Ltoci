"""Backtesting walk-forward des stratégies — la preuve honnête du produit.

Pour t de min_history à T−1 : les features ne connaissent QUE [0..t−1]
(cutoff = tirage t−1, structurellement antérieur à la cible t), chaque
stratégie joue sa meilleure combinaison (top-5 des poids), comparée aux
numéros réellement sortis en t.

PHASE 11 : la méthode de prévision FORECAST_CONSENSUS (moyenne pondérée
des poids de toutes les stratégies) est backtestée elle aussi —
(a) sur la séquence globale, (b) PAR TYPE DE TIRAGE (39 états incrémentaux
indépendants mis à jour en une seule passe chronologique), car c'est le
cadre réel des prévisions. Distribution 0→5 persistée (3/5, 4/5, 5/5
explicitement comptés).

STRATEGY_RANDOM est toujours incluse : référence de comparaison, et la
convergence de sa moyenne vers E = 5×5/90 ≈ 0,2778 auto-valide le harnais.
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
from app.forecasting.consensus import DEFAULT_MODEL_WEIGHTS
from app.generation.strategies import REGISTRY, build_spec
from app.statistics.loader import load_config, load_valid_draws

log = structlog.get_logger()

BACKTEST_SOURCE = "backtest-engine"
THEORY_AVG = 5 * 5 / 90  # ≈ 0,2778 correspondances attendues par pas
POINT_BATCH = 5000
ML_CODES = {"STRATEGY_ML_RF", "STRATEGY_ML_GB"}
CONSENSUS_CODE = "FORECAST_CONSENSUS"
# Ré-entraînement périodique des modèles ML pendant le walk-forward — seul
# l'historique antérieur au pas courant est utilisé (inputs.history).
ML_RETRAIN_EVERY = 250
MIN_TYPE_STEPS = 200  # historique minimal d'un type avant de l'évaluer


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
    if len(a) < 2 or len(b) < 2:
        return 1.0
    va, vb = a.var(ddof=1), b.var(ddof=1)
    se = math.sqrt(va / len(a) + vb / len(b))
    if se == 0:
        return 1.0
    z = (a.mean() - b.mean()) / se
    return round(math.erfc(abs(z) / math.sqrt(2)), 6)


def _top5(weights_tail: np.ndarray, lo: int) -> list[int]:
    order = np.argsort(-weights_tail, kind="stable")[:5]
    return sorted(int(i) + lo for i in order)


def _combine(weights_by_code: dict[str, np.ndarray], lo: int) -> np.ndarray:
    """Consensus : moyenne pondérée des vecteurs normalisés (queue lo..hi)."""
    combined = None
    total = 0.0
    for code, w in weights_by_code.items():
        cw = DEFAULT_MODEL_WEIGHTS.get(code, 0.0)
        if cw <= 0:
            continue
        tail = np.clip(w[lo:].astype(float), 0, None)
        m = tail.max()
        norm = tail / m if m > 0 else np.zeros_like(tail)
        combined = norm * cw if combined is None else combined + norm * cw
        total += cw
    if combined is None or total == 0:
        raise ValueError("Consensus impossible : aucun poids")
    return combined / total


def _metrics(arr: np.ndarray, random_arr: np.ndarray, years: list[int] | None, extra: dict) -> dict:
    by_year: dict[str, float] = {}
    if years:
        yarr = np.array(years)
        for year in sorted(set(years)):
            by_year[str(year)] = round(float(arr[yarr == year].mean()), 4)
    return {
        "points": int(len(arr)),
        "avg_matches": round(float(arr.mean()), 4),
        "match_distribution": {str(k): int((arr == k).sum()) for k in range(6)},
        "by_year": by_year,
        "vs_theory": {"expected_avg": round(THEORY_AVG, 4)},
        "vs_random": {
            "random_avg": round(float(random_arr.mean()), 4),
            "delta": round(float(arr.mean() - random_arr.mean()), 4),
            "p_value": _pvalue_two_means(arr, random_arr),
        },
        **extra,
    }


def _run(strategy_codes: list[str] | None, min_history: int, runlog: RunLogger) -> dict:
    config = load_config()
    data = load_valid_draws(config)
    seq = data.sequences.get("WINNING")
    if seq is None or len(seq) <= min_history + 10:
        raise ValueError("Historique insuffisant pour un backtest")
    set_cfg = config.set_types["WINNING"]
    lo = set_cfg["number_min"]
    hi = set_cfg["number_max"]

    numbers_col = [sorted(set(ns)) for ns in seq["numbers"]]
    ids = seq["draw_id"].tolist()
    dates = seq["draw_date"].tolist()
    type_ids = seq["draw_type_id"].tolist()
    total = len(numbers_col)

    strategies_t = table("ml", "strategies")
    with get_engine().connect() as conn:
        rows = conn.execute(
            select(strategies_t.c.id, strategies_t.c.code)
            .where(strategies_t.c.is_enabled)
            .order_by(strategies_t.c.code)
        ).all()
    enabled = {r.code: str(r.id) for r in rows if r.code in REGISTRY or r.code == CONSENSUS_CODE}
    wanted = set(strategy_codes) if strategy_codes else set(enabled)
    wanted &= set(enabled)
    wanted.add("STRATEGY_RANDOM")
    codes = sorted(wanted)
    weight_codes = [c for c in codes if c not in ("STRATEGY_RANDOM", CONSENSUS_CODE)]
    with_consensus = CONSENSUS_CODE in codes

    inputs = IncrementalInputs(lo, hi)
    for i in range(min_history):
        inputs.update(numbers_col[i])
    type_states: dict[str, IncrementalInputs] = {}
    for i in range(min_history):  # états par type alignés sur le préchauffage
        state = type_states.setdefault(type_ids[i], IncrementalInputs(lo, hi))
        state.update(numbers_col[i])

    rngs = {code: make_rng(code, f"backtest:{ids[-1]}") for code in codes}
    matches_by_code: dict[str, list[int]] = {code: [] for code in codes}
    points_by_code: dict[str, list[dict]] = {code: [] for code in codes}
    type_matches: dict[str, list[int]] = {}
    ml_models: dict[str, object] = {}
    ml_last_train: dict[str, int] = {}

    runlog.event(
        "INFO",
        f"Walk-forward : {total - min_history} pas × {len(codes)} stratégies"
        + (" + consensus par type" if with_consensus else ""),
    )

    from app.mlmodels.trainer import predict_weights, train_model

    for t in range(min_history, total):
        actual = set(numbers_col[t])
        weights_by_code: dict[str, np.ndarray] = {}

        for code in weight_codes:
            if code in ML_CODES:
                if code not in ml_models or t - ml_last_train[code] >= ML_RETRAIN_EVERY:
                    ml_models[code] = train_model(code, inputs.history, lo, hi, train_window=3000)
                    ml_last_train[code] = t
                weights_by_code[code] = predict_weights(ml_models[code], inputs)
            else:
                weights_by_code[code] = build_spec(code, inputs).weights

        for code in codes:
            if code == "STRATEGY_RANDOM":
                predicted = sorted(
                    rngs[code].choice(np.arange(lo, hi + 1), size=5, replace=False).tolist()
                )
            elif code == CONSENSUS_CODE:
                predicted = _top5(_combine(weights_by_code, lo), lo)
            else:
                predicted = _top5(
                    np.clip(weights_by_code[code][lo:].astype(float), 0, None), lo
                )
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

        # Consensus PAR TYPE : cadre réel des prévisions (interprétables seules
        # + modèles ML globaux appliqués aux features du type).
        if with_consensus:
            tid = type_ids[t]
            tstate = type_states.setdefault(tid, IncrementalInputs(lo, hi))
            if tstate.n_draws >= MIN_TYPE_STEPS:
                tw: dict[str, np.ndarray] = {}
                for code in weight_codes:
                    if code in ML_CODES:
                        if code in ml_models:
                            tw[code] = predict_weights(ml_models[code], tstate)
                    else:
                        tw[code] = build_spec(code, tstate).weights
                predicted_t = _top5(_combine(tw, lo), lo)
                type_matches.setdefault(tid, []).append(len(actual.intersection(predicted_t)))
            tstate.update(numbers_col[t])

        inputs.update(numbers_col[t])

    random_arr = np.array(matches_by_code["STRATEGY_RANDOM"], dtype=float)
    from_date, to_date = dates[min_history], dates[-1]
    years = [d.year for d in dates[min_history:]]

    backtests_t = table("ml", "backtests")
    points_t = table("ml", "backtest_points")
    summary: dict[str, dict] = {}

    for code in codes:
        arr = np.array(matches_by_code[code], dtype=float)
        metrics = _metrics(
            arr,
            random_arr,
            years,
            {
                "method": "walk-forward, meilleure combinaison (top-5 des poids) à chaque pas",
                **(
                    {"ml_retrain_every": ML_RETRAIN_EVERY}
                    if code in ML_CODES or code == CONSENSUS_CODE
                    else {}
                ),
            },
        )
        with get_engine().begin() as conn:
            conn.execute(delete(backtests_t).where(backtests_t.c.strategy_id == enabled[code]))
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

    # Backtests PAR TYPE du consensus (métriques seules, sans points).
    per_type_count = 0
    if with_consensus and type_matches:
        with get_engine().begin() as conn:
            for tid, values in type_matches.items():
                if len(values) < 50:
                    continue
                arr = np.array(values, dtype=float)
                metrics = _metrics(
                    arr,
                    random_arr,
                    None,
                    {"method": "consensus par type de tirage (walk-forward)"},
                )
                conn.execute(
                    insert(backtests_t).values(
                        game_id=config.game_id,
                        draw_type_id=tid,
                        strategy_id=enabled[CONSENSUS_CODE],
                        config={"min_type_steps": MIN_TYPE_STEPS, "evaluation": "consensus-top5"},
                        from_draw_date=from_date,
                        to_draw_date=to_date,
                        status="SUCCESS",
                        metrics=metrics,
                        finished_at=dt.datetime.now(dt.UTC),
                    )
                )
                per_type_count += 1

    return {
        "strategies": len(codes),
        "points_per_strategy": total - min_history,
        "per_type_backtests": per_type_count,
        "from": str(from_date),
        "to": str(to_date),
        "summary": summary,
    }
