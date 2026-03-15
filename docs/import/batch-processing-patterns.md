# Batch Processing Patterns

## Objective
Process imports safely and efficiently while providing accurate progress reporting.

## Core Interface
```ts
export interface ImportBatch {
  importId: string;
  batchNumber: number;
  startRow: number;
  endRow: number;
  totalRows: number;
  processedRows: number;
  successRows: number;
  errorRows: number;
}

export interface BatchProcessor<T> {
  processBatch(rows: T[], context: { importId: string; dryRun?: boolean }): Promise<ImportBatch>;
}
```

## Transaction Strategies
- `single_transaction`: strict all-or-nothing for small imports.
- `batch_transaction`: commit per chunk to allow partial success at scale.
- `row_transaction`: highest isolation, lowest throughput.

Recommended default: `batch_transaction`.

## Batch Sizing
- CPU-light + DB-heavy writes: `100-300`
- Mixed validation and lookup heavy workloads: `50-150`
- Tune by DB latency and lock behavior.

## Processing Flow
```ts
for (const chunk of chunks(rows, 100)) {
  await db.tx(async (trx) => {
    for (const row of chunk) {
      await validate(row);
      await persist(row, trx);
      await logRow(row, 'success', trx);
    }
  });

  await updateImportProgress(importId, {
    processedRows: processed + chunk.length,
  });
}
```

## Progress Tracking Schema (Example)
```ts
export interface ImportProgress {
  importId: string;
  status: 'processing' | 'completed' | 'partial' | 'failed' | 'rolled_back';
  totalRows: number;
  processedRows: number;
  successRows: number;
  errorRows: number;
  startedAt: string;
  completedAt?: string;
}
```

## Existing References
- WO-88 logs to `financial_import_logs` and `financial_import_row_details`.
- WO-92 logs to `signup_import_logs` and `signup_import_row_details`.
