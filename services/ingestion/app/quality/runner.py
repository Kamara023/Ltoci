"""Runner du pipeline qualité : évalue les règles, gère les issues et statue.

Scopes :
  'pending'     — tous les tirages non VALID sans décision manuelle ;
  'all'         — tout l'historique sans décision manuelle ;
  'run:<uuid>'  — tirages créés par un run d'ingestion donné ;
  'draw:<uuid>' — un tirage précis.

Invariants :
  - une décision MANUELLE (validated_by non nul) n'est jamais écrasée ;
  - pas de doublon d'issue non résolue (même tirage + même règle) ;
  - idempotent : re-run sans changement de données => aucun effet.
"""

from __future__ import annotations

import datetime as dt

import structlog
from sqlalchemy import insert, select, update

from app.core.db import get_engine, table
from app.quality.rules import DrawContext, SetConfig, compute_status, evaluate
from app.runlog import RunLogger

log = structlog.get_logger()

QUALITY_SOURCE = "quality-engine"
GAME_CODE = "loto-bonheur"
BATCH_SIZE = 1000


class QualityStats(dict):
    def __init__(self) -> None:
        super().__init__(
            checked=0,
            validated=0,
            invalidated=0,
            pending=0,
            unchanged=0,
            issues_created=0,
            issues_autoresolved=0,
        )


def _load_game_config(conn) -> tuple[str, dict[str, SetConfig], dict[str, str]]:
    games = table("core", "games")
    set_types = table("core", "game_number_set_types")
    game_id = conn.execute(select(games.c.id).where(games.c.code == GAME_CODE)).scalar_one()
    configs: dict[str, SetConfig] = {}
    id_to_code: dict[str, str] = {}
    for row in conn.execute(
        select(set_types.c.id, set_types.c.code, set_types.c.numbers_count,
               set_types.c.number_min, set_types.c.number_max)
        .where(set_types.c.game_id == game_id)
    ):
        configs[row.code] = SetConfig(row.numbers_count, row.number_min, row.number_max)
        id_to_code[str(row.id)] = row.code
    return game_id, configs, id_to_code


def _scope_filter(scope: str, draws_t):
    if scope == "pending":
        return (draws_t.c.status != "VALID") & (draws_t.c.validated_by.is_(None))
    if scope == "all":
        return draws_t.c.validated_by.is_(None)
    if scope.startswith("run:"):
        return (draws_t.c.ingestion_run_id == scope[4:]) & (draws_t.c.validated_by.is_(None))
    if scope.startswith("draw:"):
        return (draws_t.c.id == scope[5:]) & (draws_t.c.validated_by.is_(None))
    raise ValueError(f"Scope inconnu : {scope}")


def run_quality(scope: str, triggered_by: str = "manual") -> dict:
    runlog = RunLogger(QUALITY_SOURCE, triggered_by)
    stats = QualityStats()
    try:
        _run(scope, runlog, stats)
        runlog.finish("SUCCESS", dict(stats))
        return {"run_id": str(runlog.run_id), "status": "SUCCESS", "stats": dict(stats)}
    except Exception as exc:  # noqa: BLE001
        log.error("quality_run_failed", scope=scope, error=str(exc))
        runlog.finish("FAILED", dict(stats), error=str(exc))
        raise


def _run(scope: str, runlog: RunLogger, stats: QualityStats) -> None:
    engine = get_engine()
    draws_t = table("core", "draws")
    sets_t = table("core", "draw_number_sets")
    types_t = table("core", "draw_types")
    issues_t = table("ops", "data_quality_issues")
    today = dt.date.today()

    with engine.connect() as conn:
        _game_id, set_configs, id_to_code = _load_game_config(conn)
        draw_rows = conn.execute(
            select(draws_t.c.id, draws_t.c.draw_date, draws_t.c.status,
                   draws_t.c.draw_type_id)
            .where(_scope_filter(scope, draws_t))
            .order_by(draws_t.c.draw_date)
        ).all()
        schedule_by_type = {
            str(r.id): list(r.days_of_week or [])
            for r in conn.execute(select(types_t.c.id, types_t.c.days_of_week))
        }

    runlog.event("INFO", f"Contrôle qualité : {len(draw_rows)} tirages (scope={scope})")

    for start in range(0, len(draw_rows), BATCH_SIZE):
        batch = draw_rows[start : start + BATCH_SIZE]
        ids = [r.id for r in batch]
        with engine.begin() as conn:
            # Ensembles et issues ouvertes du lot, en 2 requêtes.
            sets_by_draw: dict[str, dict[str, list[int]]] = {}
            for row in conn.execute(
                select(sets_t.c.draw_id, sets_t.c.set_type_id, sets_t.c.numbers)
                .where(sets_t.c.draw_id.in_(ids))
            ):
                code = id_to_code.get(str(row.set_type_id))
                if code:
                    sets_by_draw.setdefault(str(row.draw_id), {})[code] = list(row.numbers)

            open_issues: dict[str, list[tuple[str, str, object]]] = {}
            all_rules_by_draw: dict[str, set[str]] = {}
            for row in conn.execute(
                select(issues_t.c.draw_id, issues_t.c.rule_code, issues_t.c.severity,
                       issues_t.c.id, issues_t.c.resolved_at)
                .where(issues_t.c.draw_id.in_(ids))
            ):
                did = str(row.draw_id)
                all_rules_by_draw.setdefault(did, set()).add(row.rule_code)
                if row.resolved_at is None:
                    open_issues.setdefault(did, []).append(
                        (row.rule_code, row.severity, row.id)
                    )

            to_status: dict[str, list[str]] = {"VALID": [], "INVALID": [], "PENDING_REVIEW": []}

            for r in batch:
                draw_id = str(r.id)
                existing = open_issues.get(draw_id, [])
                existing_rules = {rule for rule, _, _ in existing}
                known_rules = all_rules_by_draw.get(draw_id, set())
                ctx = DrawContext(
                    draw_id=draw_id,
                    draw_date=r.draw_date,
                    today=today,
                    sets=sets_by_draw.get(draw_id, {}),
                    set_configs=set_configs,
                    schedule_days=schedule_by_type.get(str(r.draw_type_id)),
                    unresolved_rules=existing_rules,
                )
                found = evaluate(ctx)
                stats["checked"] += 1

                for issue in found:
                    if issue.rule_code in known_rules and issue.rule_code not in existing_rules:
                        # Issue déjà connue et résolue (auto ou manuellement) :
                        # ne jamais la recréer — la résolution vaut acceptation.
                        continue
                    if issue.rule_code in existing_rules:
                        if issue.auto_resolved:
                            # Une issue ouverte (ex. MISSING_SET récent devenu
                            # ancien) passe en résolue automatiquement.
                            for rule, _sev, issue_id in existing:
                                if rule == issue.rule_code:
                                    conn.execute(
                                        update(issues_t)
                                        .where(issues_t.c.id == issue_id)
                                        .values(resolved_at=dt.datetime.now(dt.UTC))
                                    )
                            existing = [e for e in existing if e[0] != issue.rule_code]
                            existing_rules.discard(issue.rule_code)
                            stats["issues_autoresolved"] += 1
                        continue
                    resolved_at = dt.datetime.now(dt.UTC) if issue.auto_resolved else None
                    details = dict(issue.details)
                    if issue.resolution_note:
                        details["resolution_note"] = issue.resolution_note
                    conn.execute(
                        insert(issues_t).values(
                            draw_id=draw_id,
                            run_id=runlog.run_id,
                            rule_code=issue.rule_code,
                            severity=issue.severity,
                            details=details,
                            resolved_at=resolved_at,
                        )
                    )
                    stats["issues_created"] += 1
                    if issue.auto_resolved:
                        stats["issues_autoresolved"] += 1
                    else:
                        existing.append((issue.rule_code, issue.severity, None))
                        existing_rules.add(issue.rule_code)
                    known_rules.add(issue.rule_code)

                new_status = compute_status([(rule, sev) for rule, sev, _ in existing])
                if new_status != r.status:
                    to_status[new_status].append(draw_id)
                else:
                    stats["unchanged"] += 1

            now = dt.datetime.now(dt.UTC)
            if to_status["VALID"]:
                conn.execute(
                    update(draws_t)
                    .where(draws_t.c.id.in_(to_status["VALID"]))
                    .values(status="VALID", validated_at=now)
                )
                stats["validated"] += len(to_status["VALID"])
            if to_status["INVALID"]:
                conn.execute(
                    update(draws_t)
                    .where(draws_t.c.id.in_(to_status["INVALID"]))
                    .values(status="INVALID")
                )
                stats["invalidated"] += len(to_status["INVALID"])
            if to_status["PENDING_REVIEW"]:
                conn.execute(
                    update(draws_t)
                    .where(draws_t.c.id.in_(to_status["PENDING_REVIEW"]))
                    .values(status="PENDING_REVIEW", validated_at=None)
                )
                stats["pending"] += len(to_status["PENDING_REVIEW"])
