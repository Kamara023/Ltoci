"""Tests du parser lonaci_api sur des réponses RÉELLES de l'API (fixtures)."""

import json
from datetime import date
from pathlib import Path

import pytest

from app.parsers.lonaci_api import (
    FormatChangeError,
    parse_month,
    parse_numbers,
    slugify,
)

FIXTURES = Path(__file__).parent / "fixtures"


def load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8-sig"))


def test_parse_numbers_nominal():
    assert parse_numbers("61 - 63 - 36 - 89 - 69") == [61, 63, 36, 89, 69]


def test_parse_numbers_placeholder():
    assert parse_numbers('"." - "." - "." - "." - "."') is None
    assert parse_numbers(". - . - . - . - .") is None
    assert parse_numbers(None) is None


def test_slugify():
    assert slugify("Première Heure") == "premiere-heure"
    assert slugify("Digital Réveil 7h") == "digital-reveil-7h"
    assert slugify("Monday Special") == "monday-special"


def test_parse_month_juillet_2026():
    result = parse_month(load("juillet-2026.json"))
    assert len(result.draws) > 100  # un mois complet, plusieurs tirages/jour
    # Tous les tirages du mois sont bien datés de juillet 2026
    # (la dernière semaine '27/07 -> 02/08' peut déborder sur août).
    for d in result.draws:
        assert d.draw_date.year == 2026
        assert d.draw_date.month in (7, 8)
        assert d.winning is not None and len(d.winning) == 5
        assert all(1 <= n <= 90 for n in d.winning)
    codes = {d.draw_code for d in result.draws}
    assert "reveil" in codes
    assert any(c.startswith("digital") for c in codes)  # tirages 'night'


def test_parse_month_decembre_2020_passage_annee():
    """La semaine 28/12/2020 -> 03/01/2021 contient des jours de janvier :
    l'année doit être correctement inférée (2021, pas 2020)."""
    result = parse_month(load("decembre-2020.json"))
    assert result.draws, "le mois ne doit pas être vide"
    january = [d for d in result.draws if d.draw_date.month == 1]
    december = [d for d in result.draws if d.draw_date.month == 12]
    assert december, "les tirages de décembre 2020 doivent être présents"
    for d in december:
        assert d.draw_date.year == 2020
    for d in january:
        assert d.draw_date.year == 2021, f"{d.draw_date} devrait être en 2021"


def test_parse_month_expose_month_years():
    result = parse_month(load("juillet-2026.json"))
    assert "octobre 2020" in [m.lower() for m in result.month_years]


def test_format_change_detecte():
    with pytest.raises(FormatChangeError):
        parse_month({"autre": "structure"})
    with pytest.raises(FormatChangeError):
        parse_month({"drawsResultsWeekly": [{"startDate": "pas-une-date"}]})


def test_placeholder_ignore_avec_warning():
    payload = {
        "drawsResultsWeekly": [
            {
                "startDate": "10/08/2026",
                "endDate": "16/08/2026",
                "drawResultsDaily": [
                    {
                        "date": "lundi 10/08",
                        "drawResults": {
                            "standardDraws": [
                                {
                                    "drawName": "Reveil",
                                    "winningNumbers": ". - . - . - . - .",
                                    "machineNumbers": ". - . - . - . - .",
                                }
                            ],
                            "nightDraws": [],
                        },
                    }
                ],
            }
        ]
    }
    result = parse_month(payload)
    assert result.draws == []
    assert any("Reveil" in w for w in result.warnings)


def test_machine_manquante_tolere():
    payload = {
        "drawsResultsWeekly": [
            {
                "startDate": "10/08/2026",
                "endDate": "16/08/2026",
                "drawResultsDaily": [
                    {
                        "date": "lundi 10/08",
                        "drawResults": {
                            "standardDraws": [
                                {
                                    "drawName": "Reveil",
                                    "winningNumbers": "1 - 2 - 3 - 4 - 5",
                                    "machineNumbers": ". - . - . - . - .",
                                }
                            ],
                            "nightDraws": [],
                        },
                    }
                ],
            }
        ]
    }
    result = parse_month(payload)
    assert len(result.draws) == 1
    d = result.draws[0]
    assert d.draw_date == date(2026, 8, 10)
    assert d.winning == [1, 2, 3, 4, 5]
    assert d.machine is None
