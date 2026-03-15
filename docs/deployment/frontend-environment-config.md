# Frontend Environment Configuration (Next.js + Vercel)

## Runtime Model
- Client-exposed variables must be prefixed with `NEXT_PUBLIC_`.
- Server-only variables must not use `NEXT_PUBLIC_`.
- Vercel injects environment variables per environment (Development, Preview, Production).

## Required Variables
Documented in `frontend/.env.example`:

### Client-safe (`NEXT_PUBLIC_*`)
- `NEXT_PUBLIC_APP_ENV` (`development|preview|production`)
- `NEXT_PUBLIC_APP_URL` (frontend base URL)
- `NEXT_PUBLIC_API_URL` (backend API base URL)
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL`
- `NEXT_PUBLIC_CLERK_SIGN_UP_URL`
- `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL`
- `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL`

### Server-only
- `CLERK_SECRET_KEY`

## Vercel Environment Mapping
- Development:
  - Local `.env.local` or Vercel development env values.
  - `NEXT_PUBLIC_API_URL=http://localhost:4000`
- Preview (PR deployments):
  - Points to staging backend.
  - Non-production Clerk project/keys.
- Production:
  - Points to production backend.
  - Production Clerk keys only.

## Injection and Build Notes
- `frontend/next.config.ts` provides defaults for:
  - `NEXT_PUBLIC_API_URL`
  - `NEXT_PUBLIC_APP_ENV`
- Explicit Vercel env values should still be set for Preview/Production.
- Any change to environment variables requires redeploy for build-time values.

## Security Rules
- Never commit real keys to git.
- Keep `CLERK_SECRET_KEY` only in Vercel secrets/env config.
- Rotate Clerk keys according to security policy and redeploy.
