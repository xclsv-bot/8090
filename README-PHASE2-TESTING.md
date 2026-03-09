# Phase 2 Testing - Foundation Data Models

## Overview

This document covers Phase 2 test execution for foundational data models, integration behavior, authentication, relationships, migrations, and documentation checks.

Test files are located in:

- `src/tests/phase2/`

## Test Structure

Phase 2 suite includes:

- Foundation model tests: ambassador, event, signup, chat, financial, payroll, cpa/operator, availability, integrations
- Integration tests: CRUD behavior, relationship integrity
- Platform tests: authentication/authorization, migrations
- Workflow tests: end-to-end lifecycle coverage
- Quality tests: coverage thresholds and documentation validation

## Running Tests

Run all Phase 2 tests:

```bash
npm run test:phase2
```

Run Phase 2 tests with coverage:

```bash
npm run test:phase2 -- --coverage
```

Run a single file:

```bash
npx vitest run src/tests/phase2/ambassador.test.ts
```

## Coverage Requirements

Phase 2 enforces minimum thresholds:

- Lines: `>= 80%`
- Functions: `>= 80%`
- Branches: `>= 80%`
- Statements: `>= 80%`

Coverage reports:

- Terminal text output
- HTML report under `coverage/`

## Test Data Setup

The Phase 2 tests are intentionally lightweight and deterministic:

- No external network dependencies
- No live database dependency for model/unit tests
- File-based validation for migration and schema checks

## Common Testing Patterns

Patterns used for consistency with existing `src/tests/` conventions:

- Arrange/Act/Assert style assertions
- Small deterministic helper functions in each test file
- Explicit status and transition table checks
- Mocked CRUD and workflow behavior for integration-level logic

## Troubleshooting

If tests fail:

1. Ensure dependencies are installed: `npm install`
2. Verify the test environment: `NODE_ENV=test`
3. Confirm required project files exist under `src/types/` and `src/db/`
4. Re-run with verbose output: `npx vitest run src/tests/phase2 --reporter=verbose`

If coverage fails threshold checks:

1. Run `npm run test:phase2 -- --coverage`
2. Open `coverage/index.html`
3. Add targeted tests for uncovered branches/functions in impacted modules

## Acceptance Criteria Checklist

- [x] AC-TEST-2.2 Data model field and validation checks
- [x] AC-TEST-2.3 CRUD integration behavior checks
- [x] AC-TEST-2.4 Authentication and RBAC checks
- [x] AC-TEST-2.5 Constraint and migration validation checks
- [x] AC-TEST-2.6 Referential integrity checks
- [x] AC-TEST-2.7 Coverage threshold validation (>=80%)
- [x] AC-TEST-2.8 Cross-entity workflow and relationship tests
- [x] AC-TEST-2.9 Status-code behavior coverage in CRUD tests
- [x] AC-TEST-2.10 Documentation completeness validation

