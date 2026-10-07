# RaktaSetu — instructions for AI coding agents

Blood-donation coordination for India: donors get alerted when a nearby hospital needs their blood group.
Wrong code here can page the wrong donor, leak a donor's location, or lose an alert. Read this before changing anything.
(`AGENTS.md` is a symlink to this file; `.cursor/rules/raktasetu.mdc` points here.)

## Stack and layout

- `backend/` Express 5 + `pg` on Neon Postgres with row-level security. Node 22 (`.nvmrc`). Plain JS, ES modules.
- `frontend/` React 18 + Vite + react-router 7, plain JS, inline styles with tokens from `src/theme.js`. PWA; Capacitor shells exist but web is the launch target.
- Railway runs 3 services from this repo: `raktasetu` (API + built SPA), `raktasetu-escalation` (cron `*/5`), `raktasetu-retention` (cron daily).

## Commands (run before you say "done")

```bash
npm --prefix backend run lint && npm --prefix backend test           # needs TEST_DATABASE_URL, see below
npm --prefix frontend run lint && npm --prefix frontend test -- --run && npm --prefix frontend run build
npm run test:e2e:full                                                 # full-loop + fresh-donor, local test DB
```

Backend DB tests run against a disposable Postgres, never Neon:

```bash
createdb raktasetu_test
psql postgresql://localhost:5432/raktasetu_test -f backend/db/schema.sql
TEST_DATABASE_URL=postgresql://localhost:5432/raktasetu_test npm --prefix backend run db:test:migrate
TEST_DATABASE_URL=postgresql://localhost:5432/raktasetu_test FIXTURE_PASSWORD=Fixture-Pass-123! npm --prefix backend run db:test:fixtures
```

CI fails if any test is **skipped**: a skipped DB test is how RLS went untested for months. Don't add `skip` to make CI green.

## Invariants (breaking one is a bug even if tests pass)

**Deploy / ops**
- Never put `startCommand` in `railway.toml` or `nixpacks.toml`. Each Railway service sets its own; a shared start command makes the crons boot the API and never exit.
- Cron jobs must exit. They exit 0 on transient DB problems (`handleMaintenanceJobFailure` in `backend/src/db/computeQuota.js`) and give every `pg.Client` an `'error'` listener, or a dropped socket crashes the process.
- `MIGRATION_DATABASE_URL` (DB owner) lives only in the GitHub Actions secret. The API refuses to boot if it is set. Cron services use `RETENTION_/ESCALATION_DATABASE_URL`.
- Railway healthcheck is `/api/health` (no DB). `/api/health/ready` pings the DB and is cached 30 s; don't point liveness at it.
- `RAILWAY_ENVIRONMENT` being set means production (`isProductionEnv`). Use that helper, not `NODE_ENV` alone.

**Database**
- Schema changes: a new idempotent `backend/db/migrations/YYYY-MM-DD-name.sql`. Never edit an applied migration (checksums). `backend/db/schema.sql` is a frozen base snapshot: do not edit it.
- The API runs as `raktasetu_rls` (`SET ROLE`); production refuses a role that can bypass RLS. Every new table: `ENABLE` + `FORCE ROW LEVEL SECURITY`, a policy, `GRANT` to `raktasetu_rls`, and a DB test that a wrong user gets nothing.
- Multi-row writes that must succeed together go in one `withAuthorizationContext` transaction. Push/socket/email delivery happens **after** commit and never fails the request.

**Privacy (DPDP)**
- Hospitals never receive donor coordinates, phone or email. They get blood group and server-computed distance only (`hospital_visible_on_call_donors`).
- Location is captured only when the person taps a button, rounded to ~100 m (`frontend/src/lib/geolocation.js`).
- Donors who withdraw consent are off call and excluded from every matching query.
- Logs: `error.code` and `error.message` only. Postgres `detail` contains phone numbers and emails.
- Links in emails use the configured origin (`publicAppOrigin`), never the request `Host` header.

**Blood domain**
- Compatibility: `GIVERS` in `backend/src/utils/bloodCompatibility.js` is the only backend source. `frontend/src/theme.js` keeps a display copy. `compatibility-matrix.test.js` checks both against the ABO/Rh rule; if it fails, the table is wrong, not the test.
- Never pre-select a blood group in a form. Eligibility gaps follow NBTC: male 90 days, female 120 days.

**Auth**
- Web refresh token only in the `rs_refresh` httpOnly cookie; access token in memory (`frontend/src/lib/accessToken.js`). Never localStorage for web auth.
- Rotated refresh tokens replayed after 30 s revoke the whole family; password reset bumps `token_version` and revokes all refresh tokens.

**Frontend**
- Every user-facing string goes through `t()` from `src/i18n.js`, with the key in **both** `i18n/en.json` and `i18n/kn.json` (Kannada-first users).
- Show API errors with `errMsg(err, fallback)` from `src/api/client.js`. Never render `err.response.data.error` directly: it can be an object and blanks the screen.
- Use the shared `api` client, never raw `fetch`/axios. Buttons that look like icons need `aria-label`; tap targets ≥ 44 px.

## Definition of done

1. A test that fails on the old code: route tests use `backend/tests/helpers/routeDb.js` against a real DB; UI flows get Playwright.
2. Lint + all tests + build pass locally with 0 skipped.
3. New env var: documented in `backend/.env.example` (or `frontend/.env.example`).
4. `CHANGELOG.md` → `Unreleased` updated for anything a user or operator would notice.
5. No secrets, real phone numbers or production DB URLs in code, docs, tests or logs.
6. Work lands through a PR; `main` is protected (admins included) and requires `lint-and-test`, `build` and `full-loop`. Never disable protection to get a change in.

## What not to do

- Don't add frameworks, UI kits, TypeScript or state libraries. Match the surrounding code.
- Don't silence a failing test, lint rule or type of error to get green; fix the cause.
- Don't copy a helper into another file. Import it, or move it somewhere shared.
- Don't claim a deploy worked without seeing the Railway deployment reach `SUCCESS`.
