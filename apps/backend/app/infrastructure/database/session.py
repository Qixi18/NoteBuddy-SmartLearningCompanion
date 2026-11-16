"""SQLAlchemy session lifecycle. Application code owns transaction boundaries."""

from contextlib import contextmanager

from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from .base import Base


class SessionFactory:
    def __init__(self, engine: Engine):
        self.engine = engine
        self._sessions = sessionmaker(engine, expire_on_commit=False)

    def __call__(self) -> Session:
        return self._sessions()

    @contextmanager
    def session(self):
        with self._sessions() as session:
            yield session

    def dispose(self) -> None:
        self.engine.dispose()


class Database(SessionFactory):
    """Compatibility name retained for existing adapters and services."""

    def create_schema_for_tests(self) -> None:
        Base.metadata.create_all(self.engine)
