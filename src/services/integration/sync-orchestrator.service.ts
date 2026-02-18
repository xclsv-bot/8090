import { pool } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { IntegrationType } from '../oauth/oauth.service.js';
import {
  createSyncCheckpoint,
  updateSyncProgress,
  completeSyncCheckpoint,
  getResumableCheckpoint,
  resumeSync,
  SyncCheckpoint,
} from './sync-recovery.service.js';
import * as quickbooks from './clients/quickbooks.client.js';
import * as ramp from './clients/ramp.client.js';

export interface SyncResult {
  success: boolean;
  checkpointId: string;
  recordsProcessed: number;
  recordsFailed: number;
  duration: number;
  error?: string;
}

export interface SyncOptions {
  fullSync?: boolean;  // If true, sync all records; otherwise incremental
  batchSize?: number;
  resumeFromCheckpoint?: boolean;
}

// =============================================
// QuickBooks Sync Operations
// =============================================

export async function syncQuickBooksInvoices(
  options: SyncOptions = {}
): Promise<SyncResult> {
  const startTime = Date.now();
  const syncType = 'quickbooks_invoices';
  const { batchSize = 100, resumeFromCheckpoint = true } = options;

  let checkpoint: SyncCheckpoint;
  let startPosition = 1;

  // Check for resumable checkpoint
  if (resumeFromCheckpoint) {
    const existing = await getResumableCheckpoint('quickbooks', syncType);
    if (existing) {
      logger.info({ checkpointId: existing.id }, 'Resuming from checkpoint');
      const resumed = await resumeSync(existing.id);
      checkpoint = resumed.checkpoint;
      startPosition = checkpoint.processedRecords + 1;
    }
  }

  // Get total count first
  const countResponse = await quickbooks.listInvoices({ maxResults: 1 });
  if (!countResponse.success) {
    return {
      success: false,
      checkpointId: '',
      recordsProcessed: 0,
      recordsFailed: 0,
      duration: Date.now() - startTime,
      error: countResponse.error?.message,
    };
  }
  const totalCount = countResponse.data?.totalCount || 0;

  // Create checkpoint if not resuming
  if (!checkpoint!) {
    checkpoint = await createSyncCheckpoint('quickbooks', syncType, totalCount);
  }

  let processedCount = 0;
  let failedCount = 0;

  try {
    // Paginate through all invoices
    while (startPosition <= totalCount) {
      const response = await quickbooks.listInvoices({
        startPosition,
        maxResults: batchSize,
      });

      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Failed to fetch invoices');
      }

      const { invoices } = response.data;

      // Process each invoice
      for (const invoice of invoices) {
        try {
          await upsertInvoice(invoice);
          processedCount++;
        } catch (e) {
          failedCount++;
          logger.warn({ invoiceId: invoice.externalId, error: e }, 'Failed to process invoice');
        }
      }

      // Update checkpoint
      if (invoices.length > 0) {
        const lastInvoice = invoices[invoices.length - 1];
        await updateSyncProgress(checkpoint.id, lastInvoice.externalId, invoices.length, 0);
      }

      startPosition += batchSize;
    }

    await completeSyncCheckpoint(checkpoint.id, 'completed');

    return {
      success: true,
      checkpointId: checkpoint.id,
      recordsProcessed: processedCount,
      recordsFailed: failedCount,
      duration: Date.now() - startTime,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await completeSyncCheckpoint(checkpoint.id, 'failed', errorMessage);

    return {
      success: false,
      checkpointId: checkpoint.id,
      recordsProcessed: processedCount,
      recordsFailed: failedCount,
      duration: Date.now() - startTime,
      error: errorMessage,
    };
  }
}

export async function syncQuickBooksCustomers(
  options: SyncOptions = {}
): Promise<SyncResult> {
  const startTime = Date.now();
  const syncType = 'quickbooks_customers';
  const { batchSize = 100 } = options;

  const countResponse = await quickbooks.listCustomers({ maxResults: 1 });
  const totalCount = countResponse.data?.totalCount || 0;

  const checkpoint = await createSyncCheckpoint('quickbooks', syncType, totalCount);

  let processedCount = 0;
  let startPosition = 1;

  try {
    while (startPosition <= totalCount) {
      const response = await quickbooks.listCustomers({
        startPosition,
        maxResults: batchSize,
      });

      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Failed to fetch customers');
      }

      for (const customer of response.data.customers) {
        await upsertCustomer(customer);
        processedCount++;
      }

      if (response.data.customers.length > 0) {
        const last = response.data.customers[response.data.customers.length - 1];
        await updateSyncProgress(checkpoint.id, last.externalId, response.data.customers.length);
      }

      startPosition += batchSize;
    }

    await completeSyncCheckpoint(checkpoint.id, 'completed');

    return {
      success: true,
      checkpointId: checkpoint.id,
      recordsProcessed: processedCount,
      recordsFailed: 0,
      duration: Date.now() - startTime,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await completeSyncCheckpoint(checkpoint.id, 'failed', errorMessage);

    return {
      success: false,
      checkpointId: checkpoint.id,
      recordsProcessed: processedCount,
      recordsFailed: 0,
      duration: Date.now() - startTime,
      error: errorMessage,
    };
  }
}

// =============================================
// Ramp Sync Operations
// =============================================

export async function syncRampTransactions(
  options: SyncOptions & { fromDate?: string; toDate?: string } = {}
): Promise<SyncResult> {
  const startTime = Date.now();
  const syncType = 'ramp_transactions';

  // For Ramp, we use cursor-based pagination
  const checkpoint = await createSyncCheckpoint('ramp', syncType, 0);

  let processedCount = 0;
  let cursor: string | null = null;

  try {
    do {
      const response = await ramp.listTransactions({
        from_date: options.fromDate,
        to_date: options.toDate,
        page_size: 100,
        start: cursor || undefined,
      });

      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Failed to fetch transactions');
      }

      for (const txn of response.data.transactions) {
        await upsertTransaction(txn);
        processedCount++;
      }

      if (response.data.transactions.length > 0) {
        const last = response.data.transactions[response.data.transactions.length - 1];
        await updateSyncProgress(checkpoint.id, last.externalId, response.data.transactions.length);
      }

      cursor = response.data.nextCursor;
    } while (cursor);

    await completeSyncCheckpoint(checkpoint.id, 'completed');

    return {
      success: true,
      checkpointId: checkpoint.id,
      recordsProcessed: processedCount,
      recordsFailed: 0,
      duration: Date.now() - startTime,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await completeSyncCheckpoint(checkpoint.id, 'failed', errorMessage);

    return {
      success: false,
      checkpointId: checkpoint.id,
      recordsProcessed: processedCount,
      recordsFailed: 0,
      duration: Date.now() - startTime,
      error: errorMessage,
    };
  }
}

// =============================================
// Database Upsert Helpers
// =============================================

async function upsertInvoice(invoice: quickbooks.InternalInvoice): Promise<void> {
  await pool.query(`
    INSERT INTO synced_invoices (
      external_id, source, invoice_number, customer_id, customer_name,
      total_amount, balance, due_date, transaction_date, line_items,
      synced_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
    ON CONFLICT (external_id, source) 
    DO UPDATE SET
      invoice_number = EXCLUDED.invoice_number,
      customer_name = EXCLUDED.customer_name,
      total_amount = EXCLUDED.total_amount,
      balance = EXCLUDED.balance,
      line_items = EXCLUDED.line_items,
      synced_at = NOW()
  `, [
    invoice.externalId,
    invoice.source,
    invoice.invoiceNumber,
    invoice.customerId,
    invoice.customerName,
    invoice.totalAmount,
    invoice.balance,
    invoice.dueDate,
    invoice.transactionDate,
    JSON.stringify(invoice.lineItems),
  ]);
}

async function upsertCustomer(customer: quickbooks.InternalCustomer): Promise<void> {
  await pool.query(`
    INSERT INTO synced_customers (
      external_id, source, display_name, company_name, email, phone,
      address, balance, synced_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    ON CONFLICT (external_id, source)
    DO UPDATE SET
      display_name = EXCLUDED.display_name,
      company_name = EXCLUDED.company_name,
      email = EXCLUDED.email,
      phone = EXCLUDED.phone,
      address = EXCLUDED.address,
      balance = EXCLUDED.balance,
      synced_at = NOW()
  `, [
    customer.externalId,
    customer.source,
    customer.displayName,
    customer.companyName,
    customer.email,
    customer.phone,
    JSON.stringify(customer.address),
    customer.balance,
  ]);
}

async function upsertTransaction(txn: ramp.InternalTransaction): Promise<void> {
  await pool.query(`
    INSERT INTO synced_transactions (
      external_id, source, amount, card_id, employee_name,
      department_id, department_name, merchant_name, category_name,
      status, transaction_date, memo, synced_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
    ON CONFLICT (external_id, source)
    DO UPDATE SET
      amount = EXCLUDED.amount,
      status = EXCLUDED.status,
      memo = EXCLUDED.memo,
      synced_at = NOW()
  `, [
    txn.externalId,
    txn.source,
    txn.amount,
    txn.cardId,
    txn.employeeName,
    txn.departmentId,
    txn.departmentName,
    txn.merchantName,
    txn.categoryName,
    txn.status,
    txn.transactionDate,
    txn.memo,
  ]);
}
