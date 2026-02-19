/**
 * Customer.io Sync Job Processor
 * WO-69: Customer.io Sync System and Retry Infrastructure
 *
 * Background job processor that:
 * - Polls for pending sync jobs
 * - Processes jobs with retry logic
 * - Cleans up stuck jobs
 * - Runs on a configurable interval
 */

import { customerioSyncJobService } from '../services/customerioSyncJobService.js';
import { logger } from '../utils/logger.js';

// ============================================
// CONFIGURATION
// ============================================

interface ProcessorConfig {
  /** Interval between processing runs in milliseconds */
  intervalMs: number;
  /** Maximum jobs to process per run */
  batchSize: number;
  /** Whether to run continuously or just once */
  continuous: boolean;
}

const DEFAULT_CONFIG: ProcessorConfig = {
  intervalMs: 10000, // 10 seconds
  batchSize: 10,
  continuous: true,
};

// ============================================
// PROCESSOR STATE
// ============================================

let isRunning = false;
let intervalHandle: NodeJS.Timeout | null = null;

// ============================================
// PROCESSOR FUNCTIONS
// ============================================

/**
 * Run a single processing cycle
 */
async function runProcessingCycle(batchSize: number): Promise<void> {
  try {
    // Clean up any stuck jobs first
    const stuckCount = await customerioSyncJobService.cleanupStuckJobs();
    if (stuckCount > 0) {
      logger.info({ stuckCount }, 'Cleaned up stuck Customer.io sync jobs');
    }

    // Process pending jobs
    const results = await customerioSyncJobService.processPendingJobs(batchSize);

    if (results.length > 0) {
      const succeeded = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success && !r.shouldRetry).length;
      const retrying = results.filter((r) => r.shouldRetry).length;

      logger.info(
        {
          processed: results.length,
          succeeded,
          failed,
          retrying,
        },
        'Customer.io sync processing cycle complete'
      );
    }
  } catch (error) {
    logger.error({ error }, 'Error in Customer.io sync processing cycle');
  }
}

/**
 * Start the Customer.io sync job processor
 */
export function startCustomerioSyncProcessor(
  config: Partial<ProcessorConfig> = {}
): void {
  const { intervalMs, batchSize, continuous } = { ...DEFAULT_CONFIG, ...config };

  if (isRunning) {
    logger.warn('Customer.io sync processor is already running');
    return;
  }

  isRunning = true;
  logger.info(
    { intervalMs, batchSize, continuous },
    'Starting Customer.io sync job processor'
  );

  // Run immediately
  runProcessingCycle(batchSize);

  if (continuous) {
    // Then run on interval
    intervalHandle = setInterval(() => {
      runProcessingCycle(batchSize);
    }, intervalMs);
  }
}

/**
 * Stop the Customer.io sync job processor
 */
export function stopCustomerioSyncProcessor(): void {
  if (!isRunning) {
    logger.warn('Customer.io sync processor is not running');
    return;
  }

  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }

  isRunning = false;
  logger.info('Stopped Customer.io sync job processor');
}

/**
 * Check if the processor is running
 */
export function isProcessorRunning(): boolean {
  return isRunning;
}

/**
 * Run processor once (for manual/cron execution)
 */
export async function runOnce(batchSize: number = 10): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  retrying: number;
}> {
  const results = await customerioSyncJobService.processPendingJobs(batchSize);

  return {
    processed: results.length,
    succeeded: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success && !r.shouldRetry).length,
    retrying: results.filter((r) => r.shouldRetry).length,
  };
}

// ============================================
// CLI ENTRY POINT
// ============================================

/**
 * CLI entry point for running the processor directly
 * Usage: npx tsx src/jobs/processCustomerioSyncJobs.ts [--continuous] [--batch=N]
 */
export async function main(): Promise<void> {
  const continuous = process.argv.includes('--continuous');
  const batchSize = parseInt(process.argv.find((a) => a.startsWith('--batch='))?.split('=')[1] || '10');

  if (continuous) {
    startCustomerioSyncProcessor({ batchSize });

    // Handle shutdown gracefully
    process.on('SIGINT', () => {
      logger.info('Received SIGINT, shutting down...');
      stopCustomerioSyncProcessor();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      logger.info('Received SIGTERM, shutting down...');
      stopCustomerioSyncProcessor();
      process.exit(0);
    });
  } else {
    // Run once and exit
    const result = await runOnce(batchSize);
    logger.info(result, 'Customer.io sync processing complete');
  }
}
