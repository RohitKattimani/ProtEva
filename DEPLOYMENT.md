# Deploying ProtEva with Vercel and Render

This repository deploys the React/TanStack frontend to Vercel and the FastAPI
service to Render. The Google sign-in implementation uses Google Identity
Services: the browser receives a Google ID token and the backend verifies it
before issuing a short-lived ProtEva session token.

## 1. Create Google credentials

In Google Cloud Console, configure the OAuth consent screen and create an
**OAuth 2.0 Client ID** for a **Web application**. No OAuth client secret is
used by this implementation.

Add these authorized JavaScript origins:

- `http://localhost:3000` for local frontend development.
- The production Vercel origin, such as `https://proteva.vercel.app`.
- Your custom frontend domain, if you use one.

Keep the Google OAuth **client ID** available for both deployments. It is a
public identifier. Do not put a Gemini API key, OAuth client secret, or Render
secret in any `VITE_` variable.

## 2. Deploy the FastAPI service on Render

1. Push this repository to your own GitHub account.
2. In Render, choose **New > Blueprint** and select the repository. The root
   [`render.yaml`](render.yaml) provisions the `proteva-api` Docker service,
   health check, and persistent SQLite disk.
3. Use the `starter` plan initially for a single-instance demo service. Review
   Render's current price in the dashboard and monitor credit usage against the
   $50 budget.
4. In the Render environment-variable screen, set:

   | Key | Value |
   | --- | --- |
   | `PROTEVA_CORS_ORIGINS` | Exact Vercel production origin, for example `https://proteva.vercel.app` |
   | `PROTEVA_GOOGLE_OAUTH_CLIENT_ID` | Google Web client ID from step 1 |
   | `PROTEVA_GOOGLE_API_KEY` | Server-only Gemini API key, if live Gemma runs are enabled |

   Render creates `PROTEVA_AUTH_SIGNING_SECRET` from the Blueprint. Keep that
   generated value private and stable. `PROTEVA_ENV=production` and the
   persistent database path are defined in `render.yaml`.
5. Deploy and verify `https://YOUR-RENDER-SERVICE.onrender.com/api/v1/health`.

The backend image uses the committed `backend/uv.lock` with `uv sync --frozen`.
The persistent disk holds the local SQLite state. Run one Render instance while
using this persistence design; multi-instance scaling needs a managed database
and a shared job/artifact store first.

## 3. Deploy the frontend on Vercel

1. In Vercel, import the same GitHub repository.
2. Select Bun as the package manager. Vercel detects TanStack Start through
   [`vercel.json`](vercel.json); Nitro selects its Vercel output during the
   Vercel build.
3. Set these Production environment variables:

   | Key | Value |
   | --- | --- |
   | `VITE_API_BASE_URL` | `https://YOUR-RENDER-SERVICE.onrender.com/api/v1` |
   | `VITE_GOOGLE_OAUTH_CLIENT_ID` | The same Google Web client ID configured on Render |

4. Deploy. After Vercel assigns its production URL, add that exact URL to
   `PROTEVA_CORS_ORIGINS` on Render and to Google Cloud's authorized JavaScript
   origins, then redeploy the API if the origin changed.
5. Test a direct deep link, then sign in. A failed live API request must remain
   visible in the UI; it must not use demo data.

`VITE_GOOGLE_OAUTH_CLIENT_ID` is intentionally public browser configuration.
All other authentication and Gemini secrets belong only in Render environment
variables.

## Live scientific workflow boundary

The Render Docker service deliberately contains only the FastAPI environment.
It does not bundle ProteinMPNN checkpoints, the upstream ProteinMPNN checkout,
prepared reference PDBs, or the optional BioEmu worker. Therefore do **not**
advertise the deployed service as ready for live ProteinMPNN experiments until
a separate managed scoring worker and controlled artifact storage have been
provisioned and verified. Live requests must fail explicitly when those
requirements are unavailable; demo mode remains separate.

Before public launch, add application authentication/authorization policy per
experiment, rate limiting, HTTPS custom-domain review, backup/retention policy
for the SQLite disk, and a managed relational database before horizontal
scaling.

## Local configuration

Copy [`.env.example`](.env.example) for the frontend and
[`backend/.env.example`](backend/.env.example) for the API. Local configuration
files remain untracked. Generate a distinct 32-byte-or-longer
`PROTEVA_AUTH_SIGNING_SECRET`; never reuse the Google/Gemini key for it.
