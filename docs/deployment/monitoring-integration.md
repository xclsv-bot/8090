# Monitoring Integration

## Render Log Integration
- Stream Render service logs to an external aggregator using Render log drains.
- Preserve JSON payloads from `pino`; do not flatten fields during ingestion.
- Index `trace.correlationId`, `trace.traceId`, `request.url`, and `response.statusCode`.

## External Observability Options
- Datadog:
  - Ingest logs via Datadog HTTP intake or agent.
  - Scrape `/health/metrics` (Prometheus text) with OpenMetrics integration.
- CloudWatch:
  - Forward Render logs through a webhook/log shipper into CloudWatch Logs.
  - Create metric filters for error rate and latency thresholds.
- ELK/OpenSearch:
  - Use Filebeat/Logstash-compatible drain target.
  - Build index templates for request and trace fields.

## Environment Variables
- `LOG_LEVEL`: controls runtime log verbosity.
- `NODE_ENV`: affects log transport and response error detail.
- `DATABASE_URL`, `REDIS_URL`: required for dependency health checks.

## Verification Checklist
1. Confirm `/health` returns dependency and runtime details.
2. Confirm `/health/metrics` returns JSON and Prometheus text with `Accept: text/plain`.
3. Trigger a test alert condition in non-production and validate notification placeholder logs.
4. Validate correlation IDs appear across request start, completion, and error logs.
