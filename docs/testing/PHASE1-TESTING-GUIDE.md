# Phase 1 Testing Guide

## Overview

This guide covers the Phase 1 testing suite for the Core Platform foundation:

- Core infrastructure validation (WO-19)
- Shared data model and schema validation (WO-20)
- WebSocket real-time event system validation (WO-21)

Phase 1 tests live in `src/tests/phase1` and are focused on platform-critical behavior, migration safety, and connection/event propagation quality.

## Test Structure

`src/tests/phase1` contains:

1. `core-platform-services.test.ts`
2. `websocket-gateway.test.ts`
3. `realtime-event-propagation.test.ts`
4. `database-schema-validation.test.ts`
5. `database-migrations.test.ts`
6. `websocket-performance.test.ts`
7. `cross-component-integration.test.ts`
8. `data-model-mapping.test.ts`
9. `acceptance-criteria-validation.test.ts`

## Running Tests

Run all Phase 1 tests:

```bash
vitest run src/tests/phase1
```

Run with Phase 1 coverage settings:

```bash
npm run test:phase1:coverage
```

## Coverage Reporting

Phase 1 coverage config is in `vitest.config.phase1.ts`.

- Thresholds: `>80%` for lines, functions, branches, statements
- Reporters: text, HTML, JSON
- Output directory: `coverage/phase1`

After coverage runs:

- Open `coverage/phase1/index.html` for HTML report
- Use `coverage/phase1/coverage-final.json` for machine-readable output

## Common Testing Patterns

- `vi.mock(...)` is used to isolate database and Clerk dependencies.
- WebSocket behavior is tested with real `ws` client sessions for gateway-level behavior.
- SQL/schema tests rely on static validation of migration and schema files to avoid destructive DB operations.
- Event propagation tests validate role- and subscription-aware filtering through `eventPublisher`.

## Troubleshooting

If WebSocket tests fail intermittently:

1. Ensure no stale process is using the selected test port.
2. Re-run the suite serially with `vitest run src/tests/phase1 --maxWorkers=1`.
3. Check that mocked Clerk token responses align with token values used in tests.

If migration tests fail:

1. Confirm migration file names in `src/db/migrations` match expectations.
2. Validate `-- UP` and `-- DOWN` sections for reversible migrations.
3. Check `src/db/migrate-all.ts` for transaction wrapper changes.

If coverage is below threshold:

1. Run `npm run test:phase1:coverage`.
2. Inspect uncovered lines in `coverage/phase1/index.html`.
3. Add targeted tests for uncovered branches in auth, WebSocket filtering, and migration code paths.
