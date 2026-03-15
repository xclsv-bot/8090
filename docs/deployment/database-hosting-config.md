# Database Hosting Configuration (Neon PostgreSQL)

## Provider and Topology
- **Provider:** Neon PostgreSQL
- **Environment:** Separate branch/database per environment (`staging`, `production`)
- **Connection string:** `DATABASE_URL` secret in platform configuration

## Connection Pool Settings
Configured via environment variables consumed by `src/db/connection-pool.ts`:
- `DB_POOL_MAX` (default `20`)
- `DB_POOL_MIN` (optional)
- `DB_POOL_IDLE_TIMEOUT_MS` (default `30000`)
- `DB_POOL_CONNECTION_TIMEOUT_MS` (default `10000`)
- `DB_POOL_QUERY_TIMEOUT_MS` (default `15000`)
- `DB_QUERY_RETRY_ATTEMPTS` (default `3`)
- `DB_QUERY_RETRY_BACKOFF_MS` (default `200`)

Recommended production defaults:
- Min instances: 2
- Max pool per instance: 25
- Effective connection ceiling: `instances * pool_max` must remain under Neon plan limits

## Reliability Controls
- Retries enabled for transient Postgres/network error codes.
- Readiness endpoint requires successful DB check.
- Graceful shutdown closes pool on SIGTERM/SIGINT.

## Backup and Recovery
- Use Neon point-in-time restore and branch-based recovery.
- Keep schema migrations versioned in `src/db/migrations`.
- Recovery workflow:
  1. Create restore branch at incident timestamp.
  2. Validate schema and key tables.
  3. Promote or replay into production branch.

## Monitoring
Track:
- Connection saturation (`waitingCount`, `totalCount`)
- Query timeouts and retry counts
- Slow query p95/p99
- Error rates (`5xx`, DB errors)

Use:
- Neon dashboard metrics
- Render service metrics and logs
- Application logs (`Database query failed`, retry warnings)
