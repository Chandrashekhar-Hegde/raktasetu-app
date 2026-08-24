# Changelog

All notable changes to RaktaSetu are documented in this file.

## [Unreleased]

### Added

- `GET /api/health/ready` pings Postgres (`SELECT 1`) and returns 503 when the database is unreachable or Neon compute quota is exhausted. Railway liveness remains `GET /api/health` (no DB) so the SPA is not restarted during a quota outage.

## [2.0.13] — 2026-07-21

### Added

- Request escalation cron (`npm --prefix backend run escalation`): every 5 minutes widens open critical (10 min) / urgent (30 min) requests with zero accepts — radius current → 10 → 25 km (max level 2) — and re-pings only newly in-range compatible on-call donors (deduped via prior `blood_request` notifications). Scheduled requests never escalate.
- Auto-expiry of open requests past `needed_by` or 24 hours (`status=expired`)
- Hospital Console escalation chip and `needed_by` countdown (en + kn)
- Migration `last_escalated_at` on `blood_requests`; status check allows `expired`
- Ops: Railway cron service `raktasetu-escalation` with `/railway.escalation.toml` (mirrors retention; see operational-readiness)
- Root `railway.toml` no longer sets `startCommand` (was forcing cron services to boot the API); app/cron start commands are per-service

### Changed

- Package / health version bumped to `2.0.13`

## [2.0.12] — 2026-07-21

### Changed

- No-JS shell and public brand tagline: Kannada `ರಕ್ತಸೇತು` (was Devanagari)
- `theme-color` / no-JS shell background: oxblood `#7A1626` (was near-black `#0A0506`)
- PWA `theme_color` oxblood; `background_color` porcelain `#F8EFEC`
- Frontend package version bumped to `2.0.12`

## [2.0.11] — 2026-07-21

### Added

- Domain cutover prep for `raktasetu.in`: `VITE_SITE_ORIGIN` (build-time SEO/OG/sitemap), optional `CANONICAL_ORIGIN` 301 middleware (off by default; `/api/*` + `/health` + `/socket.io/*` exempt)
- Ops checklist: [docs/ops/domain-cutover.md](./docs/ops/domain-cutover.md)

### Changed

- Package / health version bumped to `2.0.11`
- README documents Railway URL as live today and `raktasetu.in` as the cutover target

## [2.0.10] — 2026-07-21

### Added

- DPDP account deletion with 30-day restore: `POST /api/auth/delete-account` soft-deactivates immediately (sessions revoked, matching off); `POST /api/auth/restore-account` restores within the window
- Retention job anonymizes deactivated accounts after 30 days while keeping donation/credit/audit rows on the anonymized user id for blood-bank traceability
- Data Rights deletion flow (typed DELETE, password re-confirm, blocker messaging) and Login restore path when the API returns `ACCOUNT_RESTORABLE`

### Changed

- Package / health version bumped to `2.0.10`
- Privacy policy retention section documents the 30-day grace and anonymized donation retention decision

## [2.0.9] — 2026-07-21

### Added

- Playwright full-loop e2e for the KLE demo path (`frontend/e2e/full-loop.spec.js`): hospital broadcast → donor accept (Kannada) → arrive → verify → credits; optional redemption when UI present
- `npm run test:e2e:full` (frontend/root) migrates + seeds the local/CI test DB, then runs the loop against Vite `:5173` + API `:3001`
- Frontend CI `full-loop` job with disposable Postgres (never production Neon)
- Demo fixtures: approved Fixture Hospital + on-call O+ Fixture Donor at Hubballi coords

### Fixed

- Hospital live board `pinged` count now reflects blood-request notifications (was counting only `donor_responses`, so newly broadcast requests showed 0)
- `Card` forwards DOM props (`onClick`, `role`, etc.) so donor request list cards are clickable again
- Local migrate/fixture scripts treat `127.0.0.1` as non-SSL (same as `localhost`)
- `hospital_complete_redemption` qualifies `redemptions.status` so PL/pgSQL no longer treats RETURNS TABLE `status` as ambiguous (blocked hospital Redeem)

### Changed

- Package / health version bumped to `2.0.9`

## [2.0.8] — 2026-07-21

### Added

- Pilot metrics (admin): summary, response-time funnel (p50/p90), rare-type (O−/AB−) panel, and CSV export — aggregates only, no donor PII
- Hospital console metrics strip from `GET /api/hospital/metrics/summary` (caller hospital only)
- Admin dashboard “Pilot metrics” tab: fill rate, p50 first-accept, on-call donors, SVG requests/day chart, date range, CSV download
- Deterministic metrics mini-scenario in test fixtures; backend metrics + access-matrix coverage
- `blood_requests.escalation_level` column for rare-type escalation tracking

### Changed

- Package / health version bumped to `2.0.8`

## [2.0.7] — 2026-07-19

### Added

- Credit redemption end-to-end: donors redeem 100 credits for self or a registered family member (max 4); hospital console verifies one-time `RSC-` codes
- `family_members.relation` + max-4 trigger; `redemptions` table with hashed codes; credits ledger types `reserved` / `reserve_released` / `redeemed`
- SECURITY DEFINER `hospital_complete_redemption(code_hash)` so hospitals never SELECT raw redemption rows (privacy-preserving, mirrors donor-visibility helpers)
- Retention job expires active redemptions past `expires_at` and releases reserved credits
- Donor Credits UI: beneficiary picker, inline family add, QR + countdown + cancel; Console Verify toggle for donation vs redeem

### Changed

- Credit balance is now `SUM(credits.amount)` so reservations and releases stay consistent
- Package / health version bumped to `2.0.7`

## [2.0.6] — 2026-07-18

### Security

- Global API rate limit keys by authenticated user id (JWT `sub`) with IP fallback, so CGNAT/shared NATs do not starve distinct sessions; `/api/auth/` stays IP-keyed and tighter
- Removed unused min-8 `validatePassword` helper; registration policy remains Zod min 12
- Smoke scripts no longer embed demo credentials; require `RAKTASETU_EMAIL` / `RAKTASETU_PASSWORD` (or `EMAIL` / `PASSWORD`)

### Fixed

- Web SPA uses `BrowserRouter` (clean URLs + Express SPA fallback); Capacitor native keeps `HashRouter`; legacy `/#/…` deep links redirect on web
- `AuthProvider` again renders `children` (regression that blanked the SPA shell)
- `index.html` served with real `Cache-Control: no-store` (hashed assets stay long-cache); removed ineffective `http-equiv` cache meta tags
- Open Graph / Twitter share image now uses compressed `og-card-1200x630.jpg` (~43 KB) instead of the large PNG

### Added

- CI guard: blood compatibility matrix must match across `donor.js`, `hospital.js`, and `frontend/src/theme.js`
- Shared Cursor project rule at `.cursor/rules/raktasetu.mdc` (stack, i18n, RLS, privacy, auth, blood domain)

### Changed

- `/api/health` version is read from `backend/package.json` at startup (package version aligned to `2.0.6`)

### Notes

- `BEGIN READ ONLY` for GET-path DB queries deferred; TODO left on `query()` in `db.js`

## [2.0.5] — 2026-07-18

### Security

- Permissions-Policy now allows same-origin `camera=(self)` so ConsoleVerify / Html5Qrcode works on the web SPA (microphone, payment, and usb stay closed)
- Rotated production `JWT_SECRET` and bumped `token_version` to invalidate existing sessions (see `docs/security/credential-rotation-runbook.md`)
- Confirmed historical Neon password from git-era `.env` is dead; VAPID/Google client IDs were not in that leaked file
- Web auth: refresh token moves to `httpOnly; Secure; SameSite=Strict` cookie on `/api/auth`; access token is memory-only (Capacitor native keeps localStorage)
- CSP drops `unpkg.com`; `connect-src` no longer allows open `wss:` (same-origin + Google accounts only)

### Fixed

- India NBTC/NACO whole-blood eligibility: male **90 days**, female **120 days** (was incorrectly 56 days)
- Donor registration and Google onboarding collect sex for interval calculation; null sex falls back to the conservative 120-day interval
- Donor accept and on-call gates enforce the same `next_eligible_date` rule; UI cites NBTC guidelines
- Leaflet CSS loaded from npm (map screen) instead of unpkg CDN

### Added

- PWA/WhatsApp PNG assets: `icon-192.png`, `icon-512.png` (maskable padding), `og-card-1200x630.png`
- Tiny Kannada `t()` dictionary for donor-critical screens (home, alert, on-the-way, credits, login); JSON-LD `alternateName` ರಕ್ತಸೇತು / `inLanguage` en+kn

### Ops

- Neon production moved to `aws-ap-southeast-1` (Singapore); Mumbai unavailable on plan. Safety branch `pre-ap-southeast-cutover-2026-07-18` retained on the prior US project.

### Notes

- Capacitor native packaging remains optional; camera QR verify must work on HTTPS web for the KLE pilot
- Optional git-history purge (BFG/filter-repo) of the old `.env` blob still requires explicit approval before any force-push

## [2.0.4] — 2026-07-18

### Ops

- CI/CD no longer fails when `RAILWAY_TOKEN` is absent: migrations still run; CLI deploy skips green; app ships via Railway GitHub App auto-deploy
- Renamed Frontend workflow to `Frontend CI` (GitHub Pages path retired in name and docs)
- Backend CI health check uses an in-CI JWT placeholder (no unused `DATABASE_URL`/`JWT_SECRET` GitHub secrets)
- Living-repo hygiene: `CONTRIBUTING.md`, `docs/README.md`, `docs/ops/ci-cd.md`, PR/issue templates; removed stale root `CI_CD_GUIDE.md` (wrong remote / Pages)
- Optional path A documented: create a Railway Project Token in the dashboard, then `gh secret set RAILWAY_TOKEN`

### Notes

- `RAILWAY_TOKEN` was not set by automation (CLI/OAuth cannot mint a durable project token). Paste one only if you want Actions `railway up` in addition to GitHub App deploys.

## [2.0.3] — 2026-07-18

### Security

- Hospitals discover and verify donors through narrow `SECURITY DEFINER` helpers under `raktasetu_rls` (blood group + coarse location only; no email/phone/name SELECT)
- Production app process refuses to boot when `MIGRATION_DATABASE_URL` is present
- Database TLS verification enabled by default for remote Postgres (`DATABASE_SSL_INSECURE=1` break-glass only)

### Fixed

- Create-request matching and donation completion work without owner RLS bypass
- Donor on-the-way QR encodes the hospital `ref_code` used by console verify
- Web Push (and socket `blood_request`) fires when hospitals broadcast requests, not only via `/api/push/test`
- Create-request response returns `donors_notified` only (no `nearby_donors` PII array)
- Pending hospital login routes to `/hospital-pending`
- Google account-link no longer races authenticated redirects
- Console reach copy uses API `donors_notified` instead of fabricated counts
- Donor accept/arrive hospital notifications use `enqueue_notification` so RLS no longer 500s the response path

### Ops

- Invite cohort runbook in `docs/operational-readiness.md`
- Railway cron service `raktasetu-retention` scheduled daily at `0 3 * * *` with `RETENTION_DATABASE_URL` only on that service
- Access token sample TTL documented as `30m` (refresh tokens remain the long-lived path)
- Frontend CI installs Chromium and WebKit for Playwright mobile/desktop projects
- `MIGRATION_DATABASE_URL` GitHub secret present for CI migrations; optional `RAILWAY_TOKEN` for Actions CLI deploy (see 2.0.4)

### Notes

- Invite-only readiness support only. This release does not claim DPDP, HIPAA, or other compliance certification.

## [2.0.2] — 2026-07-18

### Fixed

- Light form fields (register, profile DOB, data-rights delete confirm) stay ink-on-white under OS dark preference
- Login and auth-flow placeholders use stronger contrast on dark fields
- On-the-way screen renders a real scannable verification QR
- Landing night disclaimer/footer muted text and console subtitle contrast improved
- Bottom navigation respects device safe-area insets

### Notes

- Neon safety branch `mvp-pre-role-switch-2026-07-16` was deleted; production uses Neon primary `main` only

## [2.0.1] — 2026-07-18

### Security

- Removed unused Railway `INITIAL_ADMIN_PASSWORD` after confirming admin login, pending hospital review, role denials, and logout revocation on production
- Ignored local `.cursor/` IDE metadata so workspace settings are not committed

### Notes

- Production remains on the MVP Release deployment (`fe5201da…`); no application rebuild required for the env/hygiene hardening above
- GitHub→Railway auto-deploy still needs a repository `RAILWAY_TOKEN` (and `MIGRATION_DATABASE_URL`) secret — create a Railway project/account token in the dashboard and set it with `gh secret set`
- Optional: rotate VAPID if keys were ever committed historically (requires donor re-subscribe); JWT rotation deferred because it invalidates all sessions

## [2.0.0] — 2026-07-15

### Security

- Removed production demo seeding and public demo credentials from startup, login, and README
- Hospital accounts stay pending until admin approval; operational routes require approved hospital state
- Google Sign-In uses verified identity only; no email auto-link; privileged roles denied; donor onboarding/link flows required
- Access tokens use issuer/audience/`jti`/token version; logout blacklists tokens, rotates refresh tokens, and disconnects sockets
- Donation completion is a single locked transaction with replay rejection and server-derived blood group
- Push subscriptions are owner-scoped; Socket.IO accepts auth-payload tokens only and no longer mutates state
- Strict Zod validation, pagination bounds, RLS policies, least-privileged app role grants, retention job, and CI security gates

### Added

- Google onboarding, account-link, and hospital-pending screens
- Admin hospital approval controls
- Donor request map view (Leaflet) with accessible list fallback
- Operational readiness and security-controls documentation

### Changed

- Royal maroon / black / white brand tokens across console, admin, and auth shells
- Vite manual chunks for `three`, `leaflet`, and vendor to reduce main-route lag
- Responsive `app-shell` widths for mobile, tablet, and desktop

### Notes

- Technical controls are not GDPR or HIPAA certification claims
- Production demo passwords must be rotated out-of-band if still in use; fixture seeding refuses production

## [1.2.0] — 2026-07-15

### Added

- Full landing: mission, vision, how-it-works (brand kit from `plan.md`)
- Donor-first auth UX: `/#/login` and `/#/register` default to donor; hospital via discreet `?role=hospital` links
- Centralized `roleHome()` — no open redirects from query params
- Design + plan: `docs/superpowers/specs/2026-07-15-landing-auth-ux-design.md`, `docs/superpowers/plans/2026-07-15-landing-auth-ux.md`

### Changed

- Living Bridge: lower particle count / DPR on mobile; pause when tab hidden
- Landing + auth: safe-area padding, ≥44px touch targets
- Google Sign-In shown only on donor login

## [1.1.0] — 2026-07-15

### Added

- Three.js “Living Bridge” animated landing at `/#/` (brand-first guest experience)
- Google Sign-In path (`POST /api/auth/google` + GIS button when `VITE_GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_ID` set)
- PWA via `vite-plugin-pwa` (service worker, installable manifest)
- Web Push foundation (`/api/push/*`, VAPID, `push_subscriptions` table) + local notification demo on donor Profile
- `CHANGELOG.md`, landing/Google/PWA design + plan under `docs/superpowers/`
- Contacts: support@raktasetu.org, privacy@raktasetu.org (Privacy Policy + README)

### Changed

- Public routes (`/`, `/login`, `/register`, `/privacy`) no longer blocked by auth loading spinner
- Login screen shares landing atmosphere; link back to landing
- README points at Railway live URL; Cloudflare / GH Pages noted as retired
- App version bump to 1.1.0

### Fixed

- Guest first paint stuck on “Loading RaktaSetu…” when only landing was needed

## [1.0.0] — 2026-07-15

### Fixed

- Production SPA stuck on loading due to CORS 500s on Railway same-origin
- Auth state shared via AuthProvider so login navigates correctly
- Auth `/me` timeout so public pages are not blocked forever
- Auth/API rate limits raised for MVP demo role switching

### Changed

- Unified Railway hosting: Express serves `frontend/dist` + API
- Retired Cloudflare tunnel / GitHub Pages as production hosts

### Added

- Neon schema snapshot, Railway/Nixpacks deploy config
- MVP design + implementation docs under `docs/superpowers/`
