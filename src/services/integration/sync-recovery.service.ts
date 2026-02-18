import { pool } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { IntegrationType } from '../oauth/oauth.service.js';

export interface SyncCheckpoint {
  id: string;
  integration: IntegrationType;
  syncType: string;
  lastProcessedId: string | null;
  lastProcessedAt: Date | null;
  totalRecords: number;
  processedRecords: number;
  failedRecords: number;
  status: 'in_progress' | 'completed' | 'failed' | 'paused';
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SyncProgress {
  processedRecords: number;
  totalRecords: number;
  lastProcessedId: string | null;
  percentage: number;
}

/**
 * Create a new sync checkpoint
 */
export async function createSyncCheckpoint(
  integration: IntegrationType,
  syncType: string,
  totalRecords: number
): Promise<SyncCheckpoint> {
  const result = await pool.query(`
    INSERT INTO sync_checkpoints (
      id, integration_type, sync_type, total_records, 
      processed_records, failed_records, status, created_at, updated_at
    )
    VALUES (gen_random_uuid(), $1, $2, $3, 0, 0, 'in_progress', NOW(), NOW())
    RETURNING *
  `, [integration, syncType, totalRecords]);

  const row = result.rows[0];
  
  logger.info({
    checkpointId: row.id,
    integration,
    syncType,
    totalRecords,
  }, 'Sync checkpoint created');

  return mapCheckpointRow(row);
}

/**
 * Update sync checkpoint progress
 */
export async function updateSyncProgress(
  checkpointId: string,
  lastProcessedId: string,
  processedCount: number,
  failedCount: number = 0
): Promise<void> {
  await pool.query(`
    UPDATE sync_checkpoints
    SET 
      last_processed_id = $1,
      last_processed_at = NOW(),
      processed_records = processed_records + $2,
      failed_records = failed_records + $3,
      updated_at = NOW()
    WHERE id = $4
  `, [lastProcessedId, processedCount, failedCount, checkpointId]);
}

/**
 * Complete a sync checkpoint
 */
export async function completeSyncCheckpoint(
  checkpointId: string,
  status: 'completed' | 'failed' = 'completed',
  errorMessage?: string
): Promise<void> {
  await pool.query(`
    UPDATE sync_checkpoints
    SET 
      status = $1,
      error_message = $2,
      updated_at = NOW()
    WHERE id = $3
  `, [status, errorMessage || null, checkpointId]);

  logger.info({
    checkpointId,
    status,
    errorMessage,
  }, 'Sync checkpoint completed');
}

/**
 * Get the last checkpoint for a sync type
 */
export async function getLastCheckpoint(
  integration: IntegrationType,
  syncType: string
): Promise<SyncCheckpoint | null> {
  const result = await pool.query(`
    SELECT * FROM sync_checkpoints
    WHERE integration_type = $1 AND sync_type = $2
    ORDER BY created_at DESC
    LIMIT 1
  `, [integration, syncType]);

  if (result.rows.length === 0) {
    return null;
  }

  return mapCheckpointRow(result.rows[0]);
}

/**
 * Get resumable checkpoint (in_progress or failed)
 */
export async function getResumableCheckpoint(
  integration: IntegrationType,
  syncType: string
): Promise<SyncCheckpoint | null> {
  const result = await pool.query(`
    SELECT * FROM sync_checkpoints
    WHERE integration_type = $1 
      AND sync_type = $2
      AND status IN ('in_progress', 'failed', 'paused')
    ORDER BY created_at DESC
    LIMIT 1
  `, [integration, syncType]);

  if (result.rows.length === 0) {
    return null;
  }

  return mapCheckpointRow(result.rows[0]);
}

/**
 * Resume a sync from checkpoint
 */
export async function resumeSync(
  checkpointId: string
): Promise<{ lastProcessedId: string | null; checkpoint: SyncCheckpoint }> {
  const result = await pool.query(`
    UPDATE sync_checkpoints
    SET status = 'in_progress', updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `, [checkpointId]);

  if (result.rows.length === 0) {
    throw new Error(`Checkpoint not found: ${checkpointId}`);
  }

  const checkpoint = mapCheckpointRow(result.rows[0]);

  logger.info({
    checkpointId,
    lastProcessedId: checkpoint.lastProcessedId,
    processedRecords: checkpoint.processedRecords,
    totalRecords: checkpoint.totalRecords,
  }, 'Resuming sync from checkpoint');

  return {
    lastProcessedId: checkpoint.lastProcessedId,
    checkpoint,
  };
}

/**
 * Pause a sync
 */
export async function pauseSync(checkpointId: string): Promise<void> {
  await pool.query(`
    UPDATE sync_checkpoints
    SET status = 'paused', updated_at = NOW()
    WHERE id = $1
  `, [checkpointId]);

  logger.info({ checkpointId }, 'Sync paused');
}

/**
 * Get sync progress
 */
export async function getSyncProgress(checkpointId: string): Promise<SyncProgress | null> {
  const result = await pool.query(`
    SELECT processed_records, total_records, last_processed_id
    FROM sync_checkpoints
    WHERE id = $1
  `, [checkpointId]);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  const percentage = row.total_records > 0 
    ? Math.round((row.processed_records / row.total_records) * 100) 
    : 0;

  return {
    processedRecords: row.processed_records,
    totalRecords: row.total_records,
    lastProcessedId: row.last_processed_id,
    percentage,
  };
}

/**
 * Clean up old completed checkpoints (keep last N per sync type)
 */
export async function cleanupOldCheckpoints(
  integration: IntegrationType,
  syncType: string,
  keepCount: number = 10
): Promise<number> {
  const result = await pool.query(`
    WITH ranked AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY created_at DESC) as rn
      FROM sync_checkpoints
      WHERE integration_type = $1 AND sync_type = $2 AND status = 'completed'
    )
    DELETE FROM sync_checkpoints
    WHERE id IN (SELECT id FROM ranked WHERE rn > $3)
    RETURNING id
  `, [integration, syncType, keepCount]);

  const deletedCount = result.rowCount || 0;

  if (deletedCount > 0) {
    logger.info({
      integration,
      syncType,
      deletedCount,
    }, 'Cleaned up old checkpoints');
  }

  return deletedCount;
}

/**
 * Helper to create batched sync operations with checkpointing
 */
export async function* batchedSyncWithCheckpoint<T extends { id: string }>(
  checkpointId: string,
  items: T[],
  batchSize: number = 100,
  checkpointInterval: number = 10 // Save checkpoint every N batches
): AsyncGenerator<T[], void, void> {
  let batchCount = 0;
  let processedCount = 0;
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    yield batch;
    
    processedCount += batch.length;
    batchCount++;

    // Save checkpoint at intervals
    if (batchCount % checkpointInterval === 0 || i + batchSize >= items.length) {
      const lastItem = batch[batch.length - 1];
      await updateSyncProgress(checkpointId, lastItem.id, batch.length);
    }
  }
}

/**
 * Map database row to SyncCheckpoint
 */
function mapCheckpointRow(row: Record<string, unknown>): SyncCheckpoint {
  return {
    id: row.id as string,
    integration: row.integration_type as IntegrationType,
    syncType: row.sync_type as string,
    lastProcessedId: row.last_processed_id as string | null,
    lastProcessedAt: row.last_processed_at as Date | null,
    totalRecords: row.total_records as number,
    processedRecords: row.processed_records as number,
    failedRecords: row.failed_records as number,
    status: row.status as SyncCheckpoint['status'],
    errorMessage: row.error_message as string | null,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
  };
}
