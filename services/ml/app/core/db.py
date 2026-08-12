"""Accès base de données par réflexion SQLAlchemy — AUCUN DDL ici :
le schéma appartient exclusivement aux migrations Prisma (services/api)."""

from functools import lru_cache

from sqlalchemy import Engine, MetaData, Table, create_engine, text

from app.core.settings import get_settings

# Tables utilisées par le service ML, par schéma PostgreSQL.
_TABLES = {
    "core": ["games", "game_number_set_types", "draw_types", "draws", "draw_number_sets"],
    "analytics": ["analysis_windows", "number_stats", "pair_stats", "draw_shape_stats"],
    "ops": ["data_sources", "ingestion_runs", "ingestion_events"],
}


@lru_cache
def get_engine() -> Engine:
    return create_engine(
        get_settings().sqlalchemy_url,
        pool_pre_ping=True,
        pool_size=5,
        connect_args={"connect_timeout": 5},
    )


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
    """Ping court de la base — utilisé par le health check."""
    try:
        with get_engine().connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
