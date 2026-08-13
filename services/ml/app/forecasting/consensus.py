"""Consensus TOP 5/TOP 10 par NUMÉRO — cœur de l'outil de recherche (PHASE 11).

Réduction intelligente de l'espace : 90 numéros → poids par stratégie →
moyenne pondérée normalisée → ranking → TOP 10 → TOP 5. Par numéro :
score, rang, confiance (accord inter-modèles + marge), facteurs dominants,
consensus_count. PUR : aucun accès DB — entièrement testable.

Le score n'est JAMAIS une probabilité de gain (invariant produit) ; la
méthode est validée par backtesting (stratégie virtuelle FORECAST_CONSENSUS).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from app.generation.features import StrategyInputs
from app.generation.strategies import REGISTRY, build_spec

# Pondération par stratégie — informée par le backtest (FREQUENCY et
# COOCCURRENCE portent le seul signal mesuré ; COLD/BALANCED sous le hasard ;
# RANDOM exclue). Configurable sans déploiement via strategies.default_config
# de FORECAST_CONSENSUS.
DEFAULT_MODEL_WEIGHTS: dict[str, float] = {
    "STRATEGY_FREQUENCY": 1.5,
    "STRATEGY_COOCCURRENCE": 1.5,
    "STRATEGY_ML_GB": 1.0,
    "STRATEGY_ML_RF": 1.0,
    "STRATEGY_STATISTICAL": 1.0,
    "STRATEGY_HOT_NUMBERS": 0.7,
    "STRATEGY_RECENCY": 0.7,
    "STRATEGY_BALANCED": 0.0,
    "STRATEGY_COLD_NUMBERS": 0.0,
    "STRATEGY_RANDOM": 0.0,
}
FACTOR_LABELS = {
    "frequency": "fréquence historique",
    "recency": "récence",
    "gap": "retard",
    "cooccurrence": "cooccurrences",
    "ml": "modèles ML",
}


@dataclass
class ConsensusEntry:
    rank: int
    number: int
    score: float
    confidence: str  # 'faible' | 'moyenne' | 'forte'
    factors: dict
    consensus_count: int


@dataclass
class ConsensusResult:
    entries: list[ConsensusEntry]  # TOP 10 (les 5 premiers = TOP 5)
    model_versions: dict  # {code: {weight, note?}}
    models_used: int


def _normalized_weights(spec_weights: np.ndarray, lo: int, hi: int) -> np.ndarray:
    w = np.clip(spec_weights[lo : hi + 1].astype(float), 0, None)
    m = w.max()
    return w / m if m > 0 else np.zeros_like(w)


def build_consensus(
    inputs: StrategyInputs,
    model_weights: dict[str, float] | None = None,
    top_n: int = 10,
    precomputed: dict[str, np.ndarray] | None = None,
) -> ConsensusResult:
    """`precomputed` : vecteurs de poids (taille number_max+1) déjà calculés
    pour certains codes — évite de ré-entraîner les modèles ML par cible
    (le service les entraîne UNE fois sur l'historique global) et permet au
    backtest de réutiliser les poids du pas courant."""
    weights_cfg = {**DEFAULT_MODEL_WEIGHTS, **(model_weights or {})}
    lo, hi = inputs.number_min, inputs.number_max
    numbers = np.arange(lo, hi + 1)

    per_model: dict[str, np.ndarray] = {}
    versions: dict[str, dict] = {}
    for code, weight in weights_cfg.items():
        if weight <= 0:
            continue
        if precomputed and code in precomputed:
            per_model[code] = _normalized_weights(precomputed[code], lo, hi)
            versions[code] = {"weight": weight, "precomputed": True}
            continue
        if code not in REGISTRY:
            continue
        try:
            spec = build_spec(code, inputs)
        except Exception as exc:  # ML sans historique suffisant, etc.
            versions[code] = {"weight": weight, "skipped": str(exc)[:120]}
            continue
        per_model[code] = _normalized_weights(spec.weights, lo, hi)
        versions[code] = {"weight": weight}
    if not per_model:
        raise ValueError("Aucune stratégie utilisable pour le consensus")

    total_weight = sum(weights_cfg[c] for c in per_model)
    combined = np.zeros(hi - lo + 1)
    for code, vec in per_model.items():
        combined += weights_cfg[code] * vec
    combined /= total_weight

    # Ranking déterministe (égalités départagées par numéro croissant).
    order = np.argsort(-combined, kind="stable")
    top_idx = order[:top_n]
    margin_ref = combined[order[top_n]] if len(order) > top_n else 0.0

    # Top 10 individuel de chaque modèle (pour le consensus_count).
    model_tops: dict[str, set[int]] = {
        code: {int(numbers[i]) for i in np.argsort(-vec, kind="stable")[:top_n]}
        for code, vec in per_model.items()
    }

    entries: list[ConsensusEntry] = []
    n_models = len(per_model)
    for rank, idx in enumerate(top_idx, start=1):
        number = int(numbers[idx])
        agreement = sum(1 for tops in model_tops.values() if number in tops)
        margin = float(combined[idx] - margin_ref)
        ratio = agreement / n_models
        if ratio >= 0.6 and margin > 0.03:
            confidence = "forte"
        elif ratio >= 0.4:
            confidence = "moyenne"
        else:
            confidence = "faible"

        raw_factors = {
            "frequency": float(inputs.norm(inputs.counts_all)[number]),
            "recency": float(inputs.norm(inputs.recency)[number]),
            "gap": float(inputs.norm(inputs.current_gap)[number]),
            "cooccurrence": float(inputs.norm(inputs.pair_counts.sum(axis=1))[number]),
        }
        ml_vals = [per_model[c][idx] for c in per_model if c.startswith("STRATEGY_ML")]
        if ml_vals:
            raw_factors["ml"] = float(np.mean(ml_vals))
        dominant = sorted(raw_factors.items(), key=lambda kv: -kv[1])[:3]
        factors = {
            "dominants": [
                {"facteur": FACTOR_LABELS[k], "valeur": round(v, 4)} for k, v in dominant
            ],
            "détail": {k: round(v, 4) for k, v in raw_factors.items()},
        }
        entries.append(
            ConsensusEntry(
                rank=rank,
                number=number,
                score=round(float(combined[idx]), 6),
                confidence=confidence,
                factors=factors,
                consensus_count=agreement,
            )
        )
    return ConsensusResult(entries=entries, model_versions=versions, models_used=n_models)


def consensus_top5_numbers(
    inputs: StrategyInputs, model_weights: dict[str, float] | None = None
) -> list[int]:
    """Raccourci pour le backtesting : les 5 numéros du consensus, triés."""
    result = build_consensus(inputs, model_weights, top_n=5)
    return sorted(e.number for e in result.entries)
