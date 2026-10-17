## Project rules

- Domain types, mock data and the API abstraction live under `src/lib/protein/`; UI never defines its own data shapes, so swapping the mock client for the real backend touches one folder.
- All data access goes through the `ProtEvaApi` interface (`MockApiClient` in demo mode, `HttpApiClient` when `VITE_API_BASE_URL` is set). Failed real requests must surface as errors, never fall back to mock data.
- Demonstration values must be labelled as simulated everywhere they appear; the UI must never present them as real BioEmu sampling, Gemma execution or scientific validation.
- Colors come from the semantic tokens in `src/styles.css`; no hardcoded color utilities in components.

- The public editorial experience lives at `/`, while `/overview` and all research routes share AppShell; this separates discovery from the dense scientific workbench without duplicating research logic.
- MolecularCanvas is parametric conceptual artwork, not a protein prediction; actual candidate structures remain unavailable until genuine sampling artifacts exist.
