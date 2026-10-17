<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules

- Domain types, mock data and the API abstraction live under `src/lib/protein/`; UI never defines its own data shapes, so swapping the mock client for the real backend touches one folder.
- All data access goes through the `ProtEvaApi` interface (`MockApiClient` in demo mode, `HttpApiClient` when `VITE_API_BASE_URL` is set). Failed real requests must surface as errors, never fall back to mock data.
- Demonstration values must be labelled as simulated everywhere they appear; the UI must never present them as real BioEmu sampling, Gemma execution or scientific validation.
- Colors come from the semantic tokens in `src/styles.css`; no hardcoded color utilities in components.

- The public editorial experience lives at `/`, while `/overview` and all research routes share AppShell; this separates discovery from the dense scientific workbench without duplicating research logic.
- MolecularCanvas is parametric conceptual artwork, not a protein prediction; actual candidate structures remain unavailable until genuine sampling artifacts exist.
