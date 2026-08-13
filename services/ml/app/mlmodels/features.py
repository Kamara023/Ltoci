"""Features par numéro pour les modèles ML — matrice (90, F) construite
depuis un état StrategyInputs (donc uniquement depuis le PASSÉ du pas courant).

Tâche modélisée : classification binaire « le numéro n sort au prochain
tirage ». Sur un tirage équitable, la meilleure prédiction possible est la
constante 5/90 — les modèles sont EXPÉRIMENTAUX et pédagogiques, comparés
à la baseline aléatoire par backtesting (invariant produit).
"""

from __future__ import annotations

import numpy as np

from app.generation.features import StrategyInputs

FEATURE_NAMES = [
    "freq_all",       # fréquence relative sur tout l'historique connu
    "freq_recent",    # fréquence relative sur les 20 derniers tirages
    "recency",        # poids de récence normalisé
    "gap_norm",       # retard actuel / historique connu
    "gap_ratio",      # retard actuel / retard moyen attendu (90/5 tirages)
    "cooc_strength",  # force de cooccurrence normalisée
    "parity",         # numéro pair (0/1)
    "position",       # position relative dans la plage 1..90
]


def number_feature_matrix(inputs: StrategyInputs) -> np.ndarray:
    """Retourne la matrice (nb_numeros, F) alignée sur number_min..number_max."""
    lo, hi = inputs.number_min, inputs.number_max
    numbers = np.arange(lo, hi + 1)
    n = max(inputs.n_draws, 1)

    freq_all = inputs.counts_all[lo : hi + 1] / n
    freq_recent = inputs.counts_recent[lo : hi + 1] / min(n, 20)
    recency = inputs.norm(inputs.recency)[lo : hi + 1]
    gap_norm = inputs.current_gap[lo : hi + 1] / n
    expected_gap = (hi - lo + 1) / 5  # retard moyen attendu ≈ 18 tirages
    gap_ratio = inputs.current_gap[lo : hi + 1] / expected_gap
    cooc = inputs.norm(inputs.pair_counts.sum(axis=1))[lo : hi + 1]
    parity = (numbers % 2 == 0).astype(float)
    position = (numbers - lo) / (hi - lo)

    return np.column_stack(
        [freq_all, freq_recent, recency, gap_norm, gap_ratio, cooc, parity, position]
    )
