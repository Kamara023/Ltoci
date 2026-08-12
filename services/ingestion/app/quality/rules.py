"""Règles de qualité des données — fonctions PURES sur un contexte chargé.

Chaque règle reçoit un DrawContext et retourne les problèmes détectés.
Sévérités : BLOCKING → tirage INVALID ; WARNING → tirage PENDING_REVIEW
(sauf issue auto-résolue, qui n'empêche pas la validation).

La décision finale de statut appartient au runner ; une décision MANUELLE
(validated_by non nul) prime toujours et n'est jamais écrasée par le moteur.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta

# Ancienneté au-delà de laquelle un ensemble machine manquant est considéré
# comme définitivement non publié par la source (auto-résolution).
MISSING_SET_GRACE_DAYS = 7

# Borne basse de plausibilité des dates (le Loto Bonheur collecté démarre
# en octobre 2020 ; toute date antérieure à ce plancher est suspecte).
MIN_PLAUSIBLE_DATE = date(2019, 1, 1)


@dataclass
class SetConfig:
    numbers_count: int
    number_min: int
    number_max: int


@dataclass
class DrawContext:
    draw_id: str
    draw_date: date
    today: date
    sets: dict[str, list[int]]  # code ensemble -> numéros
    set_configs: dict[str, SetConfig]  # config du jeu par code d'ensemble
    schedule_days: list[int] | None = None  # days_of_week du type (vide/None = inconnu)
    unresolved_rules: set[str] = field(default_factory=set)  # issues ouvertes existantes


@dataclass
class Issue:
    rule_code: str
    severity: str  # 'BLOCKING' | 'WARNING'
    details: dict
    auto_resolved: bool = False
    resolution_note: str | None = None


def rule_invalid_date(ctx: DrawContext) -> list[Issue]:
    if ctx.draw_date > ctx.today:
        return [
            Issue(
                "INVALID_DATE",
                "BLOCKING",
                {"draw_date": str(ctx.draw_date), "reason": "date future"},
            )
        ]
    if ctx.draw_date < MIN_PLAUSIBLE_DATE:
        return [
            Issue(
                "INVALID_DATE",
                "BLOCKING",
                {"draw_date": str(ctx.draw_date), "reason": "date antérieure au plancher"},
            )
        ]
    return []


def rule_missing_set(ctx: DrawContext) -> list[Issue]:
    """MACHINE absent : bloque en revue si récent (peut encore être publié),
    auto-résolu si ancien (la source ne le publiera plus)."""
    if "MACHINE" not in ctx.set_configs or "MACHINE" in ctx.sets:
        return []
    age = (ctx.today - ctx.draw_date).days
    if age >= MISSING_SET_GRACE_DAYS:
        return [
            Issue(
                "MISSING_SET",
                "WARNING",
                {"set": "MACHINE", "age_days": age},
                auto_resolved=True,
                resolution_note="Ensemble machine non publié par la source (délai dépassé)",
            )
        ]
    return [Issue("MISSING_SET", "WARNING", {"set": "MACHINE", "age_days": age})]


def rule_unscheduled(ctx: DrawContext) -> list[Issue]:
    """Jour hors planning du type de tirage — inerte tant que le référentiel
    ne définit pas days_of_week (cas actuel)."""
    if not ctx.schedule_days:
        return []
    # PostgreSQL smallint[] : convention ISO 1=lundi … 7=dimanche.
    if ctx.draw_date.isoweekday() not in ctx.schedule_days:
        return [
            Issue(
                "UNSCHEDULED",
                "WARNING",
                {"weekday": ctx.draw_date.isoweekday(), "expected": ctx.schedule_days},
            )
        ]
    return []


def rule_sets_integrity(ctx: DrawContext) -> list[Issue]:
    """Re-vérification défensive de ce que le trigger SQL garantit à l'écriture.
    Une détection ici signifierait corruption ou changement de config du jeu."""
    issues: list[Issue] = []
    for code, numbers in ctx.sets.items():
        cfg = ctx.set_configs.get(code)
        if cfg is None:
            continue
        if len(numbers) != cfg.numbers_count:
            issues.append(
                Issue(
                    "BAD_CARDINALITY",
                    "BLOCKING",
                    {"set": code, "expected": cfg.numbers_count, "got": len(numbers)},
                )
            )
        if any(n < cfg.number_min or n > cfg.number_max for n in numbers):
            issues.append(
                Issue(
                    "OUT_OF_RANGE",
                    "BLOCKING",
                    {"set": code, "numbers": numbers, "range": [cfg.number_min, cfg.number_max]},
                )
            )
        if len(set(numbers)) != len(numbers):
            issues.append(Issue("DUP_IN_SET", "BLOCKING", {"set": code, "numbers": numbers}))
    return issues


ALL_RULES = [rule_invalid_date, rule_missing_set, rule_unscheduled, rule_sets_integrity]


def evaluate(ctx: DrawContext) -> list[Issue]:
    issues: list[Issue] = []
    for rule in ALL_RULES:
        issues.extend(rule(ctx))
    return issues


def compute_status(unresolved: list[tuple[str, str]]) -> str:
    """Statut cible d'après les issues NON RÉSOLUES (rule_code, severity)."""
    if any(sev == "BLOCKING" for _, sev in unresolved):
        return "INVALID"
    if unresolved:
        return "PENDING_REVIEW"
    return "VALID"


def expected_grace_deadline(draw_date: date) -> date:
    return draw_date + timedelta(days=MISSING_SET_GRACE_DAYS)
