"""Tests des stratégies ML expérimentales (RF / Gradient Boosting)."""

from datetime import date, timedelta

import numpy as np
import pandas as pd
import pytest

from app.analyst.templates import make_rng
from app.generation.engine import generate
from app.generation.features import build_inputs
from app.generation.strategies import build_spec
from app.mlmodels.features import FEATURE_NAMES, number_feature_matrix
from app.mlmodels.trainer import build_training_set, train_model

# Historique synthétique déterministe de 400 tirages (générateur seedé —
# aucun signal réel à apprendre : les modèles doivent juste FONCTIONNER).
_rng = np.random.default_rng(7)
HISTORY = [
    sorted(_rng.choice(np.arange(1, 91), size=5, replace=False).tolist()) for _ in range(400)
]


def make_inputs():
    seq = pd.DataFrame(
        {
            "draw_date": [date(2024, 1, 1) + timedelta(days=i) for i in range(len(HISTORY))],
            "type_code": ["a"] * len(HISTORY),
            "numbers": HISTORY,
        }
    )
    return build_inputs(seq, 1, 90)


INPUTS = make_inputs()


def test_matrice_de_features_alignee():
    X = number_feature_matrix(INPUTS)
    assert X.shape == (90, len(FEATURE_NAMES))
    assert np.isfinite(X).all()
    # freq_all du numéro n = counts_all[n]/n_draws (alignement index -> numéro)
    n7 = INPUTS.counts_all[7] / INPUTS.n_draws
    assert X[6, 0] == pytest.approx(n7)


def test_training_set_labels_correspondent_au_tirage_suivant():
    """Anti-fuite : X au pas t est construit AVANT d'intégrer le tirage t,
    et y encode exactement la présence au tirage t."""
    X, y = build_training_set(HISTORY, 1, 90, train_window=50, warmup=100)
    n_steps = len(HISTORY) - max(100, len(HISTORY) - 50)
    assert X.shape == (n_steps * 90, len(FEATURE_NAMES))
    assert y.shape == (n_steps * 90,)
    # Vérification du DERNIER pas : labels = présence dans le dernier tirage.
    last_labels = y[-90:]
    drawn = set(HISTORY[-1])
    expected = np.array([1 if n in drawn else 0 for n in range(1, 91)])
    np.testing.assert_array_equal(last_labels, expected)
    assert last_labels.sum() == 5


def test_entrainement_et_poids_valides():
    trained = train_model("STRATEGY_ML_GB", HISTORY, 1, 90, train_window=200)
    assert trained.metrics["positive_rate"] == pytest.approx(5 / 90, abs=0.01)
    from app.mlmodels.trainer import predict_weights

    w = predict_weights(trained, INPUTS)
    assert w.shape == (91,)
    assert (w[1:] >= 0).all() and (w[1:] <= 1).all()
    assert w[1:].std() >= 0  # des probabilités, potentiellement quasi plates


def test_strategies_ml_generent_des_candidates_et_model_info():
    for code in ("STRATEGY_ML_RF", "STRATEGY_ML_GB"):
        spec = build_spec(code, INPUTS, {"train_window": 200})
        assert spec.model_info is not None
        assert spec.model_info["trained_on_draws"] > 0
        assert "model" in spec.model_info
        candidates = generate(spec, INPUTS, make_rng(code, "test"), pool_size=300, top_n=5)
        assert len(candidates) == 5
        for cand in candidates:
            assert len(set(cand.numbers)) == 5
            assert all(1 <= n <= 90 for n in cand.numbers)


def test_ml_reproductible_a_donnees_identiques():
    a = train_model("STRATEGY_ML_RF", HISTORY, 1, 90, train_window=150)
    b = train_model("STRATEGY_ML_RF", HISTORY, 1, 90, train_window=150)
    from app.mlmodels.trainer import predict_weights

    np.testing.assert_allclose(predict_weights(a, INPUTS), predict_weights(b, INPUTS))


def test_historique_insuffisant_refuse():
    short = make_inputs()
    short.history = HISTORY[:50]
    with pytest.raises(ValueError):
        build_spec("STRATEGY_ML_GB", short)
