# Logging Standards

## Conventions
- Use structured JSON logs only.
- Include `request.id`, `trace.correlationId`, and `trace.traceId` in request-scoped logs.
- Prefer contextual fields over concatenated message strings.

## Log Levels
- `debug`: verbose development diagnostics.
- `info`: expected lifecycle events (request start/end, service startup).
- `warn`: recoverable issues and alert firing notifications.
- `error`: failed requests or operations requiring investigation.

## Correlation IDs
- Inbound headers supported:
  - `x-correlation-id`
  - `x-request-id`
- If absent, backend generates a UUID.
- Response echoes `x-correlation-id` and `x-trace-id`.

## Sensitive Data Handling
- The logging service redacts sensitive keys recursively:
  - `authorization`, `cookie`, `password`, `token`, `secret`, `apiKey`, `accessToken`, `refreshToken`, `ssn`, `creditCard`
- Never log raw credentials, session tokens, or full payment artifacts.
- For error logging, use serialized error objects; avoid dumping unbounded payloads.
