/**
 * Daily Snapshot Job
 * WO-71: Daily Snapshot Calculation Job
 * Scheduled job to create daily metrics snapshots
 */

import { snapshotService } from '../services/snapshotService.js';
import { kpiAlertService } from '../services/kpiAlertService.js';
import { realtimeMetricsService } from '../services/realtimeMetricsService.js';
import { analyticsAuditService } from '../services/analyticsAuditService.js';
import { db } from '../services/database.js';
import { logger } from '../utils/logger.js';

interface JobResult {
  success: boolean;
  snapshotId?: string;
  snapshotDate: string;
  alertsGenerated: number;
  durationMs: number;
  error?: string;
}

/**
 * Run the daily snapshot job
 * This should be scheduled to run daily (e.g., at 1 AM ET)
 */
export async function runDailySnapshotJob(date?: Date): Promise<JobResult> {
  const targetDate = date || new Date();
  const snapshotDate = targetDate.toISOString().split('T')[0];
  const startTime = Date.now();

  logger.info({ snapshotDate }, 'Starting daily snapshot job');

  // Update job status
  await updateJobStatus('daily_snapshot', true);

  try {
    // Create the snapshot
    const snapshot = await snapshotService.createDailySnapshot(targetDate);

    // Check thresholds and generate alerts
    const metrics = extractMetricsForThresholdCheck(snapshot);
    const alerts = await kpiAlertService.checkThresholds(metrics, snapshot.id, targetDate);

    // Reactivate any snoozed alerts that are due
    await kpiAlertService.reactivateSnoozedAlerts();

    // Refresh realtime metrics cache
    await realtimeMetricsService.refreshAllMetrics();
    await realtimeMetricsService.warmCache();

    // Cleanup expired cache
    await realtimeMetricsService.cleanupExpiredCache();

    const durationMs = Date.now() - startTime;

    // Log audit
    await analyticsAuditService.logSnapshotCreated(snapshot.id, snapshotDate, durationMs, {
      userId: 'system',
      userEmail: 'system@xclsv.com',
      userRole: 'system',
    });

    // Update job status
    await updateJobStatus('daily_snapshot', false, 'success', undefined, durationMs);

    logger.info(
      { snapshotId: snapshot.id, snapshotDate, alertsGenerated: alerts.length, durationMs },
      'Daily snapshot job completed successfully'
    );

    return {
      success: true,
      snapshotId: snapshot.id,
      snapshotDate,
      alertsGenerated: alerts.length,
      durationMs,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const durationMs = Date.now() - startTime;

    // Update job status
    await updateJobStatus('daily_snapshot', false, 'failed', errorMessage, durationMs);

    logger.error({ snapshotDate, error: errorMessage, durationMs }, 'Daily snapshot job failed');

    return {
      success: false,
      snapshotDate,
      alertsGenerated: 0,
      durationMs,
      error: errorMessage,
    };
  }
}

/**
 * Run the hourly metrics refresh job
 */
export async function runHourlyMetricsJob(): Promise<void> {
  const startTime = Date.now();

  logger.info('Starting hourly metrics refresh job');

  try {
    await updateJobStatus('hourly_metrics', true);

    // Refresh volatile metrics
    await Promise.all([
      realtimeMetricsService.refreshMetric('signups_this_hour'),
      realtimeMetricsService.refreshMetric('pending_signups'),
      realtimeMetricsService.refreshMetric('active_events'),
      realtimeMetricsService.refreshMetric('active_ambassadors'),
    ]);

    // Check thresholds with current metrics
    const metrics = await realtimeMetricsService.calculateBulkMetrics();
    await kpiAlertService.checkThresholds(metrics);

    const durationMs = Date.now() - startTime;
    await updateJobStatus('hourly_metrics', false, 'success', undefined, durationMs);

    logger.info({ durationMs }, 'Hourly metrics refresh completed');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await updateJobStatus('hourly_metrics', false, 'failed', errorMessage);
    logger.error({ error: errorMessage }, 'Hourly metrics refresh failed');
  }
}

/**
 * Run the realtime metrics refresh job (every 5 minutes)
 */
export async function runRealtimeMetricsJob(): Promise<void> {
  logger.debug('Running realtime metrics refresh');

  try {
    await updateJobStatus('realtime_kpi', true);

    // Warm the cache with fresh data
    await realtimeMetricsService.warmCache();

    // Cleanup expired entries
    await realtimeMetricsService.cleanupExpiredCache();

    await updateJobStatus('realtime_kpi', false, 'success');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await updateJobStatus('realtime_kpi', false, 'failed', errorMessage);
    logger.error({ error: errorMessage }, 'Realtime metrics refresh failed');
  }
}

/**
 * Run data retention cleanup job
 */
export async function runDataRetentionJob(): Promise<{
  tablesProcessed: number;
  totalRowsDeleted: number;
}> {
  const startTime = Date.now();

  logger.info('Starting data retention cleanup job');

  try {
    // Execute the data retention function
    const results = await db.queryMany<{ table_name: string; rows_deleted: string }>(
      `SELECT * FROM execute_data_retention()`
    );

    const totalRowsDeleted = results.reduce((sum, r) => sum + parseInt(r.rows_deleted), 0);

    logger.info(
      { tablesProcessed: results.length, totalRowsDeleted, durationMs: Date.now() - startTime },
      'Data retention cleanup completed'
    );

    return {
      tablesProcessed: results.length,
      totalRowsDeleted,
    };
  } catch (error) {
    logger.error({ error }, 'Data retention cleanup failed');
    throw error;
  }
}

/**
 * Backfill snapshots for missing dates
 */
export async function backfillSnapshots(fromDate: string, toDate: string): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  logger.info({ fromDate, toDate }, 'Starting snapshot backfill');

  const startDate = new Date(fromDate);
  const endDate = new Date(toDate);
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  const currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    processed++;

    try {
      // Check if snapshot already exists
      const existing = await snapshotService.getSnapshot(dateStr);
      if (existing && existing.snapshotStatus === 'completed') {
        logger.info({ date: dateStr }, 'Snapshot already exists, skipping');
        succeeded++;
      } else {
        await snapshotService.createDailySnapshot(new Date(currentDate));
        succeeded++;
        logger.info({ date: dateStr }, 'Backfill snapshot created');
      }
    } catch (error) {
      failed++;
      logger.error({ date: dateStr, error }, 'Backfill snapshot failed');
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  logger.info({ processed, succeeded, failed }, 'Snapshot backfill completed');

  return { processed, succeeded, failed };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function extractMetricsForThresholdCheck(snapshot: any): Record<string, number> {
  return {
    daily_signups: snapshot.totalSignups,
    validation_rate: snapshot.validationRate,
    active_events: snapshot.activeEvents,
    active_ambassadors: snapshot.activeAmbassadors,
    avg_signups_per_ambassador: snapshot.avgSignupsPerAmbassador,
    monthly_revenue: snapshot.totalRevenue,
    net_profit_margin: snapshot.profitMargin,
    data_quality_score: snapshot.dataQualityScore,
  };
}

async function updateJobStatus(
  jobType: string,
  isRunning: boolean,
  lastStatus?: string,
  lastError?: string,
  durationMs?: number
): Promise<void> {
  try {
    await db.query(
      `UPDATE metric_calculation_jobs SET
        is_running = $2,
        last_run_at = CASE WHEN $2 = false THEN NOW() ELSE last_run_at END,
        last_status = COALESCE($3, last_status),
        last_error = $4,
        total_runs = CASE WHEN $2 = false THEN total_runs + 1 ELSE total_runs END,
        successful_runs = CASE WHEN $2 = false AND $3 = 'success' THEN successful_runs + 1 ELSE successful_runs END,
        failed_runs = CASE WHEN $2 = false AND $3 = 'failed' THEN failed_runs + 1 ELSE failed_runs END,
        avg_duration_ms = CASE 
          WHEN $2 = false AND $5 IS NOT NULL 
          THEN COALESCE((avg_duration_ms * total_runs + $5) / (total_runs + 1), $5)
          ELSE avg_duration_ms 
        END,
        next_run_at = CASE 
          WHEN $2 = false THEN 
            CASE job_type
              WHEN 'daily_snapshot' THEN DATE_TRUNC('day', NOW()) + INTERVAL '1 day' + INTERVAL '1 hour'
              WHEN 'hourly_metrics' THEN DATE_TRUNC('hour', NOW()) + INTERVAL '1 hour'
              WHEN 'realtime_kpi' THEN NOW() + INTERVAL '5 minutes'
              ELSE next_run_at
            END
          ELSE next_run_at
        END,
        updated_at = NOW()
       WHERE job_type = $1`,
      [jobType, isRunning, lastStatus, lastError, durationMs]
    );
  } catch (error) {
    logger.error({ jobType, error }, 'Failed to update job status');
  }
}

// Export for CLI/API usage
export const snapshotJobs = {
  runDailySnapshotJob,
  runHourlyMetricsJob,
  runRealtimeMetricsJob,
  runDataRetentionJob,
  backfillSnapshots,
};
