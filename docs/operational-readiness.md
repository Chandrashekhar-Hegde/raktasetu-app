# Operational readiness

## Release gates

1. `npm --prefix backend ci && npm --prefix backend run lint && npm --prefix backend test`
2. Apply migrations with the owner-only `MIGRATION_DATABASE_URL`; never expose it to the application process.
3. Run RLS and bounded-performance checks against a disposable `TEST_DATABASE_URL`.
4. `npm --prefix frontend ci && npm --prefix frontend run lint && npm --prefix frontend test && npm --prefix frontend run build`
5. Run Playwright mobile and desktop smoke tests against staging.
6. Verify required production variable names are present without printing values.
7. Deploy once, inspect deployment logs, then verify health, auth red paths, role boundaries, logout revocation, map rendering, and responsive routes.

## Database roles and migrations

- `MIGRATION_DATABASE_URL`: database owner; CI migration step and operator workstation only. **Never** set this on the Railway web/app service. Production boot refuses to start if it is present in the app process environment.
- `DATABASE_URL`: Neon login role `raktasetu_app` (not `neondb_owner`). The API immediately `SET ROLE raktasetu_rls` (NOLOGIN, `rolbypassrls=false`) because Neon-managed login roles retain `BYPASSRLS`.
- `DB_RUNTIME_ROLE`: defaults to `raktasetu_rls` when `NODE_ENV=production`.
- Auth-scoped `query()` still opens `BEGIN READ WRITE` for RLS context; opt-in `READ ONLY` for pure GET paths is a follow-up (see TODO in `backend/src/db.js`).
- `RETENTION_DATABASE_URL`: owner or dedicated maintenance role used only by the scheduled retention service (not the web service).
- Migrations are checksum-tracked in `schema_migrations`. Never edit an applied migration.
- Take a provider backup or restore point before production schema changes. Test restoration in a non-production branch before relying on it.
- Default CD: Railway GitHub App auto-deploys service `raktasetu` on push to `main`. Actions always migrate with `MIGRATION_DATABASE_URL`. Optional Actions `railway up` needs dashboard-created Project Token secret `RAILWAY_TOKEN` (see `docs/ops/ci-cd.md`). Workstation `railway up` remains a break-glass fallback.

## Admin bootstrap (no public demo admin)

Production must not ship documented demo admin passwords. To create or rotate an operator admin:

```bash
ALLOW_ADMIN_BOOTSTRAP=1 \
ADMIN_EMAIL='ops@example.org' \
ADMIN_PASSWORD='<strong-secret-min-16>' \
MIGRATION_DATABASE_URL='...' \
node backend/scripts/bootstrap-admin.js
```

Change the password on first login. Do not commit the password or put it in README.

## Hospital approval

1. Compare the submitted license number and hospital contact details with the appropriate official registry or direct institution contact.
2. Record the reason and evidence reference outside the public application logs.
3. Approve, reject, or suspend through the admin API/UI. The transition increments token version and disconnects active sockets.
4. Re-review when ownership or license details materially change.

## Retention

Run `npm --prefix backend run retention` daily in a separate Railway cron service with `RETENTION_DATABASE_URL` only on that service.

Production cron service `raktasetu-retention` (configured 2026-07-18):

- GitHub source: `Chandrashekhar-Hegde/raktasetu-app` @ `main`
- Config-as-Code file: `/railway.retention.toml` (must not use root `railway.toml` or the cron starts the API)
- Start command: `npm --prefix backend run retention`
- Cron schedule: `0 3 * * *` (daily 03:00 UTC); next run shown in Railway as `nextCronRunAt`
- Variables on the cron service only: `RETENTION_DATABASE_URL` (Neon owner/maintenance), `NODE_ENV=production`
- Do not attach the owner URL to the web service (boot refuses `MIGRATION_DATABASE_URL` there)
- Deploy ID when first wired: `f1fe3178-b4ba-4721-816a-dcffd16380bc`

## Escalation + auto-expiry

Run `npm --prefix backend run escalation` every 5 minutes in a separate Railway cron service.

Production cron service `raktasetu-escalation`:

- GitHub source: `Chandrashekhar-Hegde/raktasetu-app` @ `main`
- Config-as-Code file: `/railway.escalation.toml` (must not use root `railway.toml` or the cron starts the API)
- Start command: `npm --prefix backend run escalation`
- Cron schedule: `*/5 * * * *` (every 5 minutes). This cadence keeps Neon compute from scaling to zero; **Neon Free (100 CU-hours) cannot sustain it** — use Launch or higher.
- If Neon returns `53000` / HTTP 402 compute quota, the job logs `Neon compute quota exceeded` and **exits 0** (Railway does not mark the tick CRASHED). Optionally pause this cron in the Railway dashboard until `GET /api/health/ready` is 200.
- Variables on the cron service only: `ESCALATION_DATABASE_URL` (or reuse `RETENTION_DATABASE_URL` — Neon owner/maintenance), `NODE_ENV=production`; optional VAPID keys if push should fire from the cron
- Advisory lock key `78254104` (distinct from retention)
- Behavior: critical open requests with zero accepts escalate after 10 minutes (urgent: 30; scheduled: never); radius widens to max(current, 10) then max(current, 25); only newly in-range donors are notified; open requests past `needed_by` or 24h become `expired`
- Service ID: `22a1ce72-fbca-4a16-b294-6298f4ce1613`
- Verified live 2026-08-02: cron runs `npm --prefix backend run escalation` (not the API); sample log `escalation: examined=26 escalated=0 expired=26 donors_notified=0`
- Root `railway.toml` must not set `startCommand` (config-as-code overrides dashboard and would boot the API on cron services)

- Expired Google onboarding records: one day after expiry.
- Expired/revoked refresh tokens: seven/thirty days.
- Expired token blacklist entries: one day after expiry.
- Notifications: 365 days.
- Audit events: seven years unless `legal_hold=true`.

Retention is implemented as bounded 1,000-row batches under an advisory lock. These are project defaults, not a legal determination; the organization must validate periods with counsel and policy owners.

## First cohort invite

Use this runbook after P0 invite gates are green (`/api/health`, hospital matching under RLS, QR/`ref_code` verify, push broadcast path, owner URL off the app service).

1. Confirm liveness (`/api/health`) and readiness (`/api/health/ready`) plus push status on production without mutating data. Ready must be 200 before matching or login will work.
2. Bootstrap or rotate admin with `bootstrap-admin.js` if needed; change the password immediately; remove `ALLOW_ADMIN_BOOTSTRAP` and bootstrap password variables from Railway.
3. Invite 1 to 2 hospitals: they register, you verify license offline, then approve in `/admin`. Pending hospitals stay blocked.
4. Invite 5 to 20 donors: register or Google onboarding, complete profile, enable Web Push on Profile, go on-call near an approved hospital.
5. Dry-run: approved hospital creates a non-critical test request → donor receives push and/or in-app alert → accept → arrive → hospital verifies with the on-the-way QR (API query param `ref`, value is `ref_code`) → credits appear → second verify is rejected.
   - 2026-07-18 production dry-run (labeled `DRYRUN* Jul18c`): approve → create-request (`donors_notified: 3`) → accept → arrive → `ref` lookup → verify (+100 credits) → second verify rejected → request closed. Test accounts keep the `DRYRUN` name/email prefix.
6. Tell invitees clearly: closed beta; not emergency medical dispatch; no SMS OTP; data is processed on Neon Singapore (`ap-southeast-1`) and Railway SEA; keep the app open or rely on push after enabling it.
7. Monitor `privacy@raktasetu.org` and `security@raktasetu.org`.
8. Rollback: redeploy the last good commit. Do not restore the database unless you accept write loss since the restore point.

This is invite-only operational readiness support, not DPDP or HIPAA certification.

## Incident response

1. Contain: suspend affected accounts, increment token versions, revoke refresh-token families, and block compromised infrastructure credentials.
2. Preserve: set `legal_hold=true` for relevant audit rows and preserve provider logs/backups.
3. Investigate: determine affected identities, records, time window, and access path without copying secrets or unnecessary personal data into tickets.
4. Recover: rotate only confirmed or plausibly exposed secrets, deploy the fix, and verify revoked sessions cannot reconnect.
5. Notify: follow applicable contractual and legal requirements. Do not make unsupported breach or compliance claims.
6. Review: document root cause, detection gaps, corrective controls, and owner/due date.

## Rollback

- Application rollback: redeploy the last known-good commit only if its schema expectations remain compatible.
- Database rollback: prefer a forward corrective migration. Restore from backup only after explicitly accepting loss of writes since the restore point.
- Never force-push or rewrite release history.
