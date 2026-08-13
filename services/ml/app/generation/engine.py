"""Moteur commun de génération de combinaisons candidates — PUR et testable.

Pipeline : échantillonnage pondéré d'un pool → score composite DÉCOMPOSÉ →
contraintes statistiques optionnelles → diversité (Jaccard) → top N.

Le score est un indicateur RELATIF au pool de candidates — jamais une
probabilité de gain (invariant produit, vocabulaire contraint par l'Analyst).
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from app.generation.features import StrategyInputs

DEFAULT_PROFILE = {
    "frequency": 1.0,
    "recency": 1.0,
    "cooccurrence": 0.5,
    "odd_even_balance": 0.5,
    "high_low_balance": 0.5,
    "dispersion": 0.5,
}


@dataclass
class StrategySpec:
    code: str
    weights: np.ndarray                      # poids d'échantillonnage par numéro
    profile: dict = field(default_factory=lambda: dict(DEFAULT_PROFILE))
    constraints: dict = field(default_factory=dict)
    # {'sum_range': (lo, hi), 'max_consecutive': n, 'odd_range': (lo, hi),
    #  'high_range': (lo, hi)}


@dataclass
class Candidate:
    numbers: list[int]
    score: float
    breakdown: dict


def sample_pool(
    spec: StrategySpec,
    inputs: StrategyInputs,
    rng: np.random.Generator,
    pool_size: int,
    k: int = 5,
) -> list[tuple[int, ...]]:
    """Échantillonne des combinaisons distinctes, pondérées par les poids."""
    lo, hi = inputs.number_min, inputs.number_max
    numbers = np.arange(lo, hi + 1)
    w = spec.weights[lo : hi + 1].astype(float)
    w = np.clip(w, 0, None)
    if w.sum() <= 0:
        w = np.ones_like(w)
    p = w / w.sum()

    seen: set[tuple[int, ...]] = set()
    for _ in range(pool_size * 2):  # marge pour les doublons
        combo = tuple(sorted(rng.choice(numbers, size=k, replace=False, p=p).tolist()))
        seen.add(combo)
        if len(seen) >= pool_size:
            break
    return list(seen)


def score_combination(
    combo: tuple[int, ...], inputs: StrategyInputs, profile: dict
) -> tuple[float, dict]:
    arr = np.array(combo)
    freq_n = inputs.norm(inputs.counts_all)
    rec_n = inputs.norm(inputs.recency)
    pair_n = inputs.norm(inputs.pair_counts)

    k = len(combo)
    half = k / 2  # équilibre idéal ~2,5 pour 5 numéros
    mid = (inputs.number_min + inputs.number_max) / 2

    pairs = [(combo[i], combo[j]) for i in range(k) for j in range(i + 1, k)]
    components = {
        "frequency": float(freq_n[arr].mean()),
        "recency": float(rec_n[arr].mean()),
        "cooccurrence": float(np.mean([pair_n[a, b] for a, b in pairs])) if pairs else 0.0,
        "odd_even_balance": 1.0 - abs(sum(1 for x in combo if x % 2) - half) / half,
        "high_low_balance": 1.0 - abs(sum(1 for x in combo if x > mid) - half) / half,
        "dispersion": (combo[-1] - combo[0]) / (inputs.number_max - inputs.number_min),
    }

    # Pénalités : formes historiquement rarissimes.
    consecutive = sum(1 for a, b in zip(combo, combo[1:], strict=False) if b - a == 1)
    total = sum(combo)
    mu = k * (inputs.number_min + inputs.number_max) / 2
    sigma = 52.0  # écart-type de la somme pour 5 parmi 1..90
    penalties = {}
    if consecutive >= 3:
        penalties["consecutifs"] = round(0.15 * (consecutive - 2), 4)
    if abs(total - mu) > 2 * sigma:
        penalties["somme_extreme"] = 0.2

    weighted = {
        name: round(profile.get(name, 0.0) * value, 4) for name, value in components.items()
    }
    score = sum(weighted.values()) - sum(penalties.values())
    breakdown = {
        "components": {name: round(v, 4) for name, v in components.items()},
        "weighted": weighted,
        "penalties": penalties,
        "profile": profile,
        "total": round(score, 4),
    }
    return round(score, 4), breakdown


def passes_constraints(combo: tuple[int, ...], inputs: StrategyInputs, constraints: dict) -> bool:
    if not constraints:
        return True
    total = sum(combo)
    if "sum_range" in constraints:
        lo, hi = constraints["sum_range"]
        if not lo <= total <= hi:
            return False
    if "max_consecutive" in constraints:
        consecutive = sum(1 for a, b in zip(combo, combo[1:], strict=False) if b - a == 1)
        if consecutive > constraints["max_consecutive"]:
            return False
    if "odd_range" in constraints:
        lo, hi = constraints["odd_range"]
        if not lo <= sum(1 for x in combo if x % 2) <= hi:
            return False
    if "high_range" in constraints:
        lo, hi = constraints["high_range"]
        mid = (inputs.number_min + inputs.number_max) / 2
        if not lo <= sum(1 for x in combo if x > mid) <= hi:
            return False
    return True


def jaccard(a: tuple[int, ...], b: tuple[int, ...]) -> float:
    sa, sb = set(a), set(b)
    return len(sa & sb) / len(sa | sb)


def generate(
    spec: StrategySpec,
    inputs: StrategyInputs,
    rng: np.random.Generator,
    pool_size: int = 5000,
    top_n: int = 10,
    jaccard_max: float = 0.6,
) -> list[Candidate]:
    pool = sample_pool(spec, inputs, rng, pool_size)
    scored: list[tuple[float, tuple[int, ...], dict]] = []
    for combo in pool:
        if not passes_constraints(combo, inputs, spec.constraints):
            continue
        score, breakdown = score_combination(combo, inputs, spec.profile)
        scored.append((score, combo, breakdown))
    scored.sort(key=lambda t: (-t[0], t[1]))

    kept: list[Candidate] = []
    for score, combo, breakdown in scored:
        if any(jaccard(combo, tuple(c.numbers)) >= jaccard_max for c in kept):
            continue
        kept.append(Candidate(numbers=list(combo), score=score, breakdown=breakdown))
        if len(kept) >= top_n:
            break
    return kept
