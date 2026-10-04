# RaktaSetu — Blood Donation Platform

> **Connect. Donate. Save Lives.**  
> A cross-platform blood donation matching platform for donors, hospitals, and administrators.

## Live MVP

**https://raktasetu-production.up.railway.app/**  
Custom domain (cutover target): **https://raktasetu.in/** — see [docs/ops/domain-cutover.md](./docs/ops/domain-cutover.md). Until DNS/env cutover, prefer the Railway URL.

One Railway service (`raktasetu`) hosts **both** the Express/Socket.io API and the Vite SPA (`frontend/dist` served by Express). Neon Postgres is the database. Cron service `raktasetu-retention` runs daily retention.

```bash
curl -sf https://raktasetu-production.up.railway.app/api/health
RAKTASETU_EMAIL='you@example.com' RAKTASETU_PASSWORD='...' ./test_login.sh https://raktasetu-production.up.railway.app
```

Guest landing (mission / vision / Living Bridge) is at `/`.  
Donor sign-in: `/login` · Hospital sign-in (discreet): `/login?role=hospital`.  
(Capacitor native builds still use hash routes: `/#/…`.)

Canonical GitHub remote: `https://github.com/Chandrashekhar-Hegde/raktasetu-app.git`

## Repository status

Current application release: **2.0.13**. The repository health snapshot, branch-divergence check, CI evidence, documentation status tags, and tracked debt live in [docs/repository-health.md](./docs/repository-health.md). Release tags follow [docs/release-and-tagging.md](./docs/release-and-tagging.md).

## Contacts

| Role | Contact |
|------|---------|
| Support | support@raktasetu.org |
| Privacy / DPO | privacy@raktasetu.org |
| Org | RaktaSetu Trust, Bengaluru, Karnataka |

## Features

### Public
- **Landing** — mission, vision, how-it-works + Three.js Living Bridge (mobile-tuned)
- **Donor-first auth** — default login/register for donors; hospital via discreet link (`?role=hospital`)
- **PWA** — installable web app + service worker; local notifications; Web Push when VAPID keys are set
- **Google Sign-In** — donor login only (GIS → JWT when `VITE_GOOGLE_CLIENT_ID` configured)

### Donor App
- On-call toggle, emergency pings, GPS matching, credits, history, profile

### Hospital Console
- Live board, new request broadcast, donor verification, stats

### Admin Dashboard
- Platform analytics, user management, request monitoring

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, Three.js, Capacitor, BrowserRouter (web) / HashRouter (native), vite-plugin-pwa |
| Backend | Express 4, Socket.io, JWT, google-auth-library, web-push |
| Database | Neon Postgres |
| Hosting | Railway (API + SPA) + retention cron |

## Local development

```bash
# Terminal 1 — API
cd backend && cp .env.example .env   # set DATABASE_URL + JWT_SECRET
npm install && npm run dev

# Terminal 2 — Vite (proxies /api to :3001)
cd frontend && cp .env.example .env  # optional Google client ID
npm install && npm run dev
```

Same-origin production builds leave `VITE_API_URL` empty so the browser calls `/api` on the Railway host.

Local and staging fixtures must be created with the test fixture script. It refuses to run when `NODE_ENV=production`; production identities are provisioned through registration and admin approval only.

## Deploy

**Default path:** push to `main` → Railway GitHub App deploys `raktasetu` → GitHub Actions applies migrations with `MIGRATION_DATABASE_URL` (CI secret only).

**Do not** set `MIGRATION_DATABASE_URL` on the Railway app service — production boot refuses.

Optional Actions CLI deploy needs a Railway **Project Token** as GitHub secret `RAILWAY_TOKEN` (dashboard-created; see [docs/ops/ci-cd.md](./docs/ops/ci-cd.md)).

### Optional: Google Sign-In

1. Create an OAuth 2.0 **Web** client in [Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. Authorized JavaScript origins: `https://raktasetu-production.up.railway.app`, `https://raktasetu.in` (after cutover), `http://localhost:5173`.
3. Set on Railway / `.env`:
   - `GOOGLE_CLIENT_ID` (backend)
   - `VITE_GOOGLE_CLIENT_ID` (same value; rebuild frontend so it is baked into the SPA)
   - At cutover also set `VITE_SITE_ORIGIN=https://raktasetu.in` and extend `FRONTEND_ORIGINS` (see [domain-cutover.md](./docs/ops/domain-cutover.md))
4. Without these vars the Google button is hidden and `POST /api/auth/google` returns 503 — password login still works.

### Optional: Web Push (VAPID)

```bash
npx web-push generate-vapid-keys
railway variables set \
  VAPID_PUBLIC_KEY="..." \
  VAPID_PRIVATE_KEY="..." \
  VAPID_SUBJECT="mailto:support@raktasetu.org"
```

Donors can enable push from **Profile**. Local notification testing works without VAPID.

Database migrations are applied explicitly with the migration owner credential. Application startup never mutates schema or creates users.

## Invite users (first cohort)

See the runbook in [docs/operational-readiness.md](./docs/operational-readiness.md). Invite-only readiness support — not a compliance certification.

## Docs

| Doc | Purpose |
|-----|---------|
| [docs/README.md](./docs/README.md) | Documentation index |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | PR / secrets / checks |
| [docs/ops/ci-cd.md](./docs/ops/ci-cd.md) | CI/CD and branch protection |
| [docs/repository-health.md](./docs/repository-health.md) | Branch, CI, docs, and issue health snapshot |
| [docs/release-and-tagging.md](./docs/release-and-tagging.md) | Release version and Git tag policy |
| [docs/operational-readiness.md](./docs/operational-readiness.md) | Release gates, invites, retention |
| [docs/security/security-controls.md](./docs/security/security-controls.md) | Security controls |
| [CHANGELOG.md](./CHANGELOG.md) | Release history |
| [backend/db/schema.sql](./backend/db/schema.sql) | Schema reference |

**Note:** Older reports may mention Cloudflare tunnels or GitHub Pages — those are **retired**. Production is Railway only.
