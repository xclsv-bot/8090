# Rollback Procedures

## Objective
Safely reverse import side effects with full auditability.

## Rollback Strategy Types
- `full_import_reversal`: delete/revert all records created by import.
- `batch_reversal`: rollback specific failed batch range.
- `selective_reversal`: targeted rollback by row set.

## Rollback Operation Schema
```ts
export interface RollbackOperation {
  id: string;
  importId: string;
  strategy: 'full_import_reversal' | 'batch_reversal' | 'selective_reversal';
  initiatedBy: string;
  status: 'started' | 'completed' | 'failed';
  affectedRows: number;
  details?: Record<string, unknown>;
  startedAt: string;
  completedAt?: string;
}
```

## Standard Procedure
1. Validate import exists and is rollback-eligible.
2. Acquire lock on import ID.
3. Resolve affected entities from row/audit logs.
4. Execute reversal in transaction chunks.
5. Record rollback operation and update import status.

## Example API Behavior (WO-92)
- Endpoint: `POST /api/v1/imports/signups/:importId/rollback`
- Authorization: admin only.
- Prevent duplicate rollback when status already `rolled_back`.

## SQL Example
```ts
await pool.query('BEGIN');
await pool.query('DELETE FROM signups WHERE import_batch_id = $1', [importId]);
await pool.query(
  `UPDATE signup_import_logs
   SET status = 'rolled_back', rollback_at = NOW()
   WHERE id = $1`,
  [importId]
);
await pool.query('COMMIT');
```

## Failure Handling
- On any failure, `ROLLBACK` DB transaction.
- Preserve rollback attempt metadata and failure reason.
