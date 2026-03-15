# Secrets Rotation Policy

## Rotation Schedules
- API keys and OAuth client secrets: every 90 days.
- OAuth access tokens: auto-refresh before expiry (target window: within 30 minutes of expiration).
- Database credentials: every 180 days.
- Encryption secrets: every 180 days.

## Automation
Runtime utilities in `src/utils/secretsRotation.ts`:
- `rotateApiKey(keyName)`
- `rotateOAuthTokens()`
- `runScheduledRotationCheck()`

`runScheduledRotationCheck()` is cron-compatible and intended to be invoked by an external scheduler.

## Last-Rotation Markers
For API key schedule checks, use environment marker format:
- `${SECRET_KEY}_LAST_ROTATED_AT=<ISO timestamp>`

Example:
- `QUICKBOOKS_CLIENT_SECRET_LAST_ROTATED_AT=2026-01-01T00:00:00.000Z`

## Emergency Rotation Procedure
1. Identify compromised secret.
2. Rotate immediately via `rotateSecret` / provider console.
3. Revoke/disable old credential at upstream vendor.
4. Verify service health and integration connectivity.
5. Review `secrets_audit_log` for suspicious access patterns.
6. Backfill incident timeline with accessor + IP metadata.
