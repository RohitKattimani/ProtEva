from __future__ import annotations

from contextlib import contextmanager
import sqlite3
from typing import Iterator, Optional, Protocol

from .schemas import AgentEvent, Candidate, Experiment, ProcurementRequest


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
            connection.execute("CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, experiment_id TEXT NOT NULL, timestamp TEXT NOT NULL, body TEXT NOT NULL)")
            connection.execute("CREATE TABLE IF NOT EXISTS candidates (id TEXT PRIMARY KEY, experiment_id TEXT NOT NULL, body TEXT NOT NULL)")
            connection.execute("CREATE TABLE IF NOT EXISTS artifacts (id TEXT PRIMARY KEY, experiment_id TEXT NOT NULL, body TEXT NOT NULL)")
            connection.execute("CREATE TABLE IF NOT EXISTS reporting_attempts (id TEXT PRIMARY KEY, experiment_id TEXT NOT NULL, status TEXT NOT NULL, body TEXT NOT NULL)")
            connection.execute("CREATE TABLE IF NOT EXISTS procurement_requests (id TEXT PRIMARY KEY, experiment_id TEXT NOT NULL, candidate_id TEXT NOT NULL, created_at TEXT NOT NULL, body TEXT NOT NULL)")
            connection.execute("CREATE UNIQUE INDEX IF NOT EXISTS one_running_report_per_experiment ON reporting_attempts(experiment_id) WHERE status = 'running'")

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

    def replace(self, experiment: Experiment) -> None:
        with self._connect() as connection:
            connection.execute("UPDATE experiments SET body = ? WHERE id = ?", (experiment.model_dump_json(by_alias=True), experiment.id))

    def list(self) -> list[Experiment]:
        with self._connect() as connection:
            rows = connection.execute("SELECT body FROM experiments ORDER BY created_at DESC").fetchall()
        return [Experiment.model_validate_json(row["body"]) for row in rows]

    def add_event(self, event: AgentEvent) -> None:
        with self._connect() as connection:
            connection.execute("INSERT INTO events(id, experiment_id, timestamp, body) VALUES (?, ?, ?, ?)", (event.id, event.experiment_id, event.timestamp.isoformat(), event.model_dump_json(by_alias=True)))

    def events(self, experiment_id: str) -> list[AgentEvent]:
        with self._connect() as connection:
            rows = connection.execute("SELECT body FROM events WHERE experiment_id = ? ORDER BY timestamp", (experiment_id,)).fetchall()
        return [AgentEvent.model_validate_json(row["body"]) for row in rows]

    def add_candidates(self, candidates: list[Candidate]) -> None:
        with self._connect() as connection:
            for candidate in candidates:
                connection.execute("INSERT OR REPLACE INTO candidates(id, experiment_id, body) VALUES (?, ?, ?)", (candidate.id, candidate.experiment_id, candidate.model_dump_json(by_alias=True)))

    def candidates(self, experiment_id: str) -> list[Candidate]:
        with self._connect() as connection:
            rows = connection.execute("SELECT body FROM candidates WHERE experiment_id = ? ORDER BY id", (experiment_id,)).fetchall()
        return [Candidate.model_validate_json(row["body"]) for row in rows]

    def candidate(self, experiment_id: str, candidate_id: str) -> Optional[Candidate]:
        with self._connect() as connection:
            row = connection.execute("SELECT body FROM candidates WHERE experiment_id = ? AND id = ?", (experiment_id, candidate_id)).fetchone()
        return Candidate.model_validate_json(row["body"]) if row else None

    def add_artifact(self, experiment_id: str, artifact_id: str, body: dict) -> None:
        import json
        with self._connect() as connection:
            connection.execute("INSERT OR REPLACE INTO artifacts(id, experiment_id, body) VALUES (?, ?, ?)", (artifact_id, experiment_id, json.dumps(body)))

    def artifacts(self, experiment_id: str) -> list[dict]:
        import json
        with self._connect() as connection:
            rows = connection.execute("SELECT body FROM artifacts WHERE experiment_id = ? ORDER BY id", (experiment_id,)).fetchall()
        return [json.loads(row["body"]) for row in rows]

    def begin_reporting_attempt(self, experiment_id: str, attempt_id: str, body: dict) -> bool:
        import json
        try:
            with self._connect() as connection:
                active = connection.execute("SELECT 1 FROM reporting_attempts WHERE experiment_id = ? AND status = 'running'", (experiment_id,)).fetchone()
                if active:
                    return False
                connection.execute("INSERT INTO reporting_attempts(id, experiment_id, status, body) VALUES (?, ?, 'running', ?)", (attempt_id, experiment_id, json.dumps(body)))
            return True
        except sqlite3.IntegrityError:
            return False

    def finish_reporting_attempt(self, attempt_id: str, status: str, body: dict) -> None:
        import json
        with self._connect() as connection:
            connection.execute("UPDATE reporting_attempts SET status = ?, body = ? WHERE id = ?", (status, json.dumps(body), attempt_id))

    def reporting_attempts(self, experiment_id: str) -> list[dict]:
        import json
        with self._connect() as connection:
            rows = connection.execute("SELECT body FROM reporting_attempts WHERE experiment_id = ? ORDER BY id", (experiment_id,)).fetchall()
        return [json.loads(row["body"]) for row in rows]

    def add_procurement_request(self, request: ProcurementRequest) -> None:
        with self._connect() as connection:
            connection.execute("INSERT OR REPLACE INTO procurement_requests(id, experiment_id, candidate_id, created_at, body) VALUES (?, ?, ?, ?, ?)", (request.id, request.experiment_id, request.candidate_id, request.created_at.isoformat(), request.model_dump_json(by_alias=True)))

    def get_procurement_request(self, request_id: str) -> Optional[ProcurementRequest]:
        with self._connect() as connection:
            row = connection.execute("SELECT body FROM procurement_requests WHERE id = ?", (request_id,)).fetchone()
        return ProcurementRequest.model_validate_json(row["body"]) if row else None

    def list_procurement_requests(self, experiment_id: str) -> list[ProcurementRequest]:
        with self._connect() as connection:
            rows = connection.execute("SELECT body FROM procurement_requests WHERE experiment_id = ? ORDER BY created_at", (experiment_id,)).fetchall()
        return [ProcurementRequest.model_validate_json(row["body"]) for row in rows]

    def replace_procurement_request(self, request: ProcurementRequest) -> None:
        with self._connect() as connection:
            connection.execute("UPDATE procurement_requests SET body = ? WHERE id = ?", (request.model_dump_json(by_alias=True), request.id))
