from __future__ import annotations

from functools import lru_cache
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = 'CodeSense AI'
    database_url: str
    jwt_secret: str
    jwt_algorithm: str = 'HS256'
    upload_dir: str = 'uploads'
    ollama_base_url: str = 'http://localhost:11434'
    ollama_model: str = 'qwen2.5-coder:1.5b'
    db_pool_size: int = 5
    db_max_overflow: int = 10
    db_pool_timeout: int = 30
    db_pool_recycle: int = 1800

    model_config = SettingsConfigDict(env_file=('.env', '../.env'), env_file_encoding='utf-8', extra='ignore')

    @field_validator('database_url')
    @classmethod
    def validate_database_url(cls, value: str) -> str:
        normalized_value = value.strip()
        if normalized_value.startswith('sqlite:///'):
            return normalized_value
        if normalized_value.startswith('postgresql://'):
            return normalized_value.replace('postgresql://', 'postgresql+psycopg://', 1)
        if normalized_value.startswith('postgresql+psycopg://'):
            return normalized_value
        raise ValueError('DATABASE_URL must use either sqlite:///path.db or PostgreSQL psycopg format postgresql+psycopg://user:password@host:5432/dbname')


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
