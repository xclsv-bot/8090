# Secrets Management Infrastructure

## Overview
The platform now uses a centralized `SecretsService` (`src/services/secretsService.ts`) to standardize runtime secret retrieval, updates, rotation, and audit logging.

## Provider Options
- `render`: Uses runtime Render Environment Variables (current production default).
- `aws`: Reserved adapter for AWS Secrets Manager (interface implemented, backend integration pending).
- `local`: Uses local process environment (`.env.local`) for development.

Configure provider via:
- `SECRET_PROVIDER=render|aws|local`

## Secret Key Definitions
Secrets are type-safe and centralized in:
- `src/config/secrets.ts` (`SecretKey` enum + `SECRET_METADATA`)

To add a new secret:
1. Add it to `SecretKey`.
2. Add `SecretMetadata` entry (required flag + rotation interval).
3. Add placeholder in `.env.example`.
4. Update docs if operationally relevant.

## Access Control Model
`SecretsService` operations:
- `getSecret`: runtime read.
- `listSecretKeys`: inventory visibility.
- `setSecret`: admin-only (`isAdmin: true` required).
- `rotateSecret`: admin-only.

Admin checks are enforced in-service before secret mutation.

## Audit Logging
All secret operations are audited through `SecretsAuditService` into `secrets_audit_log`:
- `secret_key`
- `operation`
- `accessor`
- `ip`
- `timestamp`

Migration file:
- `src/db/migrations/124_secrets_audit_log.sql`

## Runtime Validation
Critical secrets are validated at startup via `validateSecrets()` (`src/config/secrets.ts`) and called from:
- `src/config/env.ts`
- `src/index.ts`

If required secrets are missing, startup fails with provider-specific remediation guidance.
