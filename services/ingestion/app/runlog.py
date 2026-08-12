"""Journalisation des opérations d'ingestion : ops.ingestion_runs + events.

Chaque import/collecte crée un run ; chaque étape notable un événement.
Exigence du cahier des charges : toute opération d'importation est journalisée.
"""

from __future__ import annotations

import datetime as dt

from sqlalchemy import insert, select, update

from app.core.db import get_engine, table


class RunLogger:
    def __init__(self, source_code: str, triggered_by: str, file_name: str | None = None):
        self.source_code = source_code
        sources = table("ops", "data_sources")
        runs = table("ops", "ingestion_runs")
        with get_engine().begin() as conn:
            source_id = conn.execute(
                select(sources.c.id).where(sources.c.code == source_code)
            ).scalar_one()
            self.run_id = conn.execute(
                insert(runs)
                .values(
                    source_id=source_id,
                    triggered_by=triggered_by,
                    file_name=file_name,
                    status="RUNNING",
                    stats={},
                )
                .returning(runs.c.id)
            ).scalar_one()
        self.source_id = source_id

    def event(self, level: str, message: str, context: dict | None = None) -> None:
        events = table("ops", "ingestion_events")
        with get_engine().begin() as conn:
            conn.execute(
                insert(events).values(
                    run_id=self.run_id,
                    level=level,
                    message=message[:2000],
                    context=context or {},
                )
            )

    def finish(self, status: str, stats: dict, error: str | None = None) -> None:
        runs = table("ops", "ingestion_runs")
        with get_engine().begin() as conn:
            conn.execute(
                update(runs)
                .where(runs.c.id == self.run_id)
                .values(
                    status=status,
                    stats=stats,
                    error=error,
                    finished_at=dt.datetime.now(dt.UTC),
                )
            )
