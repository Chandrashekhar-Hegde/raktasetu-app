# Repository health

> **Status:** Active operational reference
>
> **Last reviewed:** 2026-08-11 (Asia/Kolkata)
>
> **Review scope:** Git/GitHub state, release metadata, documentation, comments, and tracked debt. No runtime behavior.

## Snapshot

| Check | Result |
|-------|--------|
| Canonical repository | `Chandrashekhar-Hegde/raktasetu-app` |
| Default/current branch | `main` |
| Reviewed commit | `5687e810382be470be10805a161942490afa848c` |
| Remote comparison | `0` ahead / `0` behind `origin/main` after `git fetch origin --prune` |
| Application version | `2.0.13` in frontend, backend, health response, and changelog |
| Root package version | `1.0.0`; private workspace metadata, not the shipped application version |
| Latest relevant CI | Backend CI, Frontend CI, and Migrate and Deploy are green; the reviewed head is docs-only and is outside workflow path filters |
| Release tags at review start | None |
| Published during review | Annotated tag `v2.0.13` → `5687e810382be470be10805a161942490afa848c` |
| Production check | Railway `/api/health` returned HTTP 200, `healthy`, version `2.0.13` on 2026-08-11 |
| Custom domain check | `raktasetu.in` still served a registrar parking lander on 2026-08-11; cutover remains pending |
| Open tracked debt | [Issue #1: read-only transactions for pure GET paths](https://github.com/Chandrashekhar-Hegde/raktasetu-app/issues/1) |

The local `feat/user-ready-today` branch points at `e190efb0`, which is already an ancestor of `main`. It has no matching remote branch. Keep or delete it as a local cleanup choice; it is not unmerged work.

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
