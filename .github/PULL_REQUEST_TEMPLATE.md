## Summary

<!-- What changed and why (1–3 bullets). -->

-

## Test plan

- [ ] `npm --prefix backend run lint && npm --prefix backend test`
- [ ] `npm --prefix frontend run lint && npm --prefix frontend test && npm --prefix frontend run build`
- [ ] Playwright smoke (if UI/routing touched)
- [ ] Documentation links/status tags checked (if docs or comments touched)
- [ ] No secrets or owner DB URLs in the diff
- [ ] `CHANGELOG.md` updated when user/ops-visible
- [ ] Release/tag impact stated (`none` is acceptable)

## Deploy notes

<!-- Migrations? Railway vars? Leave blank if N/A. Never set MIGRATION_DATABASE_URL on the app service. -->

## Linked issues

<!-- Use "Closes #…" only when this PR fully resolves the issue. -->
