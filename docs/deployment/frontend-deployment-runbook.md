# Frontend Deployment Runbook

## Pre-Deployment Checklist
1. PR approved and CI checks passing:
   - Lint
   - Type check
   - Build
2. Vercel env vars verified for target environment.
3. Clerk keys verified for environment (Preview vs Production).
4. `NEXT_PUBLIC_API_URL` points to correct backend.
5. No unresolved incidents affecting backend/auth.

## Deployment Steps
1. Merge approved PR to `main`.
2. Confirm Vercel production deployment starts.
3. Monitor deployment logs until status is `Ready`.
4. Validate production URL:
   - `https://xclsv-core-frontend.vercel.app`

## Post-Deployment Verification
1. Open key routes: `/`, `/events`, `/ambassadors`, `/signups`.
2. Validate sign-in/sign-out with Clerk.
3. Confirm authenticated API calls succeed.
4. Check cache headers:
   - Static assets return immutable 1-year cache.
   - HTML routes return `s-maxage=300`.
   - API routes return `no-store`.

## Rollback Procedure
1. In Vercel, identify previous known-good deployment.
2. Promote/redeploy that deployment to Production.
3. Re-run smoke checks and auth flow verification.
4. If issue is code regression, revert commit in Git and redeploy.

## Monitoring and Alerts
- Vercel deployment status and runtime errors.
- Frontend console/network errors via browser monitoring tool.
- Clerk authentication error rates.
- Backend API availability and latency (impacts frontend UX).

## Incident Notes Template
- Deployment ID:
- Timestamp:
- Impacted routes/users:
- Root cause:
- Rollback deployment ID:
- Follow-up actions:
