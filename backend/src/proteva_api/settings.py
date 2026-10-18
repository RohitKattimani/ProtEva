from __future__ import annotations

from functools import lru_cache
from typing import Optional

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PROTEVA_", env_file=".env", extra="ignore")

    env: str = "development"
    database_path: str = "./proteva-dev.sqlite3"
    google_api_key: Optional[str] = None
    cors_origins: str = ""
    gemma_model: str = "gemma-4-26b-a4b-it"
    gemma_fallback_model: Optional[str] = "gemma-4-31b-it"
    proteinmpnn_python: str = ""
    proteinmpnn_source: str = "../fast_screening/third_party/ProteinMPNN"
    proteinmpnn_artifacts: str = "../fast_screening/artifacts"
    prepared_structures: str = "../fast_screening/structures"

    @field_validator("env")
    @classmethod
    def validate_env(cls, value: str) -> str:
        if value not in {"development", "test", "production"}:
            raise ValueError("PROTEVA_ENV must be development, test, or production")
        return value

    def configured_cors_origins(self) -> list[str]:
        return [origin.strip().rstrip("/") for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
