# Repository health

> **Status:** Active operational reference
>
> **Last reviewed:** 2026-10-07 (Asia/Kolkata), after the launch-readiness sweep; previous reviews 2026-10-04, 2026-08-11
>
> **Review scope:** Git/GitHub state, release metadata, documentation, comments, and tracked debt. No runtime behavior.

## Snapshot

| Check | Result |
|-------|--------|
| Canonical repository | `Chandrashekhar-Hegde/raktasetu-app` |
| Default/current branch | `main` |
| Reviewed commit | `main` after PR #9 (this snapshot) |
| Branch protection | `main` requires **lint-and-test**, **build**, **full-loop**; no force push or deletion; admin bypass kept for hotfixes |
| Deploy ordering | Railway "Wait for CI" on for all 3 services: deploys follow green checks and the migration |
| Application version | `2.0.13`; sweep fixes (PRs #3–#8) sit under `Unreleased` |
| Runtime | Node 22 (`.nvmrc`; Railway build shows `nodejs_22`); Express 5; react-router 7 |
| Tests | Backend 111 tests, **0 skipped** (CI fails on any skip; real Postgres incl. RLS); frontend 11 unit; Playwright `full-loop` + `fresh-donor` on every PR |
| Dependencies | `npm audit --omit=dev`: 0 vulnerabilities (backend and frontend) |
| CI failures since last review | Railway build of `38bde171` (PR #6 merge) failed: Nixpacks' default nixpkgs has no `nodejs_22`; fixed in PR #7 (pinned `nixpkgsArchive`). Production stayed on the previous healthy deploy |
| Release tags | `v2.0.13` → `5687e810`; next release should tag the sweep (see release-and-tagging.md) |
| Production check | `/api/health` and `/api/health/ready` 200 on 2026-10-07; all 3 services SUCCESS; escalation ticks clean |
| Cron config | `raktasetu-escalation` → `/railway.escalation.toml`, `raktasetu-retention` → `/railway.retention.toml` (restart policy NEVER, no API healthcheck) |
| Custom domain check | `raktasetu.in` NXDOMAIN (expired 2026-08-12): issue #9 |
| Open tracked work | Milestone **Public launch** (#9–#14: domain, contact inboxes, email delivery, Neon plan, data controller, Android) and backlog #1, #15–#28 labelled `p2`/`p3` |
| Agent guidance | `CLAUDE.md` (+ `AGENTS.md` symlink, Cursor rule points to it) |

Merged remote branch `cursor/neon-quota-ready-ed36` and local `feat/user-ready-today` were deleted. Remote `gh-pages` (2026-07-08, v1.0.3, retired hosting) is kept for history; delete it when no longer wanted.

## Documentation status tags

| Tag | Meaning | Documents |
|-----|---------|-----------|
| **Active** | Maintained as current operating truth | `CLAUDE.md`, `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, this file, `docs/operational-readiness.md`, `docs/ops/*`, `docs/security/*` |
| **Reference** | Technical snapshot that must be read with later migrations or implementation history | `backend/db/schema.sql`, `docs/superpowers/specs/*`, `docs/superpowers/plans/*` |
| **Archived** | Historical evidence; not current operating guidance | `STRESS_TEST_REPORT.md`, `red-team-input-fuzzing-report.md`, `plan.md`, `DEPLOYMENT_PLAN.md` |

When documents disagree, use active documentation and the current implementation. For database state, apply every migration after the base `backend/db/schema.sql` snapshot.

## Living-repository rules

- Fetch before reporting divergence. A local tracking ref alone is not proof that `main` is current.
- Put user-visible and operator-visible changes under `CHANGELOG.md` → `Unreleased` in the same pull request.
- Link actionable `TODO`/`FIXME` comments to a GitHub issue. Comments without an owner, issue, or removal condition should be rewritten or removed.
- Label documentation work `documentation`; label implementation debt by its real type (`bug`, `enhancement`, or security-sensitive private tracking).
- Review active docs after deployment, domain, data-retention, authentication, or release-process changes.
- Do not rewrite historical specs or reports to look current. Add an archive/status banner and point readers to the active replacement.
- Never place secrets, credentials, personal data, or production database URLs in issues, comments, examples, or logs.

## Repeatable audit

```bash
git fetch origin --prune
git status --short --branch
git rev-list --left-right --count HEAD...origin/main
git tag --sort=-version:refname
gh run list --repo Chandrashekhar-Hegde/raktasetu-app --limit 12
gh issue list --repo Chandrashekhar-Hegde/raktasetu-app --state open
rg -n --hidden -g '!.git/**' -g '!**/package-lock.json' \
  '(TODO|FIXME|HACK|XXX|TBD|@todo|@deprecated)' .
```

Also run a Markdown link check and compare the documented routes, scripts, environment variables, cron services, and release version with their implementation sources.

## Release tagging

Follow [release-and-tagging.md](./release-and-tagging.md). Historical changelog entries are not enough by themselves to choose retroactive tag commits; verify each boundary from package-version changes and release evidence before backfilling a tag.
