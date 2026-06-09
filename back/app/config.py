from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    SECRET_KEY: str
    REFRESH_SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    POSTGRES_USER: str = "testing_user"
    POSTGRES_PASSWORD: str = ""
    POSTGRES_DB: str = "adaptive_testing"
    DATABASE_URL: str
    SYNC_DATABASE_URL: str

    REDIS_URL: str = "redis://redis:6379/0"

    CORS_ORIGINS: str = "http://localhost:80"

    IRT_MIN_RESPONSE_COUNT: int = 30

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    model_config = {"env_file": ".env"}


settings = Settings()
