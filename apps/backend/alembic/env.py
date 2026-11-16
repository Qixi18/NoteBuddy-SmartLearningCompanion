from logging.config import fileConfig
import os

from alembic import context
from app.config import settings
from app.infrastructure.database.base import Base
from app.infrastructure.database.engine import make_engine
from app.infrastructure.database import models  # noqa: F401

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)
database_url = (
    os.getenv("SMART_LEARNING_DATABASE_URL")
    or settings.database_url_override
    or config.get_main_option("sqlalchemy.url")
)
if database_url == "sqlite:///./data/smart_learning.db":
    database_url = settings.database_url
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = make_engine(database_url)
    with connectable.connect() as connection:
        if connection.dialect.name == "sqlite":
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
            connection.exec_driver_sql("PRAGMA busy_timeout=5000")
        context.configure(
            connection=connection, target_metadata=target_metadata, render_as_batch=True
        )
        with context.begin_transaction():
            context.run_migrations()
        connection.commit()
    connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
