from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PROTEVA_", env_file=".env", extra="ignore")

    env: str = "development"
    database_path: str = "./proteva-dev.sqlite3"

    @field_validator("env")
    @classmethod
    def validate_env(cls, value: str) -> str:
        if value not in {"development", "test", "production"}:
            raise ValueError("PROTEVA_ENV must be development, test, or production")
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
