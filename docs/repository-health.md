# Repository health

> **Status:** Active operational reference
>
> **Last reviewed:** 2026-10-04 (Asia/Kolkata); previous review 2026-08-11
>
> **Review scope:** Git/GitHub state, release metadata, documentation, comments, and tracked debt. No runtime behavior.

## Snapshot

| Check | Result |
|-------|--------|
| Canonical repository | `Chandrashekhar-Hegde/raktasetu-app` |
| Default/current branch | `main` |
| Reviewed commit | `341484a24f65efc871ac5fa3774db2888f9d1c47` |
| Remote comparison | `0` ahead / `0` behind `origin/main` after `git fetch origin --prune`; worktree clean |
| Application version | `2.0.13` in frontend, backend, health response, and changelog; Neon-quota handling and the cron socket-loss fix sit under `Unreleased` |
| Root package version | `1.0.0`; private workspace metadata, not the shipped application version |
| Latest relevant CI | Backend CI, Frontend CI, and Migrate and Deploy green on `341484a2` and `7968d19d` (2026-10-04) |
| CI failures since last review | Migrate and Deploy on `73306091` (2026-08-26) failed at "Apply database migrations" with Neon compute quota exceeded (`53000`); later runs are green |
| Release tags | `v2.0.13` → `5687e810` (unchanged); no new release tagged |
| Open pull requests | None |
| Production check | Railway `/api/health` and `/api/health/ready` returned HTTP 200, version `2.0.13` on 2026-10-04; `raktasetu`, `raktasetu-escalation`, and `raktasetu-retention` deployments SUCCESS |
| Custom domain check | **`raktasetu.in` returns NXDOMAIN on 2026-10-04** (no A/NS records via 1.1.1.1 and 8.8.8.8); WHOIS registry expiry `2026-08-12` (GoDaddy). Renew/recover before any cutover |
| Open tracked debt | [Issue #1: read-only transactions for pure GET paths](https://github.com/Chandrashekhar-Hegde/raktasetu-app/issues/1) |

The local `feat/user-ready-today` branch points at `e190efb0`, which is already an ancestor of `main`. It has no matching remote branch. Keep or delete it as a local cleanup choice; it is not unmerged work.

Remote `cursor/neon-quota-ready-ed36` is fully merged into `main` (PR #2) and can be deleted. Remote `gh-pages` last changed 2026-07-08 (`ff4ff049`, v1.0.3) and is not part of the current deploy path.

## Documentation status tags

| Tag | Meaning | Documents |
|-----|---------|-----------|
| **Active** | Maintained as current operating truth | `README.md`, `CONTRIBUTING.md`, `CHANGELOG.md`, this file, `docs/operational-readiness.md`, `docs/ops/*`, `docs/security/*` |
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
