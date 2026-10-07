## Summary

<!-- What changed and why (1–3 bullets). -->

-

## Test plan

- [ ] A test that fails on the old code (route test with a real DB, or Playwright for UI flows)
- [ ] `npm --prefix backend run lint && npm --prefix backend test` with `TEST_DATABASE_URL` set (0 skipped)
- [ ] `npm --prefix frontend run lint && npm --prefix frontend test && npm --prefix frontend run build`
- [ ] `npm run test:e2e:full` (if UI, routing, auth or matching touched)
- [ ] New env vars documented in `.env.example`; new strings in both `en.json` and `kn.json`
- [ ] Invariants in `CLAUDE.md` still hold (RLS, privacy, cron, GIVERS)
- [ ] Documentation links/status tags checked (if docs or comments touched)
- [ ] No secrets or owner DB URLs in the diff
- [ ] `CHANGELOG.md` updated when user/ops-visible
- [ ] Release/tag impact stated (`none` is acceptable)

## Deploy notes

<!-- Migrations? Railway vars? Leave blank if N/A. Never set MIGRATION_DATABASE_URL on the app service. -->

## Linked issues

<!-- Use "Closes #…" only when this PR fully resolves the issue. -->
