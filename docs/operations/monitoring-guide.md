# Monitoring Guide

## Architecture Overview
- Backend (`Fastify` on Render) emits structured logs via `pino` and request metrics through `metricsService`.
- Health routes expose dependency status (`/health`) and metrics (`/health/metrics`).
- Alert evaluation runs continuously from request lifecycle hooks using metric snapshots.
- Frontend (`Next.js` on Vercel) should forward `x-correlation-id` when calling backend APIs.

## Available Metrics
- HTTP:
  - total requests
  - 5xx error count + error rate
  - latency (`avg`, `p50`, `p95`, `p99`)
  - status code counters
- Database:
  - query count
  - query error count + error rate
  - query latency histogram
  - pool stats (max/total/idle/waiting)
- Runtime:
  - process uptime
  - CPU user/system seconds
  - memory usage and heap utilization

## Endpoints
- `GET /health`: readiness/dependency and runtime snapshot.
- `GET /health/metrics`:
  - JSON default response with structured metrics and alert state.
  - Prometheus text output when `Accept: text/plain` is set.

## Dashboard
- Base dashboard template: `monitoring/dashboards/system-health.json`.
- Import the JSON into Grafana or translate panel definitions into Datadog widgets.

## Log Search and Analysis
- Always filter by `trace.correlationId` first.
- Follow request lifecycle with:
  - `Incoming request`
  - `Request completed`
  - `Request error`
- Use `trace.traceId` for distributed flow tracing when multiple services are involved.

## Adding New Metrics
1. Add recording logic in `src/services/metricsService.ts`.
2. Record data at the integration point (route hook, DB service, background job).
3. Extend Prometheus formatter in `toPrometheusFormat()`.
4. Add panel definitions to `monitoring/dashboards/system-health.json`.
5. Add alert rules in `src/config/alerts.ts` when metric thresholds matter.
