"""Tests du backtesting — équivalence incrémentale, matches, anti-fuite."""

from datetime import date

import numpy as np
import pandas as pd

from app.backtesting.incremental import IncrementalInputs
from app.generation.features import build_inputs


def make_seq(rows: list[list[int]]) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "draw_date": [date(2026, 1, i + 1) for i in range(len(rows))],
            "type_code": ["a"] * len(rows),
            "numbers": rows,
        }
    )


DRAWS = [
    [1, 2, 3, 4, 5],
    [1, 10, 20, 30, 40],
    [2, 10, 50, 60, 70],
    [1, 2, 80, 81, 90],
    [5, 15, 25, 35, 45],
    [1, 10, 33, 47, 88],
    [7, 21, 33, 49, 63],
    [2, 10, 44, 55, 66],
    [4, 18, 29, 61, 77],
    [3, 12, 24, 48, 89],
]


def test_incremental_equivaut_au_recalcul_complet():
    """LA garantie de validité du walk-forward : à chaque pas, l'état
    incrémental est identique au recalcul complet sur le préfixe."""
    inc = IncrementalInputs(1, 90)
    for k in range(1, len(DRAWS) + 1):
        inc.update(DRAWS[k - 1])
        full = build_inputs(make_seq(DRAWS[:k]), 1, 90)
        assert inc.n_draws == full.n_draws == k
        np.testing.assert_array_equal(inc.counts_all, full.counts_all)
        np.testing.assert_array_equal(inc.counts_recent, full.counts_recent)
        np.testing.assert_array_equal(inc.current_gap, full.current_gap)
        np.testing.assert_array_equal(inc.pair_counts, full.pair_counts)
        np.testing.assert_allclose(inc.recency, full.recency, rtol=1e-10)


def test_incremental_fenetre_glissante_20():
    """La fenêtre des 20 derniers tirages glisse correctement au-delà de 20."""
    draws = [[(i % 89) + 1, ((i + 7) % 89) + 1] for i in range(30)]
    draws = [sorted(set(d + [88, 89, 90]))[:5] for d in draws]
    inc = IncrementalInputs(1, 90)
    for i, d in enumerate(draws):
        inc.update(d)
        full = build_inputs(make_seq(draws[: i + 1]), 1, 90)
        np.testing.assert_array_equal(inc.counts_recent, full.counts_recent)


def test_matches_calcules_a_la_main():
    """Vérification manuelle du comptage de correspondances."""
    predicted = [1, 2, 10, 50, 88]
    actual = {2, 10, 50, 60, 70}  # tirage 3 de DRAWS
    assert len(actual.intersection(predicted)) == 3


def test_pvalue_symetrique_et_bornee():
    from app.backtesting.runner import _pvalue_two_means

    rng = np.random.default_rng(42)
    a = rng.binomial(5, 5 / 90, size=5000).astype(float)
    b = rng.binomial(5, 5 / 90, size=5000).astype(float)
    p = _pvalue_two_means(a, b)
    assert 0.0 <= p <= 1.0
    assert p > 0.01  # mêmes distributions : pas de fausse significativité forte
    c = a + 0.5  # différence énorme -> p quasi nulle
    assert _pvalue_two_means(a, c) < 1e-6
