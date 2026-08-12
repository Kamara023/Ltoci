"""Parsing PUR de la réponse JSON de https://lotobonheur.ci/api/results.

Aucun réseau, aucune base de données : dict en entrée, structures typées en
sortie — entièrement testable sur fixtures.

Structure source (constatée le 12/08/2026) :
  { success, drawTypes[], monthYears[],
    drawsResultsWeekly: [ { startDate: "JJ/MM/AAAA", endDate: "JJ/MM/AAAA",
        drawResultsDaily: [ { date: "mercredi 12/08",
            drawResults: { standardDraws: [...], nightDraws: [...] } } ] } ] }
Chaque tirage : { drawName, winningNumbers: "61 - 63 - …", machineNumbers: "…" }
Tirage non publié : numéros remplacés par des points (".").
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date


class FormatChangeError(Exception):
    """La structure de la source a changé — run PARTIAL/FAILED, base intacte."""


@dataclass
class ParsedDraw:
    draw_name: str
    draw_code: str
    category: str  # 'standard' | 'night'
    draw_date: date
    winning: list[int] | None
    machine: list[int] | None
    raw: dict = field(default_factory=dict)


@dataclass
class ParseResult:
    draws: list[ParsedDraw] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    month_years: list[str] = field(default_factory=list)


def slugify(name: str) -> str:
    """'Première Heure' -> 'premiere-heure' ; 'Digital Réveil 7h' -> 'digital-reveil-7h'."""
    norm = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    norm = re.sub(r"[^a-zA-Z0-9]+", "-", norm).strip("-").lower()
    return norm


def parse_numbers(value: object) -> list[int] | None:
    """'61 - 63 - 36 - 89 - 69' -> [61, 63, 36, 89, 69] ; placeholder '.' -> None."""
    if not isinstance(value, str):
        return None
    tokens = [t.strip() for t in value.split("-")]
    numbers: list[int] = []
    for t in tokens:
        if not t or not t.replace(" ", "").isdigit():
            return None  # placeholder ('.') ou contenu inattendu
        numbers.append(int(t))
    return numbers or None


def _parse_ddmmyyyy(value: str) -> date:
    day, month, year = value.strip().split("/")
    return date(int(year), int(month), int(day))


def _resolve_daily_date(day_label: str, week_start: date, week_end: date) -> date:
    """'mercredi 12/08' + semaine -> date complète, robuste au passage d'année.

    L'année est choisie parmi {start-1, start, start+1} pour minimiser la
    distance à la fenêtre de la semaine (les semaines de fin décembre
    contiennent des jours de janvier de l'année suivante).
    """
    m = re.search(r"(\d{1,2})/(\d{1,2})", day_label)
    if not m:
        raise FormatChangeError(f"Date journalière illisible : {day_label!r}")
    day, month = int(m.group(1)), int(m.group(2))
    candidates = []
    for year in (week_start.year - 1, week_start.year, week_start.year + 1):
        try:
            candidates.append(date(year, month, day))
        except ValueError:
            continue
    if not candidates:
        raise FormatChangeError(f"Date journalière invalide : {day_label!r}")

    def distance(d: date) -> int:
        if d < week_start:
            return (week_start - d).days
        if d > week_end:
            return (d - week_end).days
        return 0

    best = min(candidates, key=distance)
    if distance(best) > 7:
        raise FormatChangeError(
            f"Date {best} hors de la semaine {week_start}..{week_end} ({day_label!r})"
        )
    return best


def parse_month(payload: dict) -> ParseResult:
    """Parse une réponse mensuelle complète. Lève FormatChangeError si la
    structure attendue est absente ; les tirages incomplets sont ignorés
    avec un avertissement (ils seront re-collectés plus tard)."""
    if not isinstance(payload, dict) or "drawsResultsWeekly" not in payload:
        raise FormatChangeError("Champ 'drawsResultsWeekly' absent de la réponse")

    result = ParseResult()
    month_years = payload.get("monthYears")
    if isinstance(month_years, list):
        result.month_years = [str(m) for m in month_years]

    weekly = payload["drawsResultsWeekly"]
    if not isinstance(weekly, list):
        raise FormatChangeError("'drawsResultsWeekly' n'est pas une liste")

    for week in weekly:
        try:
            week_start = _parse_ddmmyyyy(week["startDate"])
            week_end = _parse_ddmmyyyy(week["endDate"])
            daily_list = week["drawResultsDaily"]
        except (KeyError, TypeError, ValueError) as exc:
            raise FormatChangeError(f"Structure de semaine inattendue : {exc}") from exc

        for daily in daily_list:
            try:
                day_label = daily["date"]
                draw_results = daily["drawResults"]
            except (KeyError, TypeError) as exc:
                raise FormatChangeError(f"Structure journalière inattendue : {exc}") from exc

            draw_date = _resolve_daily_date(day_label, week_start, week_end)

            for category, key in (("standard", "standardDraws"), ("night", "nightDraws")):
                for entry in draw_results.get(key, []) or []:
                    name = entry.get("drawName")
                    if not name or not isinstance(name, str):
                        result.warnings.append(f"{draw_date}: tirage sans nom ignoré ({category})")
                        continue
                    winning = parse_numbers(entry.get("winningNumbers"))
                    machine = parse_numbers(entry.get("machineNumbers"))
                    if winning is None:
                        # Non encore publié (placeholder) : ignoré, re-collecté plus tard.
                        result.warnings.append(
                            f"{draw_date} {name}: numéros gagnants absents — ignoré"
                        )
                        continue
                    result.draws.append(
                        ParsedDraw(
                            draw_name=name.strip(),
                            draw_code=slugify(name),
                            category=category,
                            draw_date=draw_date,
                            winning=winning,
                            machine=machine,
                            raw=dict(entry),
                        )
                    )
    return result
