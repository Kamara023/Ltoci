"""Inférence du CALENDRIER de chaque type de tirage à partir de l'historique.

La source LONACI ne publie aucun calendrier : les types de tirage créés
automatiquement (cf. writer) arrivent sans jours ni heure. Or le moteur de
prévisions doit savoir QUAND aura lieu le prochain tirage d'un type — sinon il
produit des prévisions pour des tirages qui n'auront pas lieu.

L'historique, lui, est sans ambiguïté : `afterwork` sort tous les jours,
`akwaba` tous les lundis, `special-weekend-1h` samedi et dimanche, tandis que
`day-off` (tirages de jours fériés) n'a aucun rythme hebdomadaire.

Méthode : pour chaque jour de la semaine, on compare le nombre de tirages
observés au nombre de fois où ce jour est apparu dans la fenêtre
d'observation. La fenêtre démarre au PREMIER tirage du type (un jeu récent
n'est pas déclaré irrégulier à tort). Aucun jour retenu => type irrégulier,
son calendrier reste vide et le moteur de prévisions s'abstient.
"""

from __future__ import annotations

import datetime as dt
import re
from dataclasses import dataclass, field

import structlog
from sqlalchemy import func, select, update

from app.core.db import get_engine, table

log = structlog.get_logger()

# Un jour est retenu s'il est honoré au moins 60 % du temps : tolère les
# annulations ponctuelles sans laisser passer un jour exceptionnel.
DAY_RATIO_THRESHOLD = 0.6
OBSERVATION_DAYS = 180
MIN_OCCURRENCES = 3  # en dessous, aucune conclusion hebdomadaire n'est fiable
# Codes encodant l'heure : 'digital-21h' -> 21:00, 'digital-reveil-7h' -> 07:00.
_HOUR_IN_CODE = re.compile(r"(?:^|-)(\d{1,2})h$")


@dataclass
class ScheduleStats(dict):
    types_seen: int = 0
    updated: int = 0
    irregular: int = 0
    times_inferred: int = 0
    details: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "types_seen": self.types_seen,
            "updated": self.updated,
            "irregular": self.irregular,
            "times_inferred": self.times_inferred,
            "details": self.details[:20],
        }


def infer_days_of_week(
    dates: list[dt.date],
    today: dt.date,
    threshold: float = DAY_RATIO_THRESHOLD,
    window_days: int = OBSERVATION_DAYS,
) -> list[int]:
    """Jours ISO (1=lundi … 7=dimanche) où ce type tire réellement.

    PURE : entièrement testable. Retourne [] si aucun rythme hebdomadaire
    ne se dégage (type irrégulier / historique trop court).
    """
    if len(dates) < MIN_OCCURRENCES:
        return []
    window_start = max(min(dates), today - dt.timedelta(days=window_days))
    observed = [d for d in dates if window_start <= d <= today]
    if len(observed) < MIN_OCCURRENCES:
        return []

    # Nombre de fois où chaque jour de la semaine est apparu dans la fenêtre.
    total_days = (today - window_start).days + 1
    available: dict[int, int] = {}
    for offset in range(total_days):
        iso = (window_start + dt.timedelta(days=offset)).isoweekday()
        available[iso] = available.get(iso, 0) + 1

    drawn: dict[int, int] = {}
    for d in observed:
        iso = d.isoweekday()
        drawn[iso] = drawn.get(iso, 0) + 1

    return sorted(
        iso
        for iso, count in drawn.items()
        if available.get(iso, 0) > 0 and count / available[iso] >= threshold
    )


def infer_time_from_code(code: str) -> dt.time | None:
    """Heure déduite du code quand il la contient explicitement, sinon None."""
    match = _HOUR_IN_CODE.search(code)
    if not match:
        return None
    hour = int(match.group(1))
    return dt.time(hour=hour) if 0 <= hour <= 23 else None


def refresh_draw_type_schedules(runlog=None, today: dt.date | None = None) -> dict:
    """Recalcule et persiste le calendrier de chaque type actif.

    N'écrit que sur changement. N'écrase JAMAIS une heure déjà renseignée
    (les types du seed portent les horaires officiels LONACI).
    """
    today = today or dt.date.today()
    draws_t = table("core", "draws")
    types_t = table("core", "draw_types")
    stats = ScheduleStats()

    engine = get_engine()
    with engine.connect() as conn:
        types = conn.execute(
            select(
                types_t.c.id,
                types_t.c.code,
                types_t.c.days_of_week,
                types_t.c.scheduled_time,
                types_t.c.metadata,
            )
            .where(types_t.c.is_active)
            .order_by(types_t.c.code)
        ).all()
        rows = conn.execute(
            select(draws_t.c.draw_type_id, draws_t.c.draw_date)
            .where(draws_t.c.draw_date > today - dt.timedelta(days=OBSERVATION_DAYS * 2))
            .order_by(draws_t.c.draw_date)
        ).all()
        first_seen = dict(
            conn.execute(
                select(draws_t.c.draw_type_id, func.min(draws_t.c.draw_date)).group_by(
                    draws_t.c.draw_type_id
                )
            ).all()
        )

    dates_by_type: dict[str, list[dt.date]] = {}
    for row in rows:
        dates_by_type.setdefault(str(row.draw_type_id), []).append(row.draw_date)

    for type_row in types:
        stats.types_seen += 1
        type_id = str(type_row.id)
        dates = dates_by_type.get(type_id, [])
        days = infer_days_of_week(dates, today)
        if not days:
            stats.irregular += 1

        current_days = sorted(type_row.days_of_week or [])
        new_time = type_row.scheduled_time
        time_inferred = False
        if new_time is None:
            guessed = infer_time_from_code(type_row.code)
            if guessed is not None:
                new_time = guessed
                time_inferred = True

        metadata = dict(type_row.metadata or {})
        schedule_meta = {
            "kind": "weekly" if days else "irregular",
            "days_source": "inferred-from-history",
            "observed_draws": len(dates),
            "first_seen": str(first_seen.get(type_row.id, "")) or None,
            "computed_at": str(today),
        }
        if time_inferred:
            schedule_meta["time_source"] = "inferred-from-code"
        changed = (
            days != current_days
            or new_time != type_row.scheduled_time
            or metadata.get("schedule") != schedule_meta
        )
        if not changed:
            continue

        metadata["schedule"] = schedule_meta
        with engine.begin() as conn:
            conn.execute(
                update(types_t)
                .where(types_t.c.id == type_row.id)
                .values(days_of_week=days, scheduled_time=new_time, metadata=metadata)
            )
        stats.updated += 1
        if time_inferred:
            stats.times_inferred += 1
        stats.details.append(
            f"{type_row.code}: jours={days or 'irrégulier'}"
            + (f" heure={new_time}" if time_inferred else "")
        )

    if runlog is not None and stats.updated:
        runlog.event("INFO", "Calendrier des tirages mis à jour", stats.as_dict())
    log.info("draw_type_schedules_refreshed", **{k: v for k, v in stats.as_dict().items()
                                                 if k != "details"})
    return stats.as_dict()
