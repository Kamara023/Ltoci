"""Tests de l'inférence du calendrier des tirages (fonctions pures).

Cas réels observés dans l'historique LONACI : jeux quotidiens, hebdomadaires
à jour fixe, week-end, et tirages exceptionnels (jours fériés) qui ne doivent
JAMAIS se voir attribuer un rythme hebdomadaire.
"""

import datetime as dt

from app.schedules import infer_days_of_week, infer_time_from_code

TODAY = dt.date(2026, 8, 14)  # un vendredi (ISO 5)


def _dates(start: dt.date, count: int, step_days: int = 1) -> list[dt.date]:
    return [start + dt.timedelta(days=i * step_days) for i in range(count)]


def test_jeu_quotidien_tous_les_jours():
    # 90 jours consécutifs jusqu'à aujourd'hui (cas 'afterwork', 'digital-21h').
    dates = _dates(TODAY - dt.timedelta(days=89), 90)
    assert infer_days_of_week(dates, TODAY) == [1, 2, 3, 4, 5, 6, 7]


def test_jeu_hebdomadaire_un_seul_jour():
    # Tous les lundis depuis 13 semaines (cas 'akwaba', 'etoile', 'reveil').
    first_monday = TODAY - dt.timedelta(days=TODAY.isoweekday() - 1 + 7 * 12)
    dates = _dates(first_monday, 13, step_days=7)
    assert infer_days_of_week(dates, TODAY) == [1]


def test_jeu_week_end():
    # Samedis ET dimanches (cas 'special-weekend-1h').
    dates: list[dt.date] = []
    cursor = TODAY - dt.timedelta(days=84)
    while cursor <= TODAY:
        if cursor.isoweekday() in (6, 7):
            dates.append(cursor)
        cursor += dt.timedelta(days=1)
    assert infer_days_of_week(dates, TODAY) == [6, 7]


def test_tirage_exceptionnel_reste_irregulier():
    # Cas 'day-off' : quelques tirages de jours fériés, aucun rythme.
    dates = [
        dt.date(2026, 4, 6),
        dt.date(2026, 5, 1),
        dt.date(2026, 5, 27),
        dt.date(2026, 7, 3),
    ]
    assert infer_days_of_week(dates, TODAY) == []


def test_historique_trop_court_ne_conclut_pas():
    assert infer_days_of_week([TODAY - dt.timedelta(days=1)], TODAY) == []
    assert infer_days_of_week([], TODAY) == []


def test_jeu_recent_quotidien_reconnu():
    """Un jeu lancé il y a 2 semaines et tirant tous les jours ne doit PAS
    être déclaré irrégulier : la fenêtre part de son premier tirage."""
    dates = _dates(TODAY - dt.timedelta(days=13), 14)
    assert infer_days_of_week(dates, TODAY) == [1, 2, 3, 4, 5, 6, 7]


def test_jour_manque_ponctuellement_reste_retenu():
    """Un lundi annulé sur 13 ne remet pas le calendrier en cause (seuil 60 %)."""
    first_monday = TODAY - dt.timedelta(days=TODAY.isoweekday() - 1 + 7 * 12)
    dates = _dates(first_monday, 13, step_days=7)
    del dates[4]
    assert infer_days_of_week(dates, TODAY) == [1]


def test_heure_deduite_du_code():
    assert infer_time_from_code("digital-21h") == dt.time(21, 0)
    assert infer_time_from_code("digital-reveil-7h") == dt.time(7, 0)
    assert infer_time_from_code("special-weekend-1h") == dt.time(1, 0)
    # Aucune heure encodée : on n'invente rien.
    assert infer_time_from_code("premiere-heure") is None
    assert infer_time_from_code("akwaba") is None
    assert infer_time_from_code("fortune-thursday") is None
    assert infer_time_from_code("digital-99h") is None
