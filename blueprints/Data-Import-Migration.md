# Data Import & Migration Foundation Blueprint

## Overview
The Data Import & Migration foundation defines a consistent, auditable, and recoverable framework for ingesting external tabular data into the platform.

This blueprint standardizes patterns already proven in:
- WO-88 Event import flow (`src/services/eventImportService.ts`, `src/routes/imports/events.ts`)
- WO-92 Sign-up import flow (`src/services/signupImportService.ts`, `src/routes/imports/signups.ts`)

## Purpose
- Reduce one-off import implementations and inconsistent behavior.
- Guarantee traceability from source file to row-level result.
- Support safe migration at scale with partial-success and rollback controls.

## Use Cases
- Historical event backfills from spreadsheets.
- Legacy sign-up migration with duplicate suppression.
- Incremental imports from partner exports.
- Dry-run validation before production ingestion.

## Key Principles
1. Parse defensively: assume malformed CSV, mixed encodings, and ambiguous headers.
2. Validate before mutation: isolate parse/validation from write logic.
3. Keep imports idempotent: explicit duplicate strategies per domain.
4. Track every row: success, skip, error, and warning at row granularity.
5. Make rollback first-class: import actions must be reversible.
6. Expose progress and status: observable import lifecycle for UI and API clients.

## CSV Parsing
### Requirements
- Header detection in first N rows (default: 10).
- Delimiter auto-detection (`','`, `';'`, `'\t'`, `'|'`) with override support.
- Encoding detection and normalization (UTF-8 preferred).
- Streaming parse for large files to control memory usage.

### Practical Guidance
- Use parser stages: `decode -> tokenize -> header detect -> row map`.
- Keep raw row payload for diagnostics.
- Treat blank trailing lines as non-fatal.

## Column Mapping
### Requirements
- Flexible mapping by exact header, alias, or fallback index.
- Required/optional field distinction.
- Default values for missing optional fields.
- Computed field support (e.g., deriving first/last names).

### Practical Guidance
- Normalize incoming header text: lowercase, trim, replace spaces/symbols with `_`.
- Persist the resolved mapping in import metadata (`options` JSON).
- Allow per-import mapping overrides in API payload.

## Date Parsing
### Requirements
- Multiple input formats (ISO, US, short-year, partial-date).
- Timezone-aware storage strategy.
- Validation for impossible dates and out-of-range values.

### Practical Guidance
- Parse to normalized UTC timestamps for persistence.
- Keep source-format value in row log (`raw_data`) for audit.
- Reject ambiguous day/month formats unless explicitly configured.

## Duplicate Detection
### Methods
- Hash-based file dedupe (`sha256` on file content).
- External ID matching when source IDs are stable.
- Natural keys (e.g., signup email + operator + date).
- Fuzzy matching as advisory signal only (non-destructive default).

### Practical Guidance
- Domain-level strategy is mandatory before write phase.
- For partial imports, record duplicate decision per row (`action = duplicate`).

## Batch Processing
### Requirements
- Transaction strategy per batch, not per file by default.
- Configurable batch size (e.g., 100-1000 rows based on operation cost).
- Progress tracking with processed/total counters.
- Partial success support with row-level errors.

### Practical Guidance
- Use staged flow: `parse -> validate -> persist(batch) -> log`.
- Commit successful batches while retaining failed row details.

## Validation
### Types
- Field-level validation (format, type, ranges).
- Cross-field validation (date windows, conditional requirements).
- Referential integrity checks (operator, ambassador, event existence).

### Practical Guidance
- Separate validation rules from persistence layer.
- Emit machine-readable error codes for API/UI handling.

## Error Handling
### Categories
- Parse errors: malformed row structure.
- Validation errors: domain constraints not met.
- Persistence errors: DB conflicts/outages.
- Rollback errors: failed reversal actions.

### Practical Guidance
- Continue-on-error for row-level failures when safe.
- Fail-fast for schema/version mismatch and infrastructure faults.
- Always update import status terminal state on failure (`failed`/`partial`).

## Audit Logging
### Requirements
- Import-level metadata: filename, hash, actor, options, timestamps.
- Row-level status/action/message.
- Action-level audit entries for created/updated entities.

### Existing References
- Event import audit table: `event_import_audit_log` (WO-88).
- Signup import logs and row details: `signup_import_logs`, `signup_import_row_details` (WO-92).

## Rollback Procedures
### Requirements
- Batch rollback support for failed migration windows.
- Full import reversal endpoint for privileged users.
- Immutable rollback log with actor and timestamp.

### Practical Guidance
- Prefer soft-delete or reversible actions where possible.
- Mark import status as `rolled_back` after successful reversal.

## Status Tracking
### Suggested States
- `processing` -> `completed`
- `processing` -> `partial`
- `processing` -> `failed`
- `completed|partial` -> `rolled_back` (if reversible)

### Progress Reporting
- Include totals and processed counts in status APIs.
- Expose row-level details endpoints for support/debug flows.

## Integration Guidelines
- Reuse common parser/validator contracts from this blueprint.
- Keep route contract consistent across import types.
- Require dry-run option for all new import endpoints.
- Require summary + row-detail retrieval APIs.

## Implementation References
- Event import: `src/services/eventImportService.ts`, `src/routes/imports/events.ts`, `src/db/migrations/088_event_import.sql`
- Signup import: `src/services/signupImportService.ts`, `src/routes/imports/signups.ts`, `src/db/migrations/092_signup_import.sql`
