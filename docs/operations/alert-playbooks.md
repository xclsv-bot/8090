# Alert Playbooks

## Severity Levels
- `critical`: immediate production impact, page on-call immediately.
- `warning`: degraded behavior, triage during active support window.
- `info`: non-urgent signal, monitor trend.

## Alert: HTTP Error Rate High (`>5%`)
1. Check `/health` for database/redis degradation.
2. Review recent `Request error` logs grouped by `trace.correlationId`.
3. Confirm whether failures are isolated to a specific route.
4. Mitigate by rollback or feature-flag disable if a recent deploy caused regression.

## Alert: HTTP P99 Latency High (`>2000ms`)
1. Inspect endpoint-level latency distribution and status code mix.
2. Check DB pool waiting count and query latency metrics.
3. Identify slow queries from DB debug logs and optimize/index as needed.
4. Scale backend instances if saturation is confirmed.

## Alert: Database Error Rate High (`>3%`)
1. Verify Neon connectivity and credentials.
2. Check pool error count and waiting queue growth.
3. Triage query-level failures (timeouts, syntax, connection reset).
4. Apply retry/backoff tuning only after root cause is identified.

## Alert: Heap Usage High (`>85%`)
1. Compare heap growth trend over 15+ minutes.
2. Check recent high-volume endpoints and payload sizes.
3. Restart instance only as short-term mitigation.
4. Capture heap profile and fix leak/source allocation pattern.

## Escalation
- Primary: backend on-call engineer.
- Secondary: platform owner.
- Incident commander assigned for any `critical` alert active > 15 minutes.
