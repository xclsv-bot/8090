# Historical Data Import - Backend API Layer

This module provides the complete backend API for the Historical Data Import feature. It enables administrators to upload, validate, reconcile, and import historical data through a structured workflow with comprehensive error handling and audit trails.

## API Endpoints

### File Upload and Parsing

**POST `/api/admin/imports/parse`**

Accepts multipart form data with a file (CSV or Excel) and returns parsed preview data.

**Request:**
- Content-Type: `multipart/form-data`
- Field: `file` - The CSV or Excel file to parse

**Response:**
```json
{
  "file_id": "uuid",
  "file_name": "signups.csv",
  "file_size_bytes": 12345,
  "mime_type": "text/csv",
  "total_rows": 500,
  "preview_rows": [...],
  "columns_detected": ["name", "email", "phone"],
  "parsing_errors": [],
  "detected_data_types": ["sign_ups"],
  "created_at": "2024-01-15T10:00:00Z",
  "expires_at": "2024-01-16T10:00:00Z"
}
```

---

### Validation

**POST `/api/admin/imports/validate`**

Validates parsed data against business rules.

**Request:**
```json
{
  "file_id": "uuid",
  "data_types": ["sign_ups"],
  "validation_mode": "strict"
}
```

**Response:**
```json
{
  "file_id": "uuid",
  "validation_passed": true,
  "validation_mode": "strict",
  "total_records": 500,
  "valid_records": 495,
  "invalid_records": 5,
  "warning_count": 10,
  "errors": [...],
  "warnings": [...],
  "validated_at": "2024-01-15T10:05:00Z"
}
```

---

### Reconciliation

**POST `/api/admin/imports/reconcile`**

Matches records to existing data and identifies new records to create.

**Request:**
```json
{
  "file_id": "uuid",
  "data_types": ["sign_ups"]
}
```

**Response:**
```json
{
  "file_id": "uuid",
  "reconciliation_id": "uuid",
  "status": "needs_review",
  "new_ambassadors": 15,
  "new_events": 3,
  "new_operators": 0,
  "new_venues": 2,
  "linked_records": 480,
  "ambiguous_matches": [...],
  "total_ambiguous": 5,
  "resolved_ambiguous": 0,
  "reconciled_at": "2024-01-15T10:10:00Z"
}
```

---

### Update Reconciliation Decisions

**PUT `/api/admin/imports/:file_id/reconciliation`**

Updates user decisions for ambiguous matches.

**Request:**
```json
{
  "decisions": [
    {
      "ambiguous_match_id": "uuid",
      "user_selection": "use_candidate",
      "selected_candidate_id": "ambassador-123",
      "notes": "Confirmed same person, different email"
    }
  ]
}
```

**Response:**
```json
{
  "file_id": "uuid",
  "updated_count": 1,
  "total_ambiguous": 5,
  "resolved_ambiguous": 3,
  "all_resolved": false,
  "updated_at": "2024-01-15T10:15:00Z"
}
```

---

### Execute Import

**POST `/api/admin/imports/:file_id/execute`**

Executes atomic import transaction.

**Request:**
```json
{
  "confirm": true,
  "dry_run": false
}
```

**Response:**
```json
{
  "import_id": "uuid",
  "file_id": "uuid",
  "status": "completed",
  "dry_run": false,
  "summary": {
    "sign_ups_imported": 450,
    "budgets_imported": 0,
    "payroll_imported": 0,
    "new_ambassadors_created": 15,
    "new_events_created": 3,
    "new_operators_created": 0,
    "new_venues_created": 2,
    "records_skipped": 25,
    "records_failed": 10
  },
  "audit_trail_id": "uuid",
  "started_at": "2024-01-15T10:20:00Z",
  "completed_at": "2024-01-15T10:20:45Z",
  "duration_ms": 45000
}
```

---

### List Import History

**GET `/api/admin/imports`**

Lists all imports with pagination and filtering.

**Query Parameters:**
- `page` - Page number (default: 1)
- `page_size` - Items per page (default: 50, max: 100)
- `status` - Filter by status (comma-separated)
- `data_types` - Filter by data types (comma-separated)
- `from_date` - Filter from date (ISO 8601)
- `to_date` - Filter to date (ISO 8601)
- `imported_by` - Filter by user ID
- `search` - Search file name or user
- `sort_by` - Sort field
- `sort_order` - asc or desc

**Response:**
```json
{
  "imports": [...],
  "total": 150,
  "page": 1,
  "page_size": 50,
  "total_pages": 3,
  "summary": {
    "total_imports": 150,
    "successful_imports": 140,
    "failed_imports": 10,
    "total_records_imported": 75000
  }
}
```

---

### Download Import Report

**GET `/api/admin/imports/:import_id/report`**

Downloads reconciliation report.

**Query Parameters:**
- `format` - Report format: `json`, `csv`, or `pdf`
- `include_raw_data` - Include raw imported data (default: false)
- `include_validation_details` - Include validation results (default: false)
- `include_reconciliation_details` - Include reconciliation results (default: false)

---

### Get Audit Trail

**GET `/api/admin/imports/:import_id/audit-trail`**

Returns complete audit trail for an import.

**Query Parameters:**
- `page` - Page number
- `page_size` - Items per page
- `action` - Filter by action type
- `actor_id` - Filter by actor
- `from_date` - Filter from date
- `to_date` - Filter to date

**Response:**
```json
{
  "import_id": "uuid",
  "entries": [
    {
      "id": "uuid",
      "import_id": "uuid",
      "action": "file_uploaded",
      "actor_id": "user-123",
      "actor_name": "Admin User",
      "timestamp": "2024-01-15T10:00:00Z",
      "details": {...}
    }
  ],
  "total": 25,
  "page": 1,
  "page_size": 50,
  "total_pages": 1
}
```

---

## Error Handling

All endpoints return consistent error responses:

```json
{
  "error": "ERROR_CODE",
  "error_code": "ERROR_CODE",
  "message": "Human-readable error message",
  "details": {...},
  "timestamp": "2024-01-15T10:00:00Z"
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `FILE_NOT_FOUND` | 404 | File not found or expired |
| `FILE_TOO_LARGE` | 413 | File exceeds maximum size (50MB) |
| `INVALID_FILE_FORMAT` | 400 | Unsupported file format |
| `FILE_PARSING_FAILED` | 422 | Failed to parse file |
| `FILE_EXPIRED` | 410 | File has expired |
| `VALIDATION_FAILED` | 422 | Validation failed in strict mode |
| `INVALID_DATA_TYPE` | 400 | Invalid data type specified |
| `RECONCILIATION_NOT_FOUND` | 404 | No reconciliation for file |
| `RECONCILIATION_NOT_COMPLETE` | 422 | Unresolved ambiguous matches |
| `IMPORT_NOT_FOUND` | 404 | Import not found |
| `IMPORT_ALREADY_EXECUTED` | 409 | Import already executed |
| `IMPORT_NOT_READY` | 422 | Import not ready for execution |
| `UNAUTHORIZED` | 401 | Authentication required |
| `FORBIDDEN` | 403 | Permission denied |
| `BAD_REQUEST` | 400 | Invalid request |
| `INTERNAL_ERROR` | 500 | Internal server error |

---

## Data Types

The API supports three data types for import:

- `sign_ups` - Ambassador sign-up records
- `budgets_actuals` - Event budget and actual expense records
- `payroll` - Ambassador payroll records

---

## Validation Modes

- `strict` - Fails if any record has validation errors
- `permissive` - Skips invalid records and imports valid ones

---

## User Selection for Ambiguous Matches

- `use_match` - Use the original imported value as-is (create new record)
- `use_candidate` - Use the selected candidate match (link to existing)
- `create_new` - Explicitly create a new record

---

## File Structure

```
historical-import/api/
├── README.md                    # This file
├── index.ts                     # Module exports
├── types.ts                     # TypeScript interfaces
├── services/
│   ├── index.ts
│   └── import.service.ts        # Business logic
├── utils/
│   ├── index.ts
│   ├── errors.ts                # Error handling
│   ├── validation.ts            # Request validation
│   └── audit.ts                 # Audit logging
└── routes/
    ├── route.ts                 # GET /api/admin/imports
    ├── parse/
    │   └── route.ts             # POST /api/admin/imports/parse
    ├── validate/
    │   └── route.ts             # POST /api/admin/imports/validate
    ├── reconcile/
    │   └── route.ts             # POST /api/admin/imports/reconcile
    ├── [file_id]/
    │   ├── reconciliation/
    │   │   └── route.ts         # PUT /api/admin/imports/:file_id/reconciliation
    │   └── execute/
    │       └── route.ts         # POST /api/admin/imports/:file_id/execute
    └── [import_id]/
        ├── report/
        │   └── route.ts         # GET /api/admin/imports/:import_id/report
        └── audit-trail/
            └── route.ts         # GET /api/admin/imports/:import_id/audit-trail
```

---

## Integration Notes

### Authentication

All endpoints require authentication. The current implementation checks for:
- `Authorization` header (Bearer token)
- `session` cookie

In production, integrate with your auth provider (Clerk, NextAuth, etc.).

### Database

The current implementation uses in-memory storage for demonstration. In production, replace with actual database operations using Drizzle/Prisma with the PostgreSQL schema from WO-75.

### File Storage

Parsed files are stored in memory with a 24-hour expiry. In production, consider:
- Redis for temporary file storage
- S3/R2 for permanent file storage
- Background jobs for cleanup

### Excel Parsing

CSV parsing is implemented. For Excel support, add the `xlsx` library:

```bash
npm install xlsx
```

Then update `import.service.ts` to handle Excel files.
