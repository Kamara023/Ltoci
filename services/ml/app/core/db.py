"""Accès base de données (lecture/écriture SANS DDL — les migrations
appartiennent exclusivement à Prisma, côté services/api)."""

from functools import lru_cache

from sqlalchemy import Engine, create_engine, text

from app.core.settings import get_settings


@lru_cache
def get_engine() -> Engine:
    return create_engine(get_settings().sqlalchemy_url, pool_pre_ping=True, pool_size=5)


def db_is_up() -> bool:
    """Ping court de la base — utilisé par le health check."""
    try:
        with get_engine().connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
