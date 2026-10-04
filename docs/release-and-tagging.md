# Release and tagging policy

> **Status:** Active
>
> **Last reviewed:** 2026-08-11

RaktaSetu uses SemVer tags in the form `vMAJOR.MINOR.PATCH`. Tags identify shipped application releases; they are not created for every documentation commit.

## Sources of truth

Before tagging, these must agree:

- `backend/package.json`
- `frontend/package.json`
- the matching `CHANGELOG.md` release heading
- `/api/health` version behavior, which reads the backend package version

The root `package.json` is private workspace metadata and currently remains at `1.0.0`; it is not the deployable application version.

Current published baseline: annotated tag `v2.0.13` points to verified release commit `5687e810382be470be10805a161942490afa848c`. Earlier changelog releases remain untagged until their exact boundaries are verified.

## Tag a release

1. Fetch and confirm the release commit is on `origin/main` with no divergence.
2. Confirm the worktree is clean and required CI/deployment checks are green.
3. Move all shipped notes out of `Unreleased` into a dated version section.
4. Verify the frontend and backend versions match the changelog.
5. Create an annotated tag at the exact release commit:

   ```bash
   git tag -a v2.0.13 <release-commit> -m "RaktaSetu v2.0.13"
   git show --no-patch --decorate v2.0.13
   ```

6. Push that exact tag only after verifying its target:

   ```bash
   git push origin v2.0.13
   ```

7. If GitHub Releases are used, copy the matching changelog section and link operational caveats. Do not claim compliance certification.

## Historical backfill

Do not guess tag boundaries from changelog dates alone. For each missing historical tag:

- find the commit where both deployable package versions reached the release number;
- confirm the changelog content and any deployment evidence;
- record uncertainty instead of tagging an ambiguous commit;
- never move or overwrite a published tag silently.

Annotated tags preserve the tagger, date, and release message. If a published tag is wrong, document the correction and coordinate it explicitly before replacing the tag.
