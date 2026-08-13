"""Les stratégies interprétables — chacune produit des poids d'échantillonnage
et un profil de coefficients pour le moteur commun.

STRATEGY_RANDOM est la BASELINE OBLIGATOIRE : uniforme, score nul — toute
autre stratégie lui sera comparée par backtesting (PHASE 8).
"""

from __future__ import annotations

from collections.abc import Callable

import numpy as np

from app.generation.engine import DEFAULT_PROFILE, StrategySpec
from app.generation.features import StrategyInputs

Builder = Callable[[StrategyInputs, dict], StrategySpec]
REGISTRY: dict[str, Builder] = {}


def _register(code: str):
    def deco(fn: Builder) -> Builder:
        REGISTRY[code] = fn
        return fn

    return deco


def _profile(**overrides: float) -> dict:
    profile = {name: 0.0 for name in DEFAULT_PROFILE}
    profile.update(overrides)
    return profile


@_register("STRATEGY_RANDOM")
def random_strategy(inputs: StrategyInputs, _config: dict) -> StrategySpec:
    """Uniforme, sans scoring : la référence contre laquelle tout se mesure."""
    weights = np.zeros(inputs.number_max + 1)
    weights[inputs.number_min :] = 1.0
    return StrategySpec(code="STRATEGY_RANDOM", weights=weights, profile=_profile())


@_register("STRATEGY_FREQUENCY")
def frequency_strategy(inputs: StrategyInputs, _config: dict) -> StrategySpec:
    return StrategySpec(
        code="STRATEGY_FREQUENCY",
        weights=inputs.counts_all.copy(),
        profile=_profile(frequency=1.0, odd_even_balance=0.2, high_low_balance=0.2),
    )


@_register("STRATEGY_HOT_NUMBERS")
def hot_strategy(inputs: StrategyInputs, _config: dict) -> StrategySpec:
    return StrategySpec(
        code="STRATEGY_HOT_NUMBERS",
        weights=inputs.counts_recent.copy(),
        profile=_profile(recency=1.0, frequency=0.3),
    )


@_register("STRATEGY_COLD_NUMBERS")
def cold_strategy(inputs: StrategyInputs, _config: dict) -> StrategySpec:
    """Inverse des fréquences. Documentée comme NON prédictive (sophisme du
    joueur) — l'explication générée le rappelle systématiquement."""
    weights = np.zeros(inputs.number_max + 1)
    counts = inputs.counts_all[inputs.number_min :]
    weights[inputs.number_min :] = counts.max() - counts + 1
    return StrategySpec(
        code="STRATEGY_COLD_NUMBERS",
        weights=weights,
        profile=_profile(odd_even_balance=0.5, high_low_balance=0.5, dispersion=0.5),
    )


@_register("STRATEGY_RECENCY")
def recency_strategy(inputs: StrategyInputs, _config: dict) -> StrategySpec:
    return StrategySpec(
        code="STRATEGY_RECENCY",
        weights=inputs.recency.copy(),
        profile=_profile(recency=1.0, cooccurrence=0.3),
    )


@_register("STRATEGY_BALANCED")
def balanced_strategy(inputs: StrategyInputs, _config: dict) -> StrategySpec:
    """Uniforme mais sous contraintes de forme serrées (équilibres, somme
    dans la bande historique centrale, pas de suites)."""
    weights = np.zeros(inputs.number_max + 1)
    weights[inputs.number_min :] = 1.0
    total_mid = 5 * (inputs.number_min + inputs.number_max) / 2
    return StrategySpec(
        code="STRATEGY_BALANCED",
        weights=weights,
        profile=_profile(odd_even_balance=1.0, high_low_balance=1.0, dispersion=0.6),
        constraints={
            "sum_range": (total_mid - 75, total_mid + 75),
            "max_consecutive": 1,
            "odd_range": (2, 3),
            "high_range": (2, 3),
        },
    )


@_register("STRATEGY_COOCCURRENCE")
def cooccurrence_strategy(inputs: StrategyInputs, _config: dict) -> StrategySpec:
    weights = inputs.pair_counts.sum(axis=1)
    return StrategySpec(
        code="STRATEGY_COOCCURRENCE",
        weights=weights,
        profile=_profile(cooccurrence=1.0, frequency=0.3),
    )


@_register("STRATEGY_STATISTICAL")
def statistical_strategy(inputs: StrategyInputs, _config: dict) -> StrategySpec:
    """Composite fréquence + récence + retard normalisés."""
    weights = (
        0.5 * inputs.norm(inputs.counts_all)
        + 0.3 * inputs.norm(inputs.recency)
        + 0.2 * inputs.norm(inputs.current_gap)
    )
    return StrategySpec(
        code="STRATEGY_STATISTICAL",
        weights=weights,
        profile=dict(DEFAULT_PROFILE),
    )


def build_spec(code: str, inputs: StrategyInputs, config: dict | None = None) -> StrategySpec:
    if code not in REGISTRY:
        raise KeyError(f"Stratégie inconnue ou non implémentée : {code}")
    return REGISTRY[code](inputs, config or {})
