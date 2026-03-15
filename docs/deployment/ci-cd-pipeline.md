# CI/CD Pipeline

## Architecture

```text
PR -> backend-ci.yml (lint + typecheck + tests + build + audit)
   -> security.yml (dependency audit, optional CodeQL)

push develop -> backend-deploy-staging.yml
             -> Render Staging Deploy
             -> staging health check

workflow_dispatch (approved) -> backend-deploy-production.yml
                              -> Render Production Deploy
                              -> production health check
                              -> rollback guidance on failure
```

## Workflow Summary

- `.github/workflows/backend-ci.yml`
  - Triggers on pull requests and pushes to `main` for backend code paths.
  - Runs lint, TypeScript type checks, tests, dependency audit, and build verification.
- `.github/workflows/backend-deploy-staging.yml`
  - Triggers on pushes to `develop`.
  - Runs quality checks, deploys backend to Render staging, then executes health checks.
- `.github/workflows/backend-deploy-production.yml`
  - Triggered manually via `workflow_dispatch`.
  - Uses GitHub `production` environment for approval gating.
  - Runs quality checks, deploys backend to Render production, then executes health checks.
- `.github/workflows/security.yml`
  - Runs on pull requests and weekly schedule.
  - Executes dependency vulnerability scans for backend and frontend.
  - Runs optional CodeQL analysis when `ENABLE_CODEQL=true` in repository variables.

## Branch Strategy

- `feature/*` -> open PR into `develop`.
- `develop` -> auto-deploy backend to staging (Render staging service).
- `main` -> protected branch for release-ready commits.
- Production deployment is manual from selected `main` ref using workflow dispatch.

## Manual Approval Process

1. In GitHub repository settings, configure environment `production` with required reviewers.
2. Run `Backend Deploy Production` workflow with `git_ref` and `change_ticket`.
3. GitHub pauses job until reviewer approves deployment.
4. After approval, deployment and health checks continue automatically.

## Rollback Procedure

1. Open Render dashboard for production service.
2. Redeploy previous known-good release/commit.
3. Verify health endpoint configured by `PRODUCTION_HEALTHCHECK_URL`.
4. Revert problematic commit in GitHub if needed.
5. Re-run production workflow once fix is validated.

## Secrets Management

- Store deployment credentials in GitHub Actions secrets only.
- Never print secret values in workflow logs.
- Rotate Render and integration tokens quarterly or after incident response.
- Keep environment-scoped secrets (`staging`, `production`) separate.

See [github-secrets.md](/Users/arya/projects/xclsv-core-platform/docs/deployment/github-secrets.md) for the required key list.
