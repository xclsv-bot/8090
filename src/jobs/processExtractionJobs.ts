/**
 * Extraction Job Processor
 * WO-68: AI Extraction Pipeline - Job Processing Script
 *
 * This script processes pending extraction jobs with retry logic.
 * Run via cron or worker process:
 * - Every 1-5 minutes for real-time processing
 * - Or use a worker queue for production scale
 *
 * Usage:
 *   npx tsx src/jobs/processExtractionJobs.ts [--limit N] [--cleanup]
 *   Or: node dist/jobs/processExtractionJobs.js [--limit N] [--cleanup]
 */

import { extractionJobService } from '../services/extractionJobService.js';
import { logger } from '../utils/logger.js';

// ============================================
// CONFIGURATION
// ============================================

const DEFAULT_BATCH_SIZE = 10;
const PROCESSING_INTERVAL_MS = 5000; // 5 seconds between batches
const MAX_RUNTIME_MS = 55000; // 55 seconds max runtime (for cron safety)

// ============================================
// MAIN PROCESSOR
// ============================================

interface ProcessorOptions {
  /** Number of jobs to process per batch */
  limit: number;
  /** Whether to clean up stuck jobs */
  cleanup: boolean;
  /** Run continuously until MAX_RUNTIME_MS */
  continuous: boolean;
}

async function processExtractionJobs(options: ProcessorOptions): Promise<void> {
  const startTime = Date.now();

  logger.info(
    { options },
    'Starting extraction job processor'
  );

  // Clean up stuck jobs if requested
  if (options.cleanup) {
    const resetCount = await extractionJobService.cleanupStuckJobs();
    logger.info({ resetCount }, 'Cleaned up stuck jobs');
  }

  let totalProcessed = 0;
  let totalSucceeded = 0;
  let totalFailed = 0;
  let totalRetrying = 0;
  let batchCount = 0;

  // Process batches
  do {
    const results = await extractionJobService.processPendingJobs(options.limit);

    if (results.length === 0) {
      if (!options.continuous) {
        logger.info('No pending jobs found');
        break;
      }

      // Wait before checking again in continuous mode
      await sleep(PROCESSING_INTERVAL_MS);
      continue;
    }

    batchCount++;
    totalProcessed += results.length;
    totalSucceeded += results.filter((r) => r.success).length;
    totalFailed += results.filter((r) => !r.success && !r.shouldRetry).length;
    totalRetrying += results.filter((r) => r.shouldRetry).length;

    logger.info(
      {
        batch: batchCount,
        processed: results.length,
        succeeded: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success && !r.shouldRetry).length,
        retrying: results.filter((r) => r.shouldRetry).length,
      },
      'Batch complete'
    );

    // If not continuous, just process one batch
    if (!options.continuous) {
      break;
    }

    // Check if we've exceeded max runtime
    const elapsed = Date.now() - startTime;
    if (elapsed >= MAX_RUNTIME_MS) {
      logger.info({ elapsed }, 'Max runtime reached, stopping');
      break;
    }

    // Small delay between batches to avoid overwhelming services
    await sleep(1000);
  } while (true);

  const totalTime = Date.now() - startTime;

  logger.info(
    {
      totalTime,
      batchCount,
      totalProcessed,
      totalSucceeded,
      totalFailed,
      totalRetrying,
    },
    'Extraction job processor finished'
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================
// CLI INTERFACE
// ============================================

function parseArgs(): ProcessorOptions {
  const args = process.argv.slice(2);
  const options: ProcessorOptions = {
    limit: DEFAULT_BATCH_SIZE,
    cleanup: false,
    continuous: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[i + 1]);
      i++;
    } else if (arg === '--cleanup') {
      options.cleanup = true;
    } else if (arg === '--continuous') {
      options.continuous = true;
    } else if (arg === '--help') {
      console.log(`
Extraction Job Processor

Usage:
  npx ts-node src/jobs/processExtractionJobs.ts [options]

Options:
  --limit N       Number of jobs to process per batch (default: ${DEFAULT_BATCH_SIZE})
  --cleanup       Clean up stuck processing jobs before starting
  --continuous    Run continuously until max runtime reached
  --help          Show this help message

Examples:
  # Process up to 10 pending jobs
  npx ts-node src/jobs/processExtractionJobs.ts

  # Process with cleanup and custom limit
  npx ts-node src/jobs/processExtractionJobs.ts --cleanup --limit 20

  # Run continuously (for worker mode)
  npx ts-node src/jobs/processExtractionJobs.ts --continuous
      `);
      process.exit(0);
    }
  }

  return options;
}

// ============================================
// ENTRY POINT
// ============================================

// Run if executed directly
// Note: This file is designed to be run as a standalone script
const options = parseArgs();

processExtractionJobs(options)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    logger.error({ error }, 'Extraction job processor failed');
    process.exit(1);
  });

// Export for testing
export { processExtractionJobs, ProcessorOptions };
