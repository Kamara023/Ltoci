"""Tests du moteur de génération de candidates — synthétique, sans DB."""

from datetime import date

import numpy as np
import pandas as pd
import pytest

from app.analyst.templates import FORBIDDEN, build_explanation, make_rng
from app.generation.engine import generate, jaccard, score_combination
from app.generation.features import build_inputs
from app.generation.strategies import REGISTRY, build_spec


def make_seq(rows: list[list[int]]) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "draw_date": [date(2026, 1, i + 1) for i in range(len(rows))],
            "type_code": ["a"] * len(rows),
            "numbers": rows,
        }
    )


SEQ = make_seq(
    [
        [1, 2, 3, 4, 5],
        [1, 10, 20, 30, 40],
        [2, 10, 50, 60, 70],
        [1, 2, 80, 81, 90],
        [5, 15, 25, 35, 45],
        [1, 10, 33, 47, 88],
        [7, 21, 33, 49, 63],
        [2, 10, 44, 55, 66],
    ]
)
INPUTS = build_inputs(SEQ, 1, 90)


def test_features_calculees_a_la_main():
    assert INPUTS.n_draws == 8
    assert INPUTS.counts_all[1] == 4  # tirages 1, 2, 4, 6
    assert INPUTS.counts_all[10] == 4
    assert INPUTS.counts_all[7] == 1
    assert INPUTS.current_gap[1] == 2  # dernière apparition au tirage 6 (index 5)
    assert INPUTS.current_gap[13] == 8  # jamais vu = taille de l'historique
    assert INPUTS.pair_counts[1, 2] == 2  # tirages 1 et 4
    assert INPUTS.pair_counts[1, 10] == 2


def test_toutes_les_strategies_generent_des_candidates_valides():
    for code in REGISTRY:
        spec = build_spec(code, INPUTS)
        rng = make_rng(code, "cutoff-test")
        candidates = generate(spec, INPUTS, rng, pool_size=800, top_n=10)
        assert candidates, code
        seen = set()
        for cand in candidates:
            nums = tuple(cand.numbers)
            assert nums not in seen, f"{code}: doublon"
            seen.add(nums)
            assert list(nums) == sorted(nums), f"{code}: non trié"
            assert len(set(nums)) == 5
            assert all(1 <= n <= 90 for n in nums)
            assert "components" in cand.breakdown and "total" in cand.breakdown


def test_reproductibilite_meme_cutoff():
    spec = build_spec("STRATEGY_STATISTICAL", INPUTS)
    a = generate(spec, INPUTS, make_rng("STRATEGY_STATISTICAL", "cutoff-x"), pool_size=500)
    b = generate(spec, INPUTS, make_rng("STRATEGY_STATISTICAL", "cutoff-x"), pool_size=500)
    assert [c.numbers for c in a] == [c.numbers for c in b]
    # Cutoff différent (nouvelles données) => candidates différentes
    c = generate(spec, INPUTS, make_rng("STRATEGY_STATISTICAL", "cutoff-y"), pool_size=500)
    assert [x.numbers for x in a] != [x.numbers for x in c]


def test_contraintes_balanced_respectees():
    spec = build_spec("STRATEGY_BALANCED", INPUTS)
    candidates = generate(spec, INPUTS, make_rng("STRATEGY_BALANCED", "z"), pool_size=2000)
    lo, hi = spec.constraints["sum_range"]
    for cand in candidates:
        total = sum(cand.numbers)
        assert lo <= total <= hi
        consecutive = sum(
            1 for a, b in zip(cand.numbers, cand.numbers[1:], strict=False) if b - a == 1
        )
        assert consecutive <= 1
        odd = sum(1 for x in cand.numbers if x % 2)
        assert 2 <= odd <= 3


def test_diversite_jaccard():
    spec = build_spec("STRATEGY_FREQUENCY", INPUTS)
    candidates = generate(spec, INPUTS, make_rng("STRATEGY_FREQUENCY", "z"), pool_size=2000)
    for i in range(len(candidates)):
        for j in range(i + 1, len(candidates)):
            assert jaccard(tuple(candidates[i].numbers), tuple(candidates[j].numbers)) < 0.6


def test_scoring_coherent_avec_le_profil():
    """Une combinaison de numéros très fréquents doit surclasser une combinaison
    de numéros jamais vus sous le profil 'frequency'."""
    profile = {"frequency": 1.0, "recency": 0, "cooccurrence": 0,
               "odd_even_balance": 0, "high_low_balance": 0, "dispersion": 0}
    frequent = (1, 2, 5, 10, 33)   # numéros récurrents de SEQ
    unseen = (11, 13, 17, 19, 23)  # jamais tirés
    score_hi, bd_hi = score_combination(frequent, INPUTS, profile)
    score_lo, bd_lo = score_combination(unseen, INPUTS, profile)
    assert score_hi > score_lo
    assert bd_lo["components"]["frequency"] == 0.0


def test_penalite_consecutifs():
    profile = {"frequency": 0, "recency": 0, "cooccurrence": 0,
               "odd_even_balance": 0, "high_low_balance": 0, "dispersion": 0}
    _, breakdown = score_combination((10, 11, 12, 13, 50), INPUTS, profile)
    assert "consecutifs" in breakdown["penalties"]
    _, clean = score_combination((10, 20, 30, 40, 50), INPUTS, profile)
    assert clean["penalties"] == {}


def test_random_approximativement_uniforme():
    spec = build_spec("STRATEGY_RANDOM", INPUTS)
    rng = make_rng("STRATEGY_RANDOM", "uniformite")
    counts = np.zeros(91)
    pool = generate(spec, INPUTS, rng, pool_size=3000, top_n=3000, jaccard_max=1.01)
    for cand in pool:
        for n in cand.numbers:
            counts[n] += 1
    # Chaque numéro doit apparaître : pas de biais grossier (test large).
    assert (counts[1:] > 0).all()
    assert counts[1:].max() / counts[1:].mean() < 2.0


def test_explications_conformes_et_sans_interdits():
    for code in REGISTRY:
        spec = build_spec(code, INPUTS)
        candidates = generate(spec, INPUTS, make_rng(code, "expl"), pool_size=300, top_n=3)
        for cand in candidates:
            text = build_explanation(code, cand.numbers, cand.breakdown, INPUTS)
            lowered = text.lower()
            for forbidden in FORBIDDEN:
                assert forbidden not in lowered, f"{code}: interdit « {forbidden} »"
            assert "indépendant" in lowered  # phrase de limite toujours présente
            assert str(sum(cand.numbers)) in text  # faits chiffrés réels


def test_cold_contient_avertissement_sophisme():
    spec = build_spec("STRATEGY_COLD_NUMBERS", INPUTS)
    cand = generate(spec, INPUTS, make_rng("STRATEGY_COLD_NUMBERS", "x"), pool_size=200, top_n=1)[0]
    text = build_explanation("STRATEGY_COLD_NUMBERS", cand.numbers, cand.breakdown, INPUTS)
    assert "sophisme du joueur" in text


def test_strategie_inconnue():
    with pytest.raises(KeyError):
        build_spec("STRATEGY_INCONNUE", INPUTS)
