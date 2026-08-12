"""Statistiques de paires / cooccurrences (analyse D) — fonctions PURES.

lift = observé / attendu, avec attendu = n · (freq_a/n) · (freq_b/n)
(hypothèse d'indépendance empirique). NB : le tirage sans remise induit
une légère dépendance négative structurelle (≈ facteur 0,81 pour 5/90) —
assumée et documentée, le lift reste un indicateur descriptif comparatif.
"""

from __future__ import annotations

from collections import Counter
from itertools import combinations

import pandas as pd

from app.statistics.numbers import window_slice


def compute_pair_rows(seq: pd.DataFrame, window_size: int | None) -> list[dict]:
    win = window_slice(seq, window_size)
    n = len(win)
    if n == 0:
        return []

    pair_counts: Counter = Counter()
    number_counts: Counter = Counter()
    for numbers in win["numbers"]:
        uniq = sorted(set(numbers))
        number_counts.update(uniq)
        pair_counts.update(combinations(uniq, 2))

    rows: list[dict] = []
    for (a, b), count in pair_counts.items():
        expected = number_counts[a] * number_counts[b] / n
        lift = round(count / expected, 4) if expected > 0 else None
        rows.append(
            {"number_a": int(a), "number_b": int(b), "frequency": int(count), "lift": lift}
        )
    return rows
