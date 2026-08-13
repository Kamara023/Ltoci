"""Entrées des stratégies — calculées une fois par génération, PURES.

Tous les tableaux sont indexés par numéro (taille number_max+1, indices
< number_min inutilisés) pour une lecture directe `arr[numero]`.
"""

from __future__ import annotations

from dataclasses import dataclass
from itertools import combinations

import numpy as np
import pandas as pd


@dataclass
class StrategyInputs:
    number_min: int
    number_max: int
    n_draws: int
    counts_all: np.ndarray      # apparitions sur tout l'historique
    counts_recent: np.ndarray   # apparitions sur les 20 derniers tirages
    recency: np.ndarray         # somme pondérée exp(-λ·ancienneté)
    current_gap: np.ndarray     # retard actuel (nb de tirages)
    pair_counts: np.ndarray     # matrice symétrique des cooccurrences

    def norm(self, arr: np.ndarray) -> np.ndarray:
        m = arr.max()
        return arr / m if m > 0 else np.zeros_like(arr, dtype=float)


def build_inputs(
    seq: pd.DataFrame,
    number_min: int,
    number_max: int,
    recent_window: int = 20,
    lam: float = 0.05,
) -> StrategyInputs:
    size = number_max + 1
    counts_all = np.zeros(size)
    counts_recent = np.zeros(size)
    recency = np.zeros(size)
    last_pos = np.full(size, -1)
    pair_counts = np.zeros((size, size))

    numbers_col = list(seq["numbers"])
    n = len(numbers_col)
    for pos, numbers in enumerate(numbers_col):
        age = n - 1 - pos
        weight = float(np.exp(-lam * age))
        uniq = sorted(set(numbers))
        for num in uniq:
            counts_all[num] += 1
            recency[num] += weight
            last_pos[num] = pos
            if age < recent_window:
                counts_recent[num] += 1
        for a, b in combinations(uniq, 2):
            pair_counts[a, b] += 1
            pair_counts[b, a] += 1

    current_gap = np.where(last_pos >= 0, n - 1 - last_pos, n).astype(float)
    return StrategyInputs(
        number_min=number_min,
        number_max=number_max,
        n_draws=n,
        counts_all=counts_all,
        counts_recent=counts_recent,
        recency=recency,
        current_gap=current_gap,
        pair_counts=pair_counts,
    )
