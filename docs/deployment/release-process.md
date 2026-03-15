# Release Process

## Release Cadence

- Merge validated work into `main` using reviewed PRs.
- Use semantic version tags: `vMAJOR.MINOR.PATCH`.
- Patch: bug fixes, Minor: backward-compatible features, Major: breaking changes.

## How To Cut A Release

1. Ensure `develop` is green and staging checks pass.
2. Create PR from `develop` to `main` and get required approvals.
3. Merge PR to `main`.
4. Create and push tag:

```bash
git checkout main
git pull
git tag vX.Y.Z
git push origin vX.Y.Z
```

5. Trigger `Backend Deploy Production` workflow and set:
   - `git_ref`: release tag (`vX.Y.Z`) or release commit SHA.
   - `change_ticket`: ticket/incident/release reference.
6. Approve production deployment when prompted by GitHub environment gate.

## Version Bumping Strategy

- Keep versioning tied to release tags for deployment traceability.
- Update backend `package.json` version as part of release PR when required.
- Frontend versioning can follow matching tag or independent UI tag if needed.

## Changelog Generation

Recommended options:

1. Conventional commits + automated changelog tool (preferred).
2. GitHub release notes generated from merged PRs.
3. Manual changelog section in release PR for urgent/hotfix releases.

Minimum changelog sections per release:

- Added
- Changed
- Fixed
- Security

## Communication Plan

Before production deploy:

- Share release scope, expected impact, and rollback owner in engineering channel.
- Confirm on-call owner and monitoring window.

After production deploy:

- Post deployment run URL, deployed ref/tag, and health-check result.
- If incident occurs, provide timeline and rollback status updates every 15 minutes until stable.
