"""Tests unitaires des calculs statistiques — historique synthétique,
résultats attendus calculés à la main (aucune base de données)."""

from datetime import date

import pandas as pd

from app.statistics.numbers import compute_number_rows
from app.statistics.pairs import compute_pair_rows
from app.statistics.shapes import compute_shape_rows


def seq(rows: list[tuple[str, list[int]]]) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "draw_date": [date(2026, 1, i + 1) for i in range(len(rows))],
            "type_code": [r[0] for r in rows],
            "numbers": [r[1] for r in rows],
        }
    )


HISTORY = seq(
    [
        ("a", [1, 2, 3, 4, 5]),
        ("a", [1, 10, 20, 30, 40]),
        ("a", [2, 10, 50, 60, 70]),
        ("a", [1, 2, 80, 81, 90]),
        ("a", [5, 15, 25, 35, 45]),
    ]
)


def by_number(rows):
    return {r["number"]: r for r in rows}


def test_frequences_et_retards_calcules_a_la_main():
    stats = by_number(compute_number_rows(HISTORY, 1, 90, None))
    assert len(stats) == 90  # les 90 numéros matérialisés, même à fréquence 0

    n1 = stats[1]  # apparitions aux positions 0, 1, 3
    assert n1["frequency"] == 3
    assert n1["relative_freq"] == 0.6
    assert n1["current_gap"] == 1
    assert n1["avg_gap"] == 1.5
    assert n1["max_gap"] == 2
    assert n1["last_seen_date"] == date(2026, 1, 4)

    n5 = stats[5]  # positions 0 et 4
    assert n5["frequency"] == 2
    assert n5["current_gap"] == 0
    assert n5["avg_gap"] == 4.0

    n7 = stats[7]  # jamais vu
    assert n7["frequency"] == 0
    assert n7["current_gap"] == 5  # = taille de la fenêtre
    assert n7["avg_gap"] is None and n7["max_gap"] is None
    assert n7["last_seen_date"] is None


def test_fenetre_glissante():
    stats = by_number(compute_number_rows(HISTORY, 1, 90, 3))  # 3 derniers tirages
    assert stats[1]["frequency"] == 1  # position 1 dans la fenêtre (tirage 4)
    assert stats[1]["current_gap"] == 1
    assert stats[50]["frequency"] == 1
    assert stats[3]["frequency"] == 0
    assert stats[3]["current_gap"] == 3


def test_trend_pente_reguliere():
    s = seq([("a", [10, 20, 30, 40, 50])] * 2 + [("a", [1, 20, 30, 40, 50])] * 2)
    stats = by_number(compute_number_rows(s, 1, 90, None))
    # Numéro 1 : y = [0,0,1,1] sur x = [0..3] -> pente 0.4 -> trend 40.0
    assert stats[1]["trend"] == 40.0
    # Numéro 10 : y = [1,1,0,0] -> trend -40.0
    assert stats[10]["trend"] == -40.0


def test_paires_et_lift():
    s = seq(
        [
            ("a", [1, 2, 3, 4, 5]),
            ("a", [1, 2, 10, 20, 30]),
            ("a", [3, 10, 20, 40, 50]),
        ]
    )
    pairs = {(r["number_a"], r["number_b"]): r for r in compute_pair_rows(s, None)}
    # (1,2) observé 2 fois ; attendu = f1·f2/n = 2·2/3 -> lift = 2 / 1.3333 = 1.5
    assert pairs[(1, 2)]["frequency"] == 2
    assert pairs[(1, 2)]["lift"] == 1.5
    assert pairs[(10, 20)]["lift"] == 1.5
    # (1,3) observé 1 fois -> lift 0.75
    assert pairs[(1, 3)]["frequency"] == 1
    assert pairs[(1, 3)]["lift"] == 0.75
    # 10 paires par tirage
    assert sum(r["frequency"] for r in compute_pair_rows(s, None)) == 30


def test_formes_calculees_a_la_main():
    s = seq(
        [
            ("a", [1, 2, 3, 4, 5]),       # sum 15, spread 4, odd 3, high 0, consec 4
            ("a", [46, 47, 60, 89, 90]),  # sum 332, spread 44, odd 2, high 5, consec 2
        ]
    )
    rows = {r["metric"]: r for r in compute_shape_rows(s, 1, 90, None)}
    assert rows["sum"]["histogram"] == {"15": 1, "332": 1}
    assert rows["sum"]["summary"]["mean"] == 173.5
    assert rows["spread"]["histogram"] == {"4": 1, "44": 1}
    assert rows["odd_count"]["histogram"] == {"2": 1, "3": 1}
    assert rows["high_count"]["histogram"] == {"0": 1, "5": 1}
    assert rows["consecutive_count"]["histogram"] == {"2": 1, "4": 1}
    # Répétitions entre les 2 tirages du même type : intersection vide -> {0: 1}
    assert rows["repeat_prev_count"]["histogram"] == {"0": 1}


def test_repetitions_par_type_uniquement():
    s = seq(
        [
            ("a", [1, 2, 3, 4, 5]),
            ("b", [1, 2, 3, 4, 5]),      # type différent : PAS comparé au précédent
            ("a", [1, 2, 30, 40, 50]),   # vs tirage 1 (même type a) -> 2 communs
            ("b", [6, 7, 8, 9, 10]),     # vs tirage 2 (type b) -> 0 commun
        ]
    )
    rows = {r["metric"]: r for r in compute_shape_rows(s, 1, 90, None)}
    assert rows["repeat_prev_count"]["histogram"] == {"0": 1, "2": 1}
    assert rows["repeat_prev_count"]["summary"]["count"] == 2  # 2 comparaisons seulement
