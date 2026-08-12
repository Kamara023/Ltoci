"""Statistiques de forme des tirages (analyses E→J) — fonctions PURES.

Métriques par tirage :
  sum               — somme des numéros ;
  spread            — étendue (max − min) ;
  odd_count         — nb de numéros impairs (0..5) ;
  high_count        — nb de numéros « hauts » (> milieu de plage, ex. 46–90) ;
  consecutive_count — nb de paires adjacentes consécutives dans le tirage trié
                      (ex. {4,5,6,20,30} → 2) ;
  repeat_prev_count — nb de numéros communs avec le tirage PRÉCÉDENT DU MÊME
                      TYPE (comparer des types différents n'aurait pas de sens).

Matérialisation : histogramme {valeur: effectif} + résumé
{mean, median, min, max, std} par métrique.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from app.statistics.numbers import window_slice

METRICS = ["sum", "spread", "odd_count", "high_count", "consecutive_count", "repeat_prev_count"]


def _histogram_and_summary(values: list[int]) -> tuple[dict, dict]:
    if not values:
        return {}, {}
    arr = np.array(values)
    histogram = {str(k): int(v) for k, v in pd.Series(arr).value_counts().sort_index().items()}
    summary = {
        "count": int(arr.size),
        "mean": round(float(arr.mean()), 4),
        "median": float(np.median(arr)),
        "min": int(arr.min()),
        "max": int(arr.max()),
        "std": round(float(arr.std()), 4),
    }
    return histogram, summary


def compute_shape_rows(
    seq: pd.DataFrame,
    number_min: int,
    number_max: int,
    window_size: int | None,
) -> list[dict]:
    """`seq` : DataFrame chronologique (colonnes type_code, numbers).
    Retourne une ligne par métrique : {metric, histogram, summary}."""
    win = window_slice(seq, window_size)
    if win.empty:
        return []
    high_threshold = (number_min + number_max) / 2  # 45.5 pour 1..90 → hauts = 46..90

    values: dict[str, list[int]] = {m: [] for m in METRICS}
    for numbers in win["numbers"]:
        s = sorted(numbers)
        values["sum"].append(sum(s))
        values["spread"].append(s[-1] - s[0])
        values["odd_count"].append(sum(1 for x in s if x % 2 == 1))
        values["high_count"].append(sum(1 for x in s if x > high_threshold))
        values["consecutive_count"].append(
            sum(1 for a, b in zip(s, s[1:], strict=False) if b - a == 1)
        )

    # Répétitions : par type de tirage, entre tirages successifs du même type.
    if "type_code" in win.columns:
        for _, group in win.groupby("type_code", sort=False):
            prev: set[int] | None = None
            for numbers in group["numbers"]:
                current = set(numbers)
                if prev is not None:
                    values["repeat_prev_count"].append(len(current & prev))
                prev = current

    rows: list[dict] = []
    for metric in METRICS:
        histogram, summary = _histogram_and_summary(values[metric])
        if not histogram:
            continue
        rows.append({"metric": metric, "histogram": histogram, "summary": summary})
    return rows
