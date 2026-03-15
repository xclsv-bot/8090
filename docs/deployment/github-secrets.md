# GitHub Actions Secrets

## Required Secrets

Set repository or environment-level secrets in GitHub:

- `RENDER_API_KEY`
  - Render API token used to trigger deploys.
- `RENDER_STAGING_SERVICE_ID`
  - Render service ID for staging backend.
- `RENDER_PRODUCTION_SERVICE_ID`
  - Render service ID for production backend.
- `STAGING_HEALTHCHECK_URL`
  - Full URL used after staging deploy (example: `https://staging-api.example.com/health`).
- `PRODUCTION_HEALTHCHECK_URL`
  - Full URL used after production deploy (example: `https://api.example.com/health`).

## Optional Secrets / Variables

- `SNYK_TOKEN`
  - Needed only if adding Snyk scanning workflow.
- Repository variable `ENABLE_CODEQL=true`
  - Enables CodeQL job in `security.yml`.

## Scope Recommendations

- Keep `RENDER_API_KEY` at repository level only if same token is allowed for both envs.
- Prefer environment-level secrets for service IDs and URLs:
  - `staging` environment: staging service ID + staging health URL.
  - `production` environment: production service ID + production health URL.

## Rotation Procedure

1. Generate new token in Render dashboard.
2. Update GitHub secret(s) with new value.
3. Trigger staging deploy workflow to validate.
4. Trigger production deploy workflow with approval gate.
5. Revoke old token in Render only after successful validation.
6. Document rotation date and owner in security log.

## Security Practices

- Never commit secrets to source control.
- Restrict environment approvals for `production`.
- Use least-privilege API tokens where possible.
- Enable branch protection and required status checks for `main`.
