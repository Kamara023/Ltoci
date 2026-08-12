"""Tests unitaires des règles de qualité (fonctions pures)."""

from datetime import date

from app.quality.rules import (
    DrawContext,
    SetConfig,
    compute_status,
    rule_invalid_date,
    rule_missing_set,
    rule_sets_integrity,
    rule_unscheduled,
)

TODAY = date(2026, 8, 12)
CONFIGS = {"WINNING": SetConfig(5, 1, 90), "MACHINE": SetConfig(5, 1, 90)}


def ctx(**kwargs) -> DrawContext:
    defaults = dict(
        draw_id="d1",
        draw_date=date(2026, 8, 1),
        today=TODAY,
        sets={"WINNING": [1, 2, 3, 4, 5], "MACHINE": [6, 7, 8, 9, 10]},
        set_configs=CONFIGS,
    )
    defaults.update(kwargs)
    return DrawContext(**defaults)


def test_invalid_date_future_et_plancher():
    assert rule_invalid_date(ctx(draw_date=date(2027, 1, 1)))[0].severity == "BLOCKING"
    assert rule_invalid_date(ctx(draw_date=date(2018, 1, 1)))[0].rule_code == "INVALID_DATE"
    assert rule_invalid_date(ctx()) == []


def test_missing_set_recent_bloque_en_revue():
    issues = rule_missing_set(ctx(sets={"WINNING": [1, 2, 3, 4, 5]}, draw_date=date(2026, 8, 10)))
    assert len(issues) == 1
    assert issues[0].severity == "WARNING"
    assert not issues[0].auto_resolved


def test_missing_set_ancien_auto_resolu():
    issues = rule_missing_set(ctx(sets={"WINNING": [1, 2, 3, 4, 5]}, draw_date=date(2026, 7, 1)))
    assert len(issues) == 1
    assert issues[0].auto_resolved
    assert issues[0].resolution_note


def test_missing_set_absent_si_machine_presente():
    assert rule_missing_set(ctx()) == []


def test_unscheduled_inerte_sans_planning_et_actif_avec():
    assert rule_unscheduled(ctx(schedule_days=None)) == []
    assert rule_unscheduled(ctx(schedule_days=[])) == []
    # 2026-08-01 est un samedi (isoweekday 6)
    assert rule_unscheduled(ctx(schedule_days=[6])) == []
    assert rule_unscheduled(ctx(schedule_days=[1, 2]))[0].rule_code == "UNSCHEDULED"


def test_sets_integrity_defensive():
    bad_card = ctx(sets={"WINNING": [1, 2, 3]})
    assert any(i.rule_code == "BAD_CARDINALITY" for i in rule_sets_integrity(bad_card))
    out = ctx(sets={"WINNING": [1, 2, 3, 4, 95]})
    assert any(i.rule_code == "OUT_OF_RANGE" for i in rule_sets_integrity(out))
    dup = ctx(sets={"WINNING": [1, 1, 3, 4, 5]})
    assert any(i.rule_code == "DUP_IN_SET" for i in rule_sets_integrity(dup))
    assert rule_sets_integrity(ctx()) == []


def test_compute_status():
    assert compute_status([]) == "VALID"
    assert compute_status([("MISSING_SET", "WARNING")]) == "PENDING_REVIEW"
    assert compute_status([("INVALID_DATE", "BLOCKING"), ("X", "WARNING")]) == "INVALID"
