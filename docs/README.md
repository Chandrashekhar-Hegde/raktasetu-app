# Documentation index

## Start here

| Doc | Status | Audience |
|-----|--------|----------|
| [../README.md](../README.md) | Active | Run locally, live URL, feature overview |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | Active | PR workflow, checks, secrets hygiene |
| [repository-health.md](./repository-health.md) | Active | Git/GitHub health, documentation inventory, tracked debt |
| [release-and-tagging.md](./release-and-tagging.md) | Active | Release versioning and Git tags |
| [ops/ci-cd.md](./ops/ci-cd.md) | Active | GitHub Actions + Railway deploy |
| [ops/domain-cutover.md](./ops/domain-cutover.md) | Active until cutover | `raktasetu.in` cutover and rollback |
| [operational-readiness.md](./operational-readiness.md) | Active | Release gates, invites, retention, incidents |
| [security/security-controls.md](./security/security-controls.md) | Active | Security control inventory (not a compliance certificate) |
| [security/credential-rotation-runbook.md](./security/credential-rotation-runbook.md) | Active | Credential rotation and verification |
| [../CHANGELOG.md](../CHANGELOG.md) | Active | Release history |

## Layout

```
docs/
  README.md                 ← this index
  repository-health.md      ← branch, CI, docs, and issue snapshot
  release-and-tagging.md    ← release metadata policy
  operational-readiness.md  ← ops runbooks
  ops/ci-cd.md              ← CI/CD and branch protection
  security/                 ← security controls
  superpowers/
    specs/                  ← design specs (historical + active)
    plans/                  ← implementation plans
```

- **specs/** — product/design decisions and acceptance criteria  
- **plans/** — step-by-step implementation notes  
- **ops/** + **operational-readiness** — how production is run today  
- **security/** — controls and threat-oriented notes; no false compliance claims

Root-level historical reports (`STRESS_TEST_REPORT.md`, `red-team-input-fuzzing-report.md`, `plan.md`, `DEPLOYMENT_PLAN.md`) are archival; prefer this tree and the changelog for current truth.

Status definitions and the full active/reference/archive inventory are maintained in [repository-health.md](./repository-health.md).
