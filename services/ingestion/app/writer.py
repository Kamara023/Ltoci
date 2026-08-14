"""Écriture commune des tirages — utilisée par le collecteur ET les importeurs.

Sémantique d'upsert sur la clé naturelle (game, draw_type, draw_date) :
- tirage inconnu                → insertion (statut PENDING_REVIEW) ;
- identique à l'existant        → no-op compté en `duplicates` (idempotence) ;
- ensemble machine manquant complété → `updated` ;
- même ENSEMBLE mais ordre stocké ≠ ordre publié → restauration de l'ordre,
  compté en `reordered` (l'ordre de sortie des boules est une information
  métier — PHASE 11) ;
- numéros DIFFÉRENTS de l'existant (en tant qu'ENSEMBLE) →
  data_quality_issues(SOURCE_CONFLICT), statut repassé à PENDING_REVIEW,
  données existantes CONSERVÉES.

L'ORDRE PUBLIÉ par la source est préservé tel quel dans
draw_number_sets.numbers ; toutes les COMPARAISONS restent ensemblistes.
Les types de tirage inconnus sont créés automatiquement (référentiel piloté
par les données réelles de la source, cf. décision PHASE 2).
Le trigger SQL core.check_draw_number_set garantit cardinalité/bornes/unicité
(sans tri depuis la migration preserve_draw_order).
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field

import structlog
from sqlalchemy import insert, select, update
from sqlalchemy.engine import Connection

from app.core.db import get_engine, table
from app.parsers.lonaci_api import ParsedDraw
from app.runlog import RunLogger

log = structlog.get_logger()

GAME_CODE = "loto-bonheur"


@dataclass
class WriteStats:
    found: int = 0
    inserted: int = 0
    updated: int = 0
    duplicates: int = 0
    conflicts: int = 0
    invalid: int = 0
    # Même ensemble, ordre stocké corrigé vers l'ordre publié. Hors `updated`
    # exprès : un pur ré-ordonnancement ne doit pas déclencher la chaîne
    # stats/ML (les statistiques sont insensibles à l'ordre).
    reordered: int = 0
    created_draw_types: list[str] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "found": self.found,
            "inserted": self.inserted,
            "updated": self.updated,
            "duplicates": self.duplicates,
            "conflicts": self.conflicts,
            "invalid": self.invalid,
            "reordered": self.reordered,
            "created_draw_types": self.created_draw_types,
        }


class DrawWriter:
    def __init__(self, runlog: RunLogger):
        self.runlog = runlog
        self._game_id: str | None = None
        self._set_type_ids: dict[str, str] = {}
        self._draw_type_ids: dict[str, str] = {}

    # ---------- référentiel ----------

    def _load_refs(self, conn: Connection) -> None:
        games = table("core", "games")
        set_types = table("core", "game_number_set_types")
        draw_types = table("core", "draw_types")
        self._game_id = conn.execute(
            select(games.c.id).where(games.c.code == GAME_CODE)
        ).scalar_one()
        for row in conn.execute(
            select(set_types.c.code, set_types.c.id).where(set_types.c.game_id == self._game_id)
        ):
            self._set_type_ids[row.code] = row.id
        for row in conn.execute(
            select(draw_types.c.code, draw_types.c.id).where(draw_types.c.game_id == self._game_id)
        ):
            self._draw_type_ids[row.code] = row.id

    def _draw_type_id(self, conn: Connection, parsed: ParsedDraw, stats: WriteStats) -> str:
        existing = self._draw_type_ids.get(parsed.draw_code)
        if existing:
            return existing
        draw_types = table("core", "draw_types")
        new_id = conn.execute(
            insert(draw_types)
            .values(
                game_id=self._game_id,
                code=parsed.draw_code,
                name=parsed.draw_name,
                days_of_week=[],
                metadata={"source": self.runlog.source_code, "category": parsed.category},
            )
            .returning(draw_types.c.id)
        ).scalar_one()
        self._draw_type_ids[parsed.draw_code] = new_id
        stats.created_draw_types.append(parsed.draw_code)
        self.runlog.event(
            "INFO",
            f"Type de tirage créé automatiquement : {parsed.draw_name}",
            {"code": parsed.draw_code, "category": parsed.category},
        )
        return new_id

    # ---------- écriture ----------

    def write(self, draws: list[ParsedDraw], triggered_by: str = "manual") -> WriteStats:
        stats = WriteStats(found=len(draws))
        engine = get_engine()
        # Référentiel + création des types de tirage inconnus dans une
        # transaction COMMITTÉE À PART : un tirage invalide rollbacké ensuite
        # ne doit pas emporter le type de tirage dont dépendent les suivants.
        with engine.begin() as conn:
            self._load_refs(conn)
            for parsed in draws:
                self._draw_type_id(conn, parsed, stats)
        for parsed in draws:
            try:
                with engine.begin() as conn:
                    self._write_one(conn, parsed, stats)
            except Exception as exc:  # noqa: BLE001 — un tirage invalide ne bloque pas le lot
                stats.invalid += 1
                self.runlog.event(
                    "ERROR",
                    f"Tirage rejeté {parsed.draw_date} {parsed.draw_code}: {exc}",
                    {"draw": parsed.raw},
                )
        return stats

    def _write_one(self, conn: Connection, parsed: ParsedDraw, stats: WriteStats) -> None:
        draws_t = table("core", "draws")
        sets_t = table("core", "draw_number_sets")
        draw_type_id = self._draw_type_ids[parsed.draw_code]

        existing = conn.execute(
            select(draws_t.c.id, draws_t.c.status).where(
                (draws_t.c.game_id == self._game_id)
                & (draws_t.c.draw_type_id == draw_type_id)
                & (draws_t.c.draw_date == parsed.draw_date)
            )
        ).first()

        # ORDRE PUBLIÉ préservé tel quel — les comparaisons plus bas sont
        # ensemblistes (tri au moment de comparer, jamais au stockage).
        wanted: dict[str, list[int]] = {}
        if parsed.winning is not None:
            wanted["WINNING"] = list(parsed.winning)
        if parsed.machine is not None:
            wanted["MACHINE"] = list(parsed.machine)

        if existing is None:
            draw_id = conn.execute(
                insert(draws_t)
                .values(
                    game_id=self._game_id,
                    draw_type_id=draw_type_id,
                    draw_date=parsed.draw_date,
                    status="PENDING_REVIEW",
                    source_id=self.runlog.source_id,
                    ingestion_run_id=self.runlog.run_id,
                    collected_at=dt.datetime.now(dt.UTC),
                    metadata={"raw": parsed.raw, "category": parsed.category},
                )
                .returning(draws_t.c.id)
            ).scalar_one()
            for set_code, numbers in wanted.items():
                conn.execute(
                    insert(sets_t).values(
                        draw_id=draw_id,
                        set_type_id=self._set_type_ids[set_code],
                        numbers=numbers,
                    )
                )
            stats.inserted += 1
            return

        # Tirage déjà présent : comparaison ENSEMBLISTE, ensemble par ensemble.
        set_types = table("core", "game_number_set_types")
        rows = conn.execute(
            select(sets_t.c.id, set_types.c.code, sets_t.c.numbers)
            .select_from(sets_t.join(set_types, sets_t.c.set_type_id == set_types.c.id))
            .where(sets_t.c.draw_id == existing.id)
        ).all()
        current = {row.code: list(row.numbers) for row in rows}
        current_ids = {row.code: row.id for row in rows}

        conflict = False
        added = False
        reordered = False
        for set_code, numbers in wanted.items():
            if set_code not in current:
                conn.execute(
                    insert(sets_t).values(
                        draw_id=existing.id,
                        set_type_id=self._set_type_ids[set_code],
                        numbers=numbers,
                    )
                )
                added = True
            elif sorted(current[set_code]) != sorted(numbers):
                conflict = True
            elif current[set_code] != numbers:
                # Même ensemble, ordre différent : la source fait foi —
                # restauration de l'ordre de sortie publié.
                conn.execute(
                    update(sets_t)
                    .where(sets_t.c.id == current_ids[set_code])
                    .values(numbers=numbers)
                )
                reordered = True

        if conflict:
            issues = table("ops", "data_quality_issues")
            conn.execute(
                insert(issues).values(
                    draw_id=existing.id,
                    run_id=self.runlog.run_id,
                    rule_code="SOURCE_CONFLICT",
                    severity="WARNING",
                    details={
                        "existing": current,
                        "incoming": wanted,
                        "draw_date": str(parsed.draw_date),
                        "draw_code": parsed.draw_code,
                    },
                )
            )
            conn.execute(
                update(draws_t)
                .where(draws_t.c.id == existing.id)
                .values(status="PENDING_REVIEW")
            )
            stats.conflicts += 1
            self.runlog.event(
                "WARN",
                f"SOURCE_CONFLICT {parsed.draw_date} {parsed.draw_code} — existant conservé",
                {"existing": current, "incoming": {k: list(v) for k, v in wanted.items()}},
            )
        elif added:
            stats.updated += 1
        elif reordered:
            stats.reordered += 1
        else:
            stats.duplicates += 1
