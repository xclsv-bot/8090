# Disaster Recovery Plan

## Objectives
- RTO target: 1 hour
- RPO target: 15 minutes
- Scope: Neon PostgreSQL, Render backend API, Vercel frontend

## Service Tiers
- Tier 1 (Critical): PostgreSQL, backend API, authentication, payment-related processing
- Tier 2 (High): Reporting, dashboards, exports, integrations
- Tier 3 (Standard): Non-critical batch workflows, internal admin utilities

## Recovery Priority Order
1. Database availability and data integrity (Neon)
2. Backend API restoration (Render)
3. Frontend restoration (Vercel)
4. Background jobs and non-critical integrations

## Backup Strategy
- Database logical backups every 15 minutes (metadata tracked in `backup_records`)
- Neon PITR maintained as primary rapid restore mechanism
- Retention:
  - Database backups: 30 days
  - Configuration backups: 90 days
  - Application state backups: 30 days
- Verification cadence:
  - Monthly integrity validation via `scripts/verify-backup.ts`
  - Quarterly full restoration drill

## Roles and Escalation
- Incident Commander: Engineering Manager (or delegated on-call lead)
- Primary Technical Owner: Backend Platform Engineer
- Database Escalation: Neon project owner
- Infrastructure Escalation: Render/Vercel owner

## Contact List
- On-call Engineering: `#platform-oncall`
- Backend Team Lead: `backend-lead@xclsv.example`
- Infrastructure Owner: `infra@xclsv.example`
- Data Owner: `data-platform@xclsv.example`
- Executive Escalation: `engineering-management@xclsv.example`

## Incident Activation
1. Declare DR incident in engineering incident channel.
2. Assign incident commander and scribe.
3. Capture incident start time and impacted systems.
4. Execute failover runbook in priority order.
5. Track recovery milestones against RTO/RPO objectives.
