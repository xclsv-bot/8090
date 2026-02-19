# Historical Data Import - Database Schema

> Work Order: WO-77  
> Created: 2025-02-19  
> Status: ✅ Deployed

## Overview

This directory contains the complete database schema and TypeScript models for the Historical Data Import feature. The schema integrates with the existing XCLSV Core database using namespaced tables (`hist_import_*`).

### Features

- **Import Job Management**: Track uploads through parsing, validation, reconciliation, and execution
- **Staged Records**: Validate data before committing to master tables
- **Entity Reconciliation**: Match imported data to existing records with fuzzy matching support
- **Audit Trails**: Complete compliance logging of all import operations

## Directory Structure

```
schema/
├── schema.prisma                           # Prisma schema (namespaced tables)
├── types.ts                                # TypeScript interfaces and enums
├── index.ts                                # Module exports
├── README.md                               # This file
└── migrations/
    ├── 001_create_historical_import_tables.sql  # Original (standalone)
    ├── 002_rollback_historical_import.sql       # Rollback (standalone)
    └── 003_add_import_tables_only.sql           # ✅ DEPLOYED - namespaced tables
```

## Deployed Tables

The following tables have been deployed to the XCLSV Core database:

| Table | Purpose |
|-------|---------|
| `hist_import_jobs` | Track import lifecycle, file metadata, statistics |
| `hist_import_parsed_records` | Staging table for validated records |
| `hist_import_reconciliation_matches` | Entity matching decisions |
| `hist_import_results` | Final imported records with audit links |
| `hist_import_audit_trail` | Complete operation history |

**Total: 5 tables, 36 indexes**

## Quick Start

### 1. Set Environment Variable

```bash
export DATABASE_URL="postgresql://neondb_owner:npg_XwRHzDI6h4WU@ep-twilight-thunder-aidv5htg-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require"
```

### 2. Generate Prisma Client

```bash
npx prisma generate --schema=schema.prisma
```

### 3. Use in Code

```typescript
import {
  HistImportJob,
  HistImportJobStatus,
  HistImportPhase,
  HistImportDataType,
} from '@/historical-import/schema';

// Create a new import job
const job: Partial<HistImportJob> = {
  fileName: 'signups_2024.csv',
  status: HistImportJobStatus.PENDING,
  phase: HistImportPhase.UPLOAD,
  dataTypes: [HistImportDataType.SIGN_UPS],
  createdBy: 'user_123',
};
```

## Schema Design

### Import Workflow Phases

```
UPLOAD → PARSE → VALIDATE → RECONCILE → CONFIRM → EXECUTE → COMPLETE
```

Each phase updates `hist_import_jobs.phase` and `hist_import_jobs.status`.

### Entity Reconciliation

When importing data, the system matches imported values against existing master tables:

- **ambassadors** (existing) - Match by email, name
- **events** (existing) - Match by name, date
- **operators** (existing) - Match by name
- **venues** (future) - Match by name, location

Reconciliation results are stored in `hist_import_reconciliation_matches` with confidence scores.

### Audit Trail

Every import operation is logged to `hist_import_audit_trail`:

```typescript
enum HistImportAuditAction {
  IMPORT_STARTED,      // Job created
  FILE_UPLOADED,       // File received
  FILE_PARSED,         // Parsing complete
  VALIDATION_STARTED,  // Validation begins
  VALIDATION_COMPLETED,// Validation done
  RECONCILIATION_STARTED,  // Matching begins
  RECONCILIATION_DECISION, // User decision recorded
  RECONCILIATION_COMPLETED,// Matching done
  IMPORT_CONFIRMED,    // User confirmed
  IMPORT_EXECUTED,     // Transaction started
  IMPORT_COMPLETED,    // Success
  IMPORT_FAILED,       // Error occurred
  RECORD_CREATED,      // Master record created
  RECORD_UPDATED,      // Master record updated
  RECORD_LINKED,       // Linked to existing
  USER_OVERRIDE,       // Manual decision
  ROLLBACK_INITIATED,  // Rollback started
  ROLLBACK_COMPLETED,  // Rollback done
}
```

## TypeScript Usage

### Using Namespaced Types (Recommended)

```typescript
import {
  HistImportJob,
  HistImportJobStatus,
  HistImportParsedRecord,
  HistImportReconciliationMatch,
} from './schema';

const job: HistImportJob = {
  id: 'clx...',
  status: HistImportJobStatus.PENDING,
  // ...
};
```

### Using Legacy Aliases (For Compatibility)

```typescript
import {
  ImportJob,         // Alias for HistImportJob
  ImportJobStatus,   // Alias for HistImportJobStatus
  ParsedRecord,      // Alias for HistImportParsedRecord
} from './schema';
```

## Prisma Client

After generating the Prisma client:

```typescript
import { PrismaClient } from './generated/client';

const prisma = new PrismaClient();

// Query import jobs with relations
const jobs = await prisma.histImportJob.findMany({
  include: {
    parsedRecords: true,
    reconciliationMatches: true,
    auditTrailEntries: true,
  },
  where: {
    status: 'COMPLETED',
  },
  orderBy: {
    createdAt: 'desc',
  },
});

// Create audit trail entry
await prisma.histImportAuditTrail.create({
  data: {
    importJobId: job.id,
    action: 'IMPORT_STARTED',
    summary: `Import started for ${job.fileName}`,
    userId: currentUser.id,
    severity: 'INFO',
  },
});
```

## Migration Notes

### Why Namespaced Tables?

The XCLSV Core database already has:
- `ambassadors` table with different structure
- `events`, `operators`, `event_assignments` tables
- Many existing enums (e.g., `validation_status`)

To avoid conflicts, all import-related tables and enums use the `hist_import_` prefix.

### Integrating with Existing Tables

The reconciliation matches table references existing master tables by ID:

```sql
matched_ambassador_id TEXT  -- References ambassadors.id (UUID)
matched_event_id TEXT       -- References events.id (UUID)
matched_operator_id TEXT    -- References operators.id (UUID)
```

These are TEXT fields (not foreign keys) to avoid tight coupling and allow flexible reconciliation logic.

## Related Work Orders

- **WO-77**: Database Schema and Models ✅ (this work order)
- API endpoints (separate work order)
- File processing logic (separate work order)
- Frontend components (separate work order)
- Audit trail reporting (separate work order)

## Maintenance

### Adding New Data Types

1. Add enum value to `hist_import_data_type` in database
2. Update `HistImportDataType` enum in types.ts
3. Update Prisma schema
4. Regenerate Prisma client

### Rollback (Destructive)

To remove all import tables:

```sql
DROP TABLE IF EXISTS hist_import_audit_trail CASCADE;
DROP TABLE IF EXISTS hist_import_results CASCADE;
DROP TABLE IF EXISTS hist_import_reconciliation_matches CASCADE;
DROP TABLE IF EXISTS hist_import_parsed_records CASCADE;
DROP TABLE IF EXISTS hist_import_jobs CASCADE;

-- Drop enums
DROP TYPE IF EXISTS hist_import_audit_severity CASCADE;
DROP TYPE IF EXISTS hist_import_audit_action CASCADE;
DROP TYPE IF EXISTS hist_import_operation CASCADE;
DROP TYPE IF EXISTS hist_import_recon_decision CASCADE;
DROP TYPE IF EXISTS hist_import_match_type CASCADE;
DROP TYPE IF EXISTS hist_import_entity_type CASCADE;
DROP TYPE IF EXISTS hist_import_record_status CASCADE;
DROP TYPE IF EXISTS hist_import_reconciliation_status CASCADE;
DROP TYPE IF EXISTS hist_import_validation_status CASCADE;
DROP TYPE IF EXISTS hist_import_validation_mode CASCADE;
DROP TYPE IF EXISTS hist_import_data_type CASCADE;
DROP TYPE IF EXISTS hist_import_phase CASCADE;
DROP TYPE IF EXISTS hist_import_job_status CASCADE;
```

⚠️ **Warning**: This will delete all import data. Use with caution in production.
