# Frontend CDN and Caching Strategy (Vercel)

## Scope
- Frontend: Next.js app in `frontend/`
- Hosting/CDN: Vercel + Vercel Edge Network
- Current production URL: `https://xclsv-core-frontend.vercel.app`

## Vercel Edge Behavior
- Static assets are served from Vercel Edge and can be cached aggressively.
- Dynamic page responses can be cached at the edge with `s-maxage` + `stale-while-revalidate`.
- API routes should not be cached when they depend on auth/session state.

## Cache Policy by Asset Type
- Static assets (`/_next/static/*` and versioned files):  
  `Cache-Control: public, max-age=31536000, immutable`
- HTML/page responses (default app routes):  
  `Cache-Control: public, max-age=0, s-maxage=300, stale-while-revalidate=300`
- API routes (`/api/*`):  
  `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate`

## Why This Split
- 1-year immutable cache reduces repeated JS/CSS/image transfer.
- 5-minute edge cache for pages balances freshness and performance.
- No-cache APIs prevent stale authenticated or rapidly changing data.

## Source of Truth
- Header rules are configured in:
  - `frontend/vercel.json`
- Image optimization cache tuning is configured in:
  - `frontend/next.config.ts`

## Validation
Use response headers to verify behavior after deploy:
```bash
curl -I https://xclsv-core-frontend.vercel.app/
curl -I https://xclsv-core-frontend.vercel.app/_next/static/chunks/main.js
curl -I https://xclsv-core-frontend.vercel.app/api/health
```
