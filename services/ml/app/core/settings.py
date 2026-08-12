"""Configuration du service ML — lue depuis l'environnement.

En dev, le .env vit à la racine du monorepo ; en CI/prod les variables
sont injectées directement.
"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str
    ml_service_token: str
    ml_port: int = 8000

    @property
    def sqlalchemy_url(self) -> str:
        """URL SQLAlchemy avec le driver psycopg 3 explicite."""
        return self.database_url.replace("postgresql://", "postgresql+psycopg://", 1)


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
