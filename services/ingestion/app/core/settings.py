"""Configuration du service ingestion — lue depuis l'environnement."""

from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str
    # Token interne partagé avec l'API Node (même mécanique que le service ML).
    ingestion_service_token: str = Field(
        validation_alias=AliasChoices("INGESTION_SERVICE_TOKEN", "ML_SERVICE_TOKEN")
    )
    ingestion_port: int = 8001

    # Source lotobonheur.ci — collecte respectueuse : robots.txt permissif
    # vérifié, User-Agent identifiable, délai entre requêtes en backfill.
    lonaci_api_base: str = "https://lotobonheur.ci"
    collect_user_agent: str = "LotoStatsBot/0.1 (analyse statistique; contact@quantech.solutions)"
    backfill_delay_seconds: float = 2.0

    @property
    def sqlalchemy_url(self) -> str:
        return self.database_url.replace("postgresql://", "postgresql+psycopg://", 1)


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
