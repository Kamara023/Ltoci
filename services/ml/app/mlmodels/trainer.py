"""Entraînement walk-forward des modèles expérimentaux.

Jeu d'entraînement construit par REJEU INCRÉMENTAL du préfixe d'historique :
pour chaque pas t de la fenêtre, features(état ≤ t−1) → label (n ∈ tirage t).
Aucune donnée future ne peut fuiter : l'état incrémental ne connaît que le
passé au moment où les features sont extraites (même mécanique que le
backtesting, testée pour équivalence au recalcul complet).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from app.backtesting.incremental import IncrementalInputs
from app.mlmodels.features import FEATURE_NAMES, number_feature_matrix

ML_ALGOS = {
    "STRATEGY_ML_RF": "random_forest",
    "STRATEGY_ML_GB": "hist_gradient_boosting",
}
BASE_RATE = 5 / 90  # probabilité de base d'un numéro sur un tirage équitable


@dataclass
class TrainedModel:
    algo: str
    model: object
    n_samples: int
    train_window: int
    metrics: dict


def _make_estimator(algo: str, seed: int):
    if algo == "random_forest":
        from sklearn.ensemble import RandomForestClassifier

        return RandomForestClassifier(
            n_estimators=60, max_depth=8, min_samples_leaf=50,
            n_jobs=-1, random_state=seed,
        )
    if algo == "hist_gradient_boosting":
        from sklearn.ensemble import HistGradientBoostingClassifier

        return HistGradientBoostingClassifier(
            max_iter=120, max_depth=6, learning_rate=0.08, random_state=seed,
        )
    raise ValueError(f"Algo inconnu : {algo}")


def build_training_set(
    history: list[list[int]],
    number_min: int,
    number_max: int,
    train_window: int,
    warmup: int = 100,
) -> tuple[np.ndarray, np.ndarray]:
    """Rejeu incrémental : X = features à t−1, y = présence au tirage t."""
    total = len(history)
    start = max(warmup, total - train_window)
    inc = IncrementalInputs(number_min, number_max)
    for i in range(start):
        inc.update(history[i])

    X_parts: list[np.ndarray] = []
    y_parts: list[np.ndarray] = []
    numbers = np.arange(number_min, number_max + 1)
    for t in range(start, total):
        X_parts.append(number_feature_matrix(inc))
        drawn = set(history[t])
        y_parts.append(np.isin(numbers, list(drawn)).astype(int))
        inc.update(history[t])
    return np.vstack(X_parts), np.concatenate(y_parts)


def train_model(
    strategy_code: str,
    history: list[list[int]],
    number_min: int,
    number_max: int,
    train_window: int = 3000,
    seed: int = 42,
) -> TrainedModel:
    algo = ML_ALGOS[strategy_code]
    X, y = build_training_set(history, number_min, number_max, train_window)
    estimator = _make_estimator(algo, seed)
    estimator.fit(X, y)
    proba = estimator.predict_proba(X)[:, 1]
    metrics = {
        "n_samples": int(len(y)),
        "positive_rate": round(float(y.mean()), 4),
        "base_rate": round(BASE_RATE, 4),
        "train_proba_mean": round(float(proba.mean()), 4),
        "train_proba_std": round(float(proba.std()), 4),
        "features": FEATURE_NAMES,
    }
    return TrainedModel(
        algo=algo,
        model=estimator,
        n_samples=len(y),
        train_window=train_window,
        metrics=metrics,
    )


def predict_weights(trained: TrainedModel, inputs) -> np.ndarray:
    """Probabilités prédites par numéro → poids d'échantillonnage/top-5."""
    X = number_feature_matrix(inputs)
    proba = trained.model.predict_proba(X)[:, 1]
    weights = np.zeros(inputs.number_max + 1)
    weights[inputs.number_min : inputs.number_max + 1] = proba
    return weights
