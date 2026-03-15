# Backup Restoration Runbook

## Purpose
Restore PostgreSQL data from the most recent valid backup metadata record and return service to normal operation.

## Restore Procedure
1. Locate latest verified backup:
   - Query `backup_records` for `type = 'database'` and `verified_at IS NOT NULL`.
2. Prepare target database branch/environment:
   - Create temporary restore branch (preferred) in Neon.
3. Restore data:
   - For `pg_dump` file backups: run `psql` restore into target branch.
   - For Neon PITR-based restore: follow `pitr-guide.md`.
4. Validate restoration:
   - Row counts for critical tables.
   - Referential integrity checks.
   - Recent transaction sanity checks.
5. Reconnect application:
   - Update `DATABASE_URL` if branch changed.
   - Redeploy backend on Render.
6. Run smoke tests and monitor logs for 30 minutes.

## Data Verification Procedure
- Compare row counts on `events`, `signups`, `payroll_entries`, and `financial` tables.
- Run targeted queries for records created near incident window.
- Verify no unexpected null spikes in required columns.

## Post-Restore Smoke Tests
- `GET /health` returns healthy
- `GET /events` returns expected records
- `GET /signups` and `GET /payroll` return valid payloads
- Create/update flow for one low-risk test entity succeeds
