# Audit Logging Requirements

## Goal
Provide compliance-grade visibility into import actions and outcomes.

## Import-Level Schema
```ts
export interface ImportLog {
  id: string;
  importType: string;
  filename: string;
  fileHash: string;
  status: 'processing' | 'completed' | 'partial' | 'failed' | 'rolled_back';
  importedBy?: string;
  options?: Record<string, unknown>;
  totalRows: number;
  processedRows: number;
  errorRows: number;
  startedAt: string;
  completedAt?: string;
}
```

## Row-Level Schema
```ts
export interface ImportRowLog {
  id: string;
  importLogId: string;
  rowNumber: number;
  status: 'success' | 'skipped' | 'error' | 'warning';
  action?: string;
  message?: string;
  entityId?: string;
  rawData?: Record<string, unknown>;
  createdAt: string;
}
```

## Action Audit Schema (Event Import)
WO-88 uses dedicated audit entries:
```ts
export interface ImportAuditEntry {
  id: string;
  importId: string;
  action: 'create_event' | 'update_event' | 'link_ambassador' | string;
  entityType: 'event' | 'assignment' | 'performance_history' | string;
  entityId?: string;
  details?: Record<string, unknown>;
  performedBy?: string;
  createdAt: string;
}
```

## Logging Requirements
- Write import start log before parsing.
- Write row detail for every processed row.
- Write action log for each mutation.
- Update terminal status with summary counts.
- Keep logs immutable; never rewrite history rows.

## Existing Tables
- WO-88: `financial_import_logs`, `financial_import_row_details`, `event_import_audit_log`
- WO-92: `signup_import_logs`, `signup_import_row_details`
