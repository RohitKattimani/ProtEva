# ProtEva

ProtEva is a protein research workbench concept for exploring sequence variants against a user-defined conformational objective. The frontend brings experiment setup, candidate review, agent activity, visual summaries, and reproducibility-oriented exports into one interface.

> **Current state:** this repository contains a frontend and an in-memory simulated demo. It does not currently run Gemma, a genetic algorithm, BioEmu, scientific evaluation, or a backend. Demo scores, metrics, candidates, and agent events are illustrative and must not be treated as scientific results.

## Run locally

The project uses Bun and the checked-in `bun.lock` lockfile. Install Bun, then from the project directory run:

```sh
bun install --frozen-lockfile
bun run dev
```

Vite prints the local development URL when the server starts. The package does not currently declare a Node or Bun version in `package.json`; use a current supported Node.js release with Bun.

Available scripts:

```sh
bun run dev       # Start the development server
bun run build     # Create a production build
bun run preview   # Preview the production build
bun run lint      # Run ESLint
bun run test      # Run the Vitest suite once
bun run test:watch
```

The `format` script runs Prettier with `--write` across the project; review its scope before using it.

## Application

The public landing page is `/`. The research workbench is available at `/overview`, with the following routes:

| Route | Purpose |
| --- | --- |
| `/overview` | Experiment summary, progress charts, recent activity, and warnings |
| `/experiments` | Browse and filter experiments |
| `/experiments/new` | Four-step sequence, target, and search-configuration wizard |
| `/experiments/:experimentId` | Experiment status, candidate results, event timeline, charts, artifacts, and exports |
| `/candidates` | Search and filter the candidate library |
| `/agents` | Inspect agent roles and the selected experiment's event timeline |
| `/documentation` | In-app pipeline description and limitations |
| `/settings` | Backend URL and workspace preferences |

### Demo and data flow

Domain types, mock data, the API interface, and React Query hooks live in `src/lib/protein/`. The `ProtEvaApi` interface has two implementations:

- `MockApiClient` is selected by default. It creates in-memory demo experiments and advances them through simulated states. Candidate sequences, scores, metrics, and agent events come from deterministic illustrative builders. Demo state is not persistent.
- `HttpApiClient` is selected when `VITE_API_BASE_URL` is set. It calls the API paths in `src/lib/protein/api.ts`. No matching backend implementation is included in this repository. A configured HTTP failure is surfaced as an error; it is not replaced with mock data.

To configure a backend URL for local development, set `VITE_API_BASE_URL` in an ignored local environment file, for example:

```dotenv
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

This value is bundled into browser code and must be a non-secret URL. Do not put API keys, tokens, or other credentials in `VITE_*` variables. `.env` and `.env.*` are ignored; `.env.example` is allowed for safe templates.

The wizard can read a FASTA sequence locally. The optional PDB picker currently retains only the filename; it does not upload the file. Artifact metadata and several downloads are currently assembled in the frontend. These are demo behaviors, not secure backend upload or artifact-storage implementations.

## Architecture and development notes

- `src/routes/` contains the TanStack file-based routes; `src/routeTree.gen.ts` is generated and should not be edited manually.
- `src/components/app/` contains the application shell, landing page, charts, status badges, and conceptual molecular canvas.
- `src/components/agents/AgentViews.tsx` renders the agent roster and event timeline. Current roles and events are mock data, not autonomous model agents.
- `src/components/candidates/CandidateDrawer.tsx` shows candidate sequence details and illustrative metrics. Real structure artifacts are not available.
- `src/lib/protein/types.ts` defines the frontend domain model and `ProtEvaApi` boundary. The current `Experiment` type is demo-specific; see the proposed provenance model before integrating live results.
- `src/start.ts`, `src/server.ts`, and `src/router.tsx` configure TanStack Start middleware, the server entry, and router/query initialization.

## Scientific integrity

All demo results are simulated. No Gemma call, BioEmu sampling, genetic-algorithm evolution, or scientific validation occurs in the current frontend. The molecular canvas is conceptual artwork, not a predicted protein structure. Computational predictions, when implemented, will not by themselves establish biological function, stability, safety, binding affinity, or thermodynamic equilibrium. Relevant claims require suitable evidence and validation.

## Tests

The current Vitest suite contains two route-matching tests for `/` and `/overview`. Wizard behavior, API failure handling, mock state transitions, exports, uploads, and scientific integration do not yet have automated coverage.
