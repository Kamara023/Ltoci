"""Tests des importeurs CSV / Excel / JSON (parsing pur)."""

import io
import json
from datetime import date

from app.importers.files import parse_csv, parse_excel, parse_json


def test_csv_nominal_virgule():
    content = (
        "date,tirage,gagnants,machine\n"
        "2026-08-10,Réveil,4-17-33-58-89,1-2-3-4-5\n"
        "10/08/2026,Etoile,7 21 35 49 63,\n"
    ).encode()
    result = parse_csv(content)
    assert result.found == 2
    assert len(result.draws) == 2
    first = result.draws[0]
    assert first.draw_code == "reveil"
    assert first.draw_date == date(2026, 8, 10)
    assert first.winning == [4, 17, 33, 58, 89]
    assert first.machine == [1, 2, 3, 4, 5]
    assert result.draws[1].machine is None  # machine optionnelle


def test_csv_point_virgule_et_rejets():
    content = (
        "date;tirage;gagnants;machine\n"
        "2026-08-10;Réveil;4-17-33-58-89;\n"
        "pas-une-date;Etoile;1-2-3-4-5;\n"
        "2026-08-11;;1-2-3-4-5;\n"
        "2026-08-12;Sika;un-deux;\n"
    ).encode()
    result = parse_csv(content)
    assert len(result.draws) == 1
    assert len(result.rejected) == 3
    reasons = " | ".join(r["reason"] for r in result.rejected)
    assert "date" in reasons and "tirage" in reasons and "gagnants" in reasons


def test_json_nominal_et_invalide():
    rows = [
        {
            "date": "2026-08-10",
            "tirage": "Fortune",
            "gagnants": "1,2,3,4,5",
            "machine": "6,7,8,9,10",
        },
        {"date": "2026-08-11", "tirage": "Fortune"},
    ]
    result = parse_json(json.dumps(rows).encode("utf-8"))
    assert len(result.draws) == 1
    assert len(result.rejected) == 1

    broken = parse_json(b"{pas du json")
    assert broken.draws == [] and broken.rejected


def test_excel_nominal():
    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.append(["date", "tirage", "gagnants", "machine"])
    ws.append(["2026-08-10", "Baraka", "11-22-33-44-55", "10-20-30-40-50"])
    ws.append([None, None, None, None])  # ligne vide ignorée
    buffer = io.BytesIO()
    wb.save(buffer)

    result = parse_excel(buffer.getvalue())
    assert len(result.draws) == 1
    d = result.draws[0]
    assert d.draw_code == "baraka"
    assert d.winning == [11, 22, 33, 44, 55]
    assert d.machine == [10, 20, 30, 40, 50]
