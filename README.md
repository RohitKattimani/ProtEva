# ProtEva

ProtEva is an AI-assisted protein research workbench. It combines a React/TanStack frontend with a FastAPI backend to run real genetic-algorithm candidate generation, genuine batched ProteinMPNN scoring, Gemma 4 multi-agent orchestration, deterministic scientific reporting, report recovery, and a Design-to-Procurement workflow.

## Run locally

Backend:

```powershell
cd backend
.venv\Scripts\python.exe -m uvicorn proteva_api.main:app --host 127.0.0.1 --port 8015
```

Frontend (live mode):

```powershell
cd .
$env:VITE_API_BASE_URL="http://127.0.0.1:8015/api/v1"
bun run dev
```

Demo mode (no backend):

```powershell
cd .
bun run dev
```

## Verification

```powershell
cd backend
.venv\Scripts\python.exe -m pytest -q

cd ..
bun run test
bun run build
```

## Features

- Demo and live modes, explicitly separated.
- Real live scientific workflow: GA candidates, ProteinMPNN target/off-target scoring, finalist sensitivity analysis, auditor warnings, deterministic evidence report, Gemma narrative.
- Report-only recovery without rerunning GA or ProteinMPNN work.
- Design-to-Procurement: candidate-tied supplier search, compatibility evidence, review, approval, and external checkout boundary.
- Artifact downloads with checksums.

## Important scientific boundaries

- `target_preference = off_target_mean_nll - target_mean_nll` is a ProteinMPNN backbone-compatibility proxy only.
- It does not establish biological function, stability, affinity, free energy, or conformational occupancy.
- 1AKE is AP5A-bound; the 4AKE/1AKE comparison is not an apo equilibrium measurement.
- Demo results are simulated and are labeled as such.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Public editorial landing page |
| `/overview` | Experiment summary and charts |
| `/experiments` | Browse experiments |
| `/experiments/new` | Experiment wizard |
| `/experiments/:experimentId` | Status, candidates, events, artifacts, reports, procurement |
| `/candidates` | Candidate library |
| `/agents` | Agent activity |
| `/documentation` | Pipeline and limitations |
| `/settings` | Workspace preferences |

## Backend API

The backend lives in `backend/`. It uses SQLite for local persistence and exposes versioned endpoints under `/api/v1`. Server-only secrets such as `PROTEVA_GOOGLE_API_KEY` are never exposed to the browser.

## Tests

Backend: 33 passed. Frontend: 2 files, 12 tests passed. Build: passed.
