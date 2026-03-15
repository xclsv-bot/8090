# Local Secrets Workflow

## Local Development Source
Use `.env.local` for local secrets. `src/config/env.ts` loads `.env.local` before `.env`.

## Rules
- Never commit real credentials.
- Keep `.env.local` out of version control.
- Use `.env.example` for placeholders and onboarding.

## Getting Secrets for Local Dev
1. Request scoped credentials from platform admins.
2. Store shared team credentials in approved vault tooling (1Password or Bitwarden).
3. Copy values into local `.env.local`.
4. Start backend and confirm `validateSecrets()` passes.

## Recommended Local Provider
Set:
- `SECRET_PROVIDER=local`

This keeps local testing behavior aligned with the secrets abstraction while still using environment variables.

## Rotation and Testing
- Use test credentials where possible.
- If secrets are rotated, update `.env.local` immediately.
- For OAuth credentials, re-run OAuth connection flow if provider revokes old client tokens.
