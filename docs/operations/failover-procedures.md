# Failover Procedures

## Preconditions
- Incident declared and owner assigned
- Latest status update posted in incident channel
- Decision to fail over approved by incident commander

## 1. Database Failover (Neon Branch/PITR)
1. Open Neon console and identify incident timestamp and last known good transaction window.
2. Create a restore branch from PITR timestamp.
3. Validate schema and row counts on restore branch.
4. Promote restore branch to active branch (or update connection string target).
5. Rotate `DATABASE_URL` in Render and restart backend.
6. Run post-failover smoke tests from `backup-restoration.md`.

## 2. Backend Service Failover (Render)
1. Open Render service dashboard for API.
2. Trigger redeploy from latest known-good GitHub commit.
3. Confirm deploy health checks pass (`/health`, `/health/live`, `/health/ready`).
4. Verify database connectivity and core API endpoints.
5. If deploy fails, roll back to previous stable deploy.

## 3. Frontend Failover (Vercel)
1. Open Vercel project deployments.
2. Promote or redeploy latest known-good production deployment.
3. Validate homepage, auth flow, and key dashboard routes.
4. Confirm frontend can reach backend API successfully.

## 4. DNS/Routing Failover
- Current architecture is single-region managed services; explicit DNS failover is not required.
- If future multi-region routing is added, update this section with provider-specific routing switch steps.

## Communication Checklist
1. Post status every 15 minutes during active incident.
2. Capture each failover action and timestamp.
3. Announce restoration complete when all Tier 1 services pass checks.
