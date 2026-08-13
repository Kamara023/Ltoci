"""Features INCRÉMENTALES pour le walk-forward.

Même contrat que StrategyInputs (les stratégies de app/generation/strategies.py
fonctionnent telles quelles) mais mise à jour en O(1) par tirage — condition
de faisabilité du backtest sur ~15 000 pas.

CORRECTION PROUVÉE PAR TEST : après k updates, l'état est identique (à la
tolérance flottante près) à build_inputs(seq[:k]) — cf. tests/test_backtesting.
"""

from __future__ import annotations

from collections import deque
from itertools import combinations

import numpy as np

from app.generation.features import StrategyInputs


class IncrementalInputs(StrategyInputs):
    def __init__(
        self,
        number_min: int,
        number_max: int,
        recent_window: int = 20,
        lam: float = 0.05,
    ):
        size = number_max + 1
        super().__init__(
            number_min=number_min,
            number_max=number_max,
            n_draws=0,
            counts_all=np.zeros(size),
            counts_recent=np.zeros(size),
            recency=np.zeros(size),
            current_gap=np.zeros(size),
            pair_counts=np.zeros((size, size)),
        )
        self._recent = deque()
        self._recent_window = recent_window
        self._decay = float(np.exp(-lam))

    def update(self, numbers: list[int]) -> None:
        """Intègre un tirage : appelé APRÈS avoir évalué le pas courant."""
        uniq = sorted(set(numbers))
        # Récence : décroissance globale puis +1 pour les numéros tirés
        # (équivaut à pondérer chaque tirage par exp(-λ·ancienneté)).
        self.recency *= self._decay
        # Retards : +1 pour tous, remis à 0 pour les tirés.
        self.current_gap += 1
        for n in uniq:
            self.counts_all[n] += 1
            self.recency[n] += 1.0
            self.current_gap[n] = 0
        for a, b in combinations(uniq, 2):
            self.pair_counts[a, b] += 1
            self.pair_counts[b, a] += 1
        # Fenêtre glissante des 20 derniers tirages.
        self._recent.append(uniq)
        for n in uniq:
            self.counts_recent[n] += 1
        if len(self._recent) > self._recent_window:
            oldest = self._recent.popleft()
            for n in oldest:
                self.counts_recent[n] -= 1
        self.n_draws += 1
