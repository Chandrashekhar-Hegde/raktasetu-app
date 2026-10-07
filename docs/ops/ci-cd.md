# CI/CD

Canonical remote: `https://github.com/Chandrashekhar-Hegde/raktasetu-app.git`  
Live: https://raktasetu-production.up.railway.app/  
Cutover target: https://raktasetu.in/ — [domain-cutover.md](./domain-cutover.md)

## Pipelines

| Workflow | File | When | Purpose |
|----------|------|------|---------|
| Backend CI | `.github/workflows/backend-ci.yml` | `backend/**` | Lint, unit/security tests, syntax, `/api/health` smoke |
| Frontend CI | `.github/workflows/frontend-ci.yml` | `frontend/**` | Lint, Vitest, Vite build, Playwright (Chromium + WebKit) |
| Migrate and Deploy | `.github/workflows/railway-deploy.yml` | app paths on `main` | Apply owner migrations; optional CLI deploy |

GitHub Pages and Cloudflare tunnel hosting are **retired**. The SPA is served by Express from `frontend/dist` on Railway.

## Production deploy path (default)

1. Open a PR. **Backend CI** (`lint-and-test`, real Postgres, no skipped tests) and **Frontend CI** (`build`, `full-loop`) must pass; `main` is protected and requires them.
2. Merge to `main`. GitHub Actions **Migrate and Deploy** applies migrations with repository secret **`MIGRATION_DATABASE_URL`** only.
3. Railway's GitHub trigger has **Wait for CI** on for all three services: it deploys only after the commit's GitHub checks (including the migration) pass, so new code never boots against an old schema.
4. Services: **`raktasetu`** (API + SPA), cron **`raktasetu-escalation`** (`*/5`, `/railway.escalation.toml`), cron **`raktasetu-retention`** (daily, `/railway.retention.toml`). The crons use their own config files so they don't inherit the API's healthcheck and restart policy.
5. Verify: each service's deployment reaches `SUCCESS` (`railway deployment list --service <name> --json`) and `/api/health/ready` is 200.

### Secrets

| GitHub secret | Required | Used by | Notes |
|---------------|----------|---------|-------|
| `MIGRATION_DATABASE_URL` | Yes (migrate job) | Actions migrate step | Neon owner URL. **Never** set on the Railway app service — production boot exits if present. |
| `RAILWAY_TOKEN` | Optional | Actions `railway up` | Railway **Project Token** from dashboard → Project Settings → Tokens. Not creatable via CLI. |

No `DATABASE_URL` / `JWT_SECRET` GitHub secrets are required for CI. Runtime secrets live on Railway services.

### Optional Actions CLI deploy (path A)

When you want Actions to call `railway up` in addition to GitHub App auto-deploy:

```bash
# 1. Create a Project Token in the Railway dashboard (project raktasetu)
# 2. Set it without printing into the shell history of shared logs:
gh secret set RAILWAY_TOKEN
# paste token, Enter, Ctrl-D
```

Until `RAILWAY_TOKEN` is set, the deploy step **skips green** and prints setup hints. Migrations still run.

## Local checks

```bash
npm --prefix backend ci && npm --prefix backend run lint && npm --prefix backend test
npm --prefix frontend ci && npm --prefix frontend run lint && npm --prefix frontend test && npm --prefix frontend run build
cd frontend && npx playwright install --with-deps chromium webkit && npm run test:e2e
```

## Health

```bash
# Liveness (no database). Railway healthcheck. Stays 200 if Neon is down.
curl -sf https://raktasetu-production.up.railway.app/api/health

# Readiness (SELECT 1). 200 when Postgres accepts connections; 503 otherwise.
# error.code is COMPUTE_QUOTA_EXCEEDED after a Neon Free CU-hour cap, or DATABASE_UNAVAILABLE.
curl -sf https://raktasetu-production.up.railway.app/api/health/ready
```

Do **not** point Railway `healthcheckPath` at `/api/health/ready`. A Neon outage would restart the web service and take the SPA down with it.

### Neon compute quota (2026-08)

The 5-minute escalation cron keeps Neon compute awake. Free plan is **100 CU-hours/project/month**; always-on 0.25 CU is ~180 CU-hours. Production Postgres `raktasetu-ap-southeast-1` therefore requires **Launch** (pay-per-use). After a 402 / Postgres `53000` quota error:

1. Upgrade the Neon org to Launch: https://console.neon.tech (Billing). Quota otherwise resets at month start.
2. App/cron deploys after this change **do not crash-loop**: maintenance jobs log the quota error and exit 0; login returns 503 instead of 500. Optionally still pause Railway cron `raktasetu-escalation` (`22a1ce72-fbca-4a16-b294-6298f4ce1613`) to skip empty ticks.
3. Confirm `GET /api/health/ready` is 200 and `POST /api/auth/login` is no longer 503 `COMPUTE_QUOTA_EXCEEDED`, then re-enable the cron if paused.


## Branch protection

`main` requires the status checks **lint-and-test** (Backend CI), **build** and **full-loop** (Frontend CI), and disallows force pushes and deletion. PR workflows have no path filter, so the required checks always report. Admins can still bypass in an emergency (`enforce_admins` off); use that only for hotfixes and follow up with a PR. Add "require 1 approving review" when a second maintainer joins.

See also [CONTRIBUTING.md](../../CONTRIBUTING.md) and [operational-readiness.md](../operational-readiness.md).
