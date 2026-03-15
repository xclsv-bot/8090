# Frontend Deployment Pipeline (Vercel)

## Triggering Model
- Git provider: GitHub repository connected to Vercel project.
- Push to feature branch:
  - Creates Preview deployment URL automatically.
- Pull Request:
  - Preview deployment updates on each commit.
- Merge to `main`:
  - Triggers Production deployment.

## Pipeline Stages
1. Install dependencies (`npm ci`)
2. Lint/type/build checks in CI (`.github/workflows/frontend-ci.yml`)
3. Vercel build (`npm run build`)
4. Edge deployment and routing activation

## Promotion Flow
- Preview deployments validate branch changes.
- Production deployment occurs after merge to `main`.
- Optional manual gate can be enforced with:
  - GitHub branch protection + required CI checks
  - Vercel deployment protection (team settings)

## Rollback
- Vercel dashboard:
  1. Open project deployments.
  2. Select last known good deployment.
  3. Promote/redeploy to production.
- Git rollback alternative:
  - Revert merge commit in GitHub and redeploy.

## Clerk/Auth Considerations
- Preview and Production must use environment-specific Clerk keys.
- Verify sign-in and token forwarding after every deployment.

## Operational Verification
- Home page loads and navigation works.
- Auth flow (`/sign-in`, protected routes) works.
- API-backed pages resolve using `NEXT_PUBLIC_API_URL`.
- CDN cache headers match `frontend/vercel.json`.
