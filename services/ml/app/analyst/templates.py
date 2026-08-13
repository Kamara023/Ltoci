"""AI Analyst v1 — explications par GABARITS DÉTERMINISTES.

Zéro LLM, zéro hallucination : chaque phrase est construite depuis les
chiffres réellement calculés (breakdown + entrées de stratégie).
Structure : faits observés → lecture du score → limite.

Les FORMULATIONS INTERDITES (prédiction, garantie, probabilité de gain)
sont listées ici et vérifiées par les tests sur toute sortie générée.
"""

from __future__ import annotations

import numpy as np

from app.generation.features import StrategyInputs

# Interdits absolus — testés par regex sur chaque explication générée.
FORBIDDEN = [
    "va sortir",
    "vont sortir",
    "garantit",
    "garanti",
    "probabilité de gagner",
    "chances de gagner",
    "augmente vos chances",
    "assuré de",
    "certain de sortir",
]

LIMIT_SENTENCE = (
    "Rappel : chaque tirage est indépendant — ce score est un indicateur "
    "statistique relatif aux autres candidates, pas une probabilité de gain."
)


def _facts(numbers: list[int], inputs: StrategyInputs) -> str:
    freqs = [int(inputs.counts_all[n]) for n in numbers]
    top = max(range(len(numbers)), key=lambda i: freqs[i])
    odd = sum(1 for x in numbers if x % 2)
    high = sum(1 for x in numbers if x > (inputs.number_min + inputs.number_max) / 2)
    return (
        f"Sur les {inputs.n_draws} tirages analysés, le numéro {numbers[top]} est apparu "
        f"{freqs[top]} fois (le plus observé de cette combinaison). "
        f"Équilibre : {odd} impair{'s' if odd > 1 else ''}/{5 - odd} pairs, "
        f"{high} numéro{'s' if high > 1 else ''} au-dessus de 45, somme {sum(numbers)}."
    )


def _score_reading(code: str, breakdown: dict) -> str:
    weighted = breakdown.get("weighted", {})
    labels = {
        "frequency": "la fréquence historique",
        "recency": "la récence des apparitions",
        "cooccurrence": "les cooccurrences de paires",
        "odd_even_balance": "l'équilibre pair/impair",
        "high_low_balance": "l'équilibre haut/bas",
        "dispersion": "la dispersion",
    }
    tops = sorted(
        ((v, labels[k]) for k, v in weighted.items() if k in labels and v > 0),
        reverse=True,
    )[:2]
    if not tops:
        return "Cette combinaison n'est pas scorée : elle sert de point de comparaison."
    drivers = " et ".join(label for _, label in tops)
    sentence = (
        f"Selon la stratégie, son score ({breakdown.get('total', 0)}) provient "
        f"principalement de {drivers}."
    )
    if breakdown.get("penalties"):
        sentence += " Une pénalité de forme a été appliquée (configuration historiquement rare)."
    return sentence


SPECIALS = {
    "STRATEGY_RANDOM": (
        "Combinaison tirée uniformément au hasard : c'est la BASELINE de comparaison. "
        "Si une stratégie ne fait pas mieux qu'elle au backtesting, son score n'apporte rien."
    ),
    "STRATEGY_COLD_NUMBERS": (
        "Cette stratégie privilégie les numéros peu sortis. Attention : un numéro « en retard » "
        "n'est pas « dû » — croire l'inverse est le sophisme du joueur."
    ),
}


def build_explanation(
    code: str,
    numbers: list[int],
    breakdown: dict,
    inputs: StrategyInputs,
) -> str:
    parts = [_facts(numbers, inputs)]
    if code in SPECIALS:
        parts.append(SPECIALS[code])
    if code != "STRATEGY_RANDOM":
        parts.append(_score_reading(code, breakdown))
    parts.append(LIMIT_SENTENCE)
    text = " ".join(parts)
    assert not any(f in text.lower() for f in FORBIDDEN), "formulation interdite générée"
    return text


def rng_seed(code: str, cutoff_draw_id: str) -> int:
    """Graine déterministe : mêmes données (cutoff) ⇒ mêmes candidates."""
    import hashlib

    digest = hashlib.sha256(f"{code}:{cutoff_draw_id}".encode()).digest()
    return int.from_bytes(digest[:8], "big")


def make_rng(code: str, cutoff_draw_id: str) -> np.random.Generator:
    return np.random.default_rng(rng_seed(code, cutoff_draw_id))
