"""Shared lifecycle helper for SQLAlchemy repository adapters.

Adapters may retain a standalone convenience session during the compatibility
period. When a UoW binds a session, these methods never commit or close it.
"""

from contextlib import contextmanager


class SqlAlchemyRepository:
    def __init__(self, database, *, session=None):
        self.database = database
        self._bound_session = session

    @contextmanager
    def session_scope(self, *, write: bool = False):
        if self._bound_session is not None:
            yield self._bound_session
            return
        if write:
            raise RuntimeError(
                "Repository writes must be performed inside a UnitOfWork"
            )
        with self.database.session() as session:
            yield session
