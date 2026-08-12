"""Accès base de données par réflexion SQLAlchemy — AUCUN DDL ici :
le schéma appartient exclusivement aux migrations Prisma (services/api).

La réflexion garantit que le service reste conforme au schéma réel ;
si une table/colonne attendue disparaît, l'erreur est immédiate et claire.
"""

from functools import lru_cache

from sqlalchemy import Engine, MetaData, Table, create_engine, text

from app.core.settings import get_settings

# Tables utilisées par l'ingestion, par schéma PostgreSQL.
_TABLES = {
    "core": ["games", "game_number_set_types", "draw_types", "draws", "draw_number_sets"],
    "ops": ["data_sources", "ingestion_runs", "ingestion_events", "data_quality_issues"],
}


@lru_cache
def get_engine() -> Engine:
    return create_engine(get_settings().sqlalchemy_url, pool_pre_ping=True, pool_size=5)


@lru_cache
def get_metadata() -> MetaData:
    md = MetaData()
    engine = get_engine()
    for schema, tables in _TABLES.items():
        md.reflect(bind=engine, schema=schema, only=tables)
    return md


def table(schema: str, name: str) -> Table:
    return get_metadata().tables[f"{schema}.{name}"]


def db_is_up() -> bool:
    try:
        with get_engine().connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
