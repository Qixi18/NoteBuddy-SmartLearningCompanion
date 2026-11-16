from contextlib import contextmanager

from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker

from .base import Base


class Database:
    def __init__(self, engine: Engine):
        self.engine = engine
        self._sessions = sessionmaker(engine, expire_on_commit=False)

    @contextmanager
    def session(self):
        with self._sessions() as session:
            yield session

    def create_schema_for_tests(self) -> None:
        Base.metadata.create_all(self.engine)
