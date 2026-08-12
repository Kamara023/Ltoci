"""Statistiques par numéro (analyses A, B, C, K) — fonctions PURES.

Sémantique :
- fréquence relative = apparitions / nb de tirages de la fenêtre ;
- retard actuel = nb de tirages depuis la dernière apparition
  (= taille de la fenêtre si jamais vu) ;
- retards moyen/max = écarts entre apparitions successives dans la fenêtre ;
- trend = pente (pour 100 tirages) de la régression linéaire sur la série
  binaire d'apparition — indicateur DESCRIPTIF, jamais prédictif.
Les 90 numéros sont matérialisés, même à fréquence nulle.
"""

from __future__ import annotations

import numpy as np
import pandas as pd


def window_slice(seq: pd.DataFrame, window_size: int | None) -> pd.DataFrame:
    if window_size is None or len(seq) <= window_size:
        return seq
    return seq.iloc[-window_size:].reset_index(drop=True)


def compute_number_rows(
    seq: pd.DataFrame,
    number_min: int,
    number_max: int,
    window_size: int | None,
) -> list[dict]:
    """`seq` : DataFrame chronologique (colonnes draw_date, numbers)."""
    win = window_slice(seq, window_size)
    n = len(win)
    rows: list[dict] = []
    if n == 0:
        return rows

    positions: dict[int, list[int]] = {num: [] for num in range(number_min, number_max + 1)}
    for pos, numbers in enumerate(win["numbers"]):
        for num in numbers:
            if number_min <= num <= number_max:
                positions[num].append(pos)
    dates = win["draw_date"].tolist()
    x = np.arange(n)

    for num in range(number_min, number_max + 1):
        pos = positions[num]
        freq = len(pos)
        if freq:
            current_gap = n - 1 - pos[-1]
            last_seen = dates[pos[-1]]
            diffs = np.diff(pos) if freq >= 2 else None
            avg_gap = round(float(diffs.mean()), 2) if diffs is not None and len(diffs) else None
            max_gap = int(diffs.max()) if diffs is not None and len(diffs) else None
        else:
            current_gap = n
            last_seen = None
            avg_gap = None
            max_gap = None

        if n >= 2:
            y = np.zeros(n)
            y[pos] = 1.0
            slope = float(np.polyfit(x, y, 1)[0]) * 100.0
            trend = round(slope, 4)
        else:
            trend = None

        rows.append(
            {
                "number": num,
                "frequency": freq,
                "relative_freq": round(freq / n, 6),
                "current_gap": int(current_gap),
                "avg_gap": avg_gap,
                "max_gap": max_gap,
                "last_seen_date": last_seen,
                "trend": trend,
            }
        )
    return rows
