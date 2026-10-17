from __future__ import annotations

from contextlib import contextmanager
import sqlite3
from typing import Iterator, Optional, Protocol

from .schemas import Experiment


class ExperimentRepository(Protocol):
    def add(self, experiment: Experiment) -> None: ...
    def get(self, experiment_id: str) -> Optional[Experiment]: ...
    def list(self) -> list[Experiment]: ...


class SQLiteExperimentRepository:
    """Local persistence adapter; the protocol allows a managed SQL adapter later."""

    def __init__(self, path: str):
        self.path = path
        with self._connect() as connection:
            connection.execute(
                "CREATE TABLE IF NOT EXISTS experiments (id TEXT PRIMARY KEY, created_at TEXT NOT NULL, body TEXT NOT NULL)"
            )

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path)
        connection.row_factory = sqlite3.Row
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def add(self, experiment: Experiment) -> None:
        body = experiment.model_dump_json(by_alias=True)
        with self._connect() as connection:
            connection.execute(
                "INSERT INTO experiments(id, created_at, body) VALUES (?, ?, ?)",
                (experiment.id, experiment.created_at.isoformat(), body),
            )

    def get(self, experiment_id: str) -> Optional[Experiment]:
        with self._connect() as connection:
            row = connection.execute("SELECT body FROM experiments WHERE id = ?", (experiment_id,)).fetchone()
        return Experiment.model_validate_json(row["body"]) if row else None

    def list(self) -> list[Experiment]:
        with self._connect() as connection:
            rows = connection.execute("SELECT body FROM experiments ORDER BY created_at DESC").fetchall()
        return [Experiment.model_validate_json(row["body"]) for row in rows]
