# ProtEva API foundation

This FastAPI application is an early persistence/API foundation. It does not run a genetic algorithm, model, agent, sampler, evaluator, or scientific worker.

## Requirements and local run

Python 3.9 or newer and [uv](https://docs.astral.sh/uv/) are required. From `backend/`:

```powershell
uv sync --locked --extra dev
Copy-Item .env.example .env
uv run uvicorn proteva_api.main:app --app-dir src --reload
```

The API listens on `http://127.0.0.1:8000`; interactive schema docs are at `/docs`. `PROTEVA_DATABASE_PATH` controls the local SQLite file. The default is `./proteva-dev.sqlite3` relative to the process working directory.

Run tests with:

```powershell
uv run pytest
```

The tests exercise route logic and persistence directly. They do not claim a deployed HTTP integration or scientific execution test.

## Implemented behavior

- `GET /api/v1/health` reports process health.
- `GET /api/v1/ready` checks that the configured SQLite repository can be queried.
- `POST /api/v1/experiments` validates and persists a `demo` request as a `draft`; no candidates, metrics, events, or execution are produced.
- `GET /api/v1/experiments` and `GET /api/v1/experiments/{id}` read persisted drafts.
- `live` creation returns HTTP 501 with error code `LIVE_EXECUTION_UNAVAILABLE`, before persistence.
- Schema failures use HTTP 422 with `REQUEST_VALIDATION_FAILED`; other HTTP errors use a structured error envelope.

Candidate, event, evidence/provenance, and status models establish vocabulary only. Their read, event, execution, cancellation, export, and artifact endpoints are not implemented.

## Security boundary

This service is for local development and is not ready for public exposure. Before exposure, add authenticated user identity and per-record authorization, HTTPS and a deliberate CORS allowlist, request/rate/resource limits, secure database and backup handling, secret management, audit logging, and privacy/retention rules for submitted sequences and structures. Do not put credentials in `VITE_*` variables. SQLite is a local adapter, not a multi-user authorization boundary.
