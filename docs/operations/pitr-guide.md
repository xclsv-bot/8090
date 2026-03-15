# Neon Point-in-Time Recovery (PITR) Guide

## When to Use PITR
- Data corruption or destructive writes in production
- Application deployment introduced bad data changes
- Need to recover to state before incident timestamp

## Steps
1. Identify incident time window:
   - Determine earliest bad write timestamp.
   - Choose recovery target just before first bad write.
2. In Neon console:
   - Select project and production branch.
   - Choose `Restore` / `Create branch from point in time`.
   - Set target timestamp.
3. Validate recovery branch:
   - Run row-count spot checks for critical tables.
   - Confirm schema/migrations are intact.
   - Verify recent expected records exist.
4. Promote recovery branch or point application to it.
5. Redeploy backend to pick up updated `DATABASE_URL` if needed.

## Choosing Recovery Point
- Start from incident detection time and move backwards in 1-5 minute increments.
- Verify business-critical entities first (events, signups, payroll, financial records).
- Prefer the latest valid point to minimize RPO impact.

## Recovery Test Procedure
1. Run PITR into non-production branch monthly.
2. Execute smoke query suite and application connectivity checks.
3. Record result in `backup_tests` table and DR test report.

## Post-Recovery Verification Checklist
- [ ] Backend health endpoints return success
- [ ] Frontend can authenticate and load core routes
- [ ] Critical tables have expected row counts
- [ ] No migration drift between recovered branch and expected schema
- [ ] Background jobs resume without persistent errors
- [ ] Incident timeline and final RCA captured
