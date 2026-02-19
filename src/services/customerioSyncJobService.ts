/**
 * Customer.io Sync Job Service
 * WO-69: Customer.io Sync System and Retry Infrastructure
 *
 * Handles:
 * - Two-phase sync job creation (initial + enriched)
 * - 5-retry exponential backoff (5s, 25s, 125s, 625s, 3125s)
 * - Job status management
 * - Failure queue for admin intervention
 * - Manual retry functionality
 * - Audit logging
 */

import { randomUUID } from 'crypto';
import { PoolClient } from 'pg';
import { db } from './database.js';
import {
  customerioService,
  type InitialSyncData,
  type EnrichedSyncData,
  CustomerioApiError,
} from './customerioService.js';
import { eventPublisher } from './eventPublisher.js';
import { logger } from '../utils/logger.js';
import type {
  SignUpCustomerioSyncJob,
  JobStatus,
  SyncPhase,
  CreateAuditLogInput,
} from '../types/signup.js';

// ============================================
// TYPES
// ============================================

/**
 * Configuration for sync retries
 */
interface RetryConfig {
  maxAttempts: number;
  /** Base delay in milliseconds for exponential backoff */
  baseDelayMs: number;
  /** Multiplier for exponential backoff */
  backoffMultiplier: number;
}

/**
 * Result of processing a sync job
 */
export interface ProcessSyncJobResult {
  success: boolean;
  signupId: string;
  jobId: string;
  status: JobStatus;
  syncPhase: SyncPhase;
  contactId?: string;
  error?: string;
  shouldRetry: boolean;
  nextRetryAt?: Date;
}

/**
 * Sync job with signup details for processing
 */
interface SyncJobWithSignup extends SignUpCustomerioSyncJob {
  // Sign-up fields
  customerEmail: string;
  customerFirstName: string;
  customerLastName: string;
  customerPhone?: string;
  customerState?: string;
  operatorId: number;
  operatorName?: string;
  eventId?: string;
  eventName?: string;
  ambassadorId: string;
  ambassadorName?: string;
  submittedAt: Date;
  sourceType: 'event' | 'solo';
  // Extraction fields (for enriched sync)
  betAmount?: number;
  teamBetOn?: string;
  odds?: string;
  extractionConfidence?: number;
  extractionReviewedAt?: Date;
}

/**
 * Failure queue item for admin display
 */
export interface SyncFailureItem {
  id: string;
  signupId: string;
  customerName: string;
  customerEmail: string;
  syncPhase: SyncPhase;
  errorMessage: string;
  attemptCount: number;
  lastAttemptAt: Date;
  createdAt: Date;
}

/**
 * Filter options for failure queue
 */
export interface FailureQueueFilters {
  syncPhase?: SyncPhase;
  errorType?: 'rate_limit' | 'server_error' | 'network' | 'other';
  search?: string;
  limit?: number;
  offset?: number;
}

// ============================================
// CONSTANTS
// ============================================

// Exponential backoff: 5s, 25s, 125s, 625s, 3125s
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 5,
  baseDelayMs: 5000, // 5 seconds
  backoffMultiplier: 5, // 5^n seconds
};

// ============================================
// CUSTOMER.IO SYNC JOB SERVICE
// ============================================

class CustomerioSyncJobService {
  private readonly retryConfig: RetryConfig;

  constructor(retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG) {
    this.retryConfig = retryConfig;
  }

  /**
   * Create an initial sync job (Phase 1)
   * Called immediately after sign-up submission
   */
  async createInitialSyncJob(
    signupId: string,
    client?: PoolClient
  ): Promise<SignUpCustomerioSyncJob> {
    return this.createSyncJob(signupId, 'initial', client);
  }

  /**
   * Create an enriched sync job (Phase 2)
   * Called after extraction confirmation
   */
  async createEnrichedSyncJob(
    signupId: string,
    client?: PoolClient
  ): Promise<SignUpCustomerioSyncJob> {
    return this.createSyncJob(signupId, 'enriched', client);
  }

  /**
   * Create a sync job with specified phase
   */
  private async createSyncJob(
    signupId: string,
    syncPhase: SyncPhase,
    client?: PoolClient
  ): Promise<SignUpCustomerioSyncJob> {
    const id = randomUUID();
    const now = new Date();

    // Check for existing non-completed job first
    const existingJob = await (client 
      ? client.query<SignUpCustomerioSyncJob>(
          `SELECT * FROM signup_customerio_sync_jobs 
           WHERE signup_id = $1 AND sync_phase = $2`,
          [signupId, syncPhase]
        ).then(r => r.rows[0] || null)
      : db.queryOne<SignUpCustomerioSyncJob>(
          `SELECT * FROM signup_customerio_sync_jobs 
           WHERE signup_id = $1 AND sync_phase = $2`,
          [signupId, syncPhase]
        )
    );

    // If there's an existing completed job, we don't recreate
    if (existingJob?.status === 'completed') {
      logger.info(
        { signupId, jobId: existingJob.id, syncPhase },
        'Customer.io sync job already completed, skipping'
      );
      return existingJob;
    }

    // If there's an existing job that's not completed, reset it
    if (existingJob) {
      const resetQuery = `
        UPDATE signup_customerio_sync_jobs
        SET status = 'pending',
            attempt_count = 0,
            next_retry_at = NULL,
            error_message = NULL,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `;

      let resetJob: SignUpCustomerioSyncJob | null;
      if (client) {
        const result = await client.query<SignUpCustomerioSyncJob>(resetQuery, [existingJob.id]);
        resetJob = result.rows[0] || null;
      } else {
        resetJob = await db.queryOne<SignUpCustomerioSyncJob>(resetQuery, [existingJob.id]);
      }

      logger.info(
        { signupId, jobId: existingJob.id, syncPhase },
        'Customer.io sync job reset for retry'
      );

      return resetJob!;
    }

    // Create new job
    const query = `
      INSERT INTO signup_customerio_sync_jobs (
        id, signup_id, status, attempt_count, max_attempts,
        sync_phase, created_at, updated_at
      ) VALUES ($1, $2, 'pending', 0, $3, $4, $5, $5)
      RETURNING *
    `;

    const values = [id, signupId, this.retryConfig.maxAttempts, syncPhase, now];

    let job: SignUpCustomerioSyncJob | null;

    if (client) {
      const result = await client.query<SignUpCustomerioSyncJob>(query, values);
      job = result.rows[0] || null;
    } else {
      job = await db.queryOne<SignUpCustomerioSyncJob>(query, values);
    }

    if (job) {
      logger.info(
        { signupId, jobId: job.id, syncPhase },
        'Customer.io sync job created'
      );
    }

    return job!;
  }

  /**
   * Get pending jobs ready for processing
   * Returns jobs that are pending/failed and ready for retry
   */
  async getPendingJobs(limit: number = 10): Promise<SyncJobWithSignup[]> {
    return db.queryMany<SyncJobWithSignup>(
      `SELECT 
        j.*,
        s.customer_email,
        s.customer_first_name,
        s.customer_last_name,
        s.customer_phone,
        s.customer_state,
        s.operator_id,
        o.name as operator_name,
        s.event_id,
        e.name as event_name,
        s.ambassador_id,
        CONCAT(a.first_name, ' ', a.last_name) as ambassador_name,
        s.submitted_at,
        s.source_type,
        s.bet_amount,
        s.team_bet_on,
        s.odds,
        s.extraction_confidence,
        s.extraction_reviewed_at
       FROM signup_customerio_sync_jobs j
       JOIN signups s ON s.id = j.signup_id
       LEFT JOIN operators o ON o.id = s.operator_id
       LEFT JOIN events e ON e.id = s.event_id
       LEFT JOIN ambassadors a ON a.id = s.ambassador_id
       WHERE j.status IN ('pending', 'failed')
       AND (j.next_retry_at IS NULL OR j.next_retry_at <= NOW())
       ORDER BY j.created_at ASC
       LIMIT $1`,
      [limit]
    );
  }

  /**
   * Get a single sync job by ID
   */
  async getJob(jobId: string): Promise<SignUpCustomerioSyncJob | null> {
    return db.queryOne<SignUpCustomerioSyncJob>(
      'SELECT * FROM signup_customerio_sync_jobs WHERE id = $1',
      [jobId]
    );
  }

  /**
   * Get sync jobs by signup ID
   */
  async getJobsBySignupId(signupId: string): Promise<SignUpCustomerioSyncJob[]> {
    return db.queryMany<SignUpCustomerioSyncJob>(
      `SELECT * FROM signup_customerio_sync_jobs 
       WHERE signup_id = $1 
       ORDER BY created_at DESC`,
      [signupId]
    );
  }

  /**
   * Process a single sync job
   */
  async processJob(job: SyncJobWithSignup): Promise<ProcessSyncJobResult> {
    const { id: jobId, signupId, syncPhase, attemptCount } = job;

    logger.info(
      { jobId, signupId, syncPhase, attempt: attemptCount + 1 },
      'Processing Customer.io sync job'
    );

    try {
      // Mark job as processing
      await this.updateJobStatus(jobId, 'processing');

      let result;

      if (syncPhase === 'initial') {
        // Phase 1: Initial sync
        result = await customerioService.syncInitialSignUp({
          signupId,
          customerEmail: job.customerEmail,
          customerName: `${job.customerFirstName} ${job.customerLastName}`.trim(),
          firstName: job.customerFirstName,
          lastName: job.customerLastName,
          customerPhone: job.customerPhone,
          customerState: job.customerState,
          operatorId: job.operatorId,
          operatorName: job.operatorName,
          eventId: job.eventId,
          eventName: job.eventName,
          ambassadorId: job.ambassadorId,
          ambassadorName: job.ambassadorName,
          submittedAt: job.submittedAt,
          sourceType: job.sourceType,
        });
      } else {
        // Phase 2: Enriched sync
        result = await customerioService.syncEnrichedData({
          signupId,
          customerEmail: job.customerEmail,
          betAmount: job.betAmount,
          teamBetOn: job.teamBetOn,
          odds: job.odds,
          extractionConfidence: job.extractionConfidence,
          confirmedAt: job.extractionReviewedAt || new Date(),
        });
      }

      if (result.success) {
        // Mark job as completed
        await this.completeJob(jobId, result.contactId);

        // Update signup sync status
        await this.updateSignupSyncStatus(signupId, syncPhase, true, result.contactId);

        // Create audit log
        await this.createAuditLog({
          signupId,
          action: 'customerio_synced',
          details: {
            jobId,
            syncPhase,
            contactId: result.contactId,
          },
        });

        // Publish WebSocket event
        await this.publishSyncEvent(signupId, syncPhase, true);

        logger.info(
          { jobId, signupId, syncPhase, contactId: result.contactId },
          'Customer.io sync completed successfully'
        );

        return {
          success: true,
          signupId,
          jobId,
          status: 'completed',
          syncPhase,
          contactId: result.contactId,
          shouldRetry: false,
        };
      } else {
        throw new Error(result.error || 'Unknown error');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const newAttemptCount = attemptCount + 1;

      // Determine if we should retry
      const shouldRetry =
        newAttemptCount < this.retryConfig.maxAttempts &&
        customerioService.isRetryableError(error);

      if (shouldRetry) {
        // Schedule retry with exponential backoff
        const nextRetryAt = this.calculateNextRetry(newAttemptCount);

        await this.scheduleRetry(jobId, newAttemptCount, errorMessage, nextRetryAt);

        logger.warn(
          {
            jobId,
            signupId,
            syncPhase,
            attempt: newAttemptCount,
            nextRetryAt,
            error: errorMessage,
          },
          'Customer.io sync job failed, scheduling retry'
        );

        return {
          success: false,
          signupId,
          jobId,
          status: 'pending',
          syncPhase,
          error: errorMessage,
          shouldRetry: true,
          nextRetryAt,
        };
      } else {
        // Max retries exhausted or non-retryable error
        await this.failJob(jobId, newAttemptCount, errorMessage);

        // Update signup to mark sync as failed
        await this.updateSignupSyncStatus(signupId, syncPhase, false, undefined, errorMessage);

        // Create audit log
        await this.createAuditLog({
          signupId,
          action: 'customerio_sync_failed',
          details: {
            jobId,
            syncPhase,
            attempt: newAttemptCount,
            error: errorMessage,
            exhaustedRetries: newAttemptCount >= this.retryConfig.maxAttempts,
          },
        });

        // Publish WebSocket event
        await this.publishSyncEvent(signupId, syncPhase, false, errorMessage);

        logger.error(
          {
            jobId,
            signupId,
            syncPhase,
            attempt: newAttemptCount,
            error: errorMessage,
          },
          'Customer.io sync job failed permanently'
        );

        return {
          success: false,
          signupId,
          jobId,
          status: 'failed',
          syncPhase,
          error: errorMessage,
          shouldRetry: false,
        };
      }
    }
  }

  /**
   * Process multiple pending jobs (batch processing)
   */
  async processPendingJobs(limit: number = 10): Promise<ProcessSyncJobResult[]> {
    const jobs = await this.getPendingJobs(limit);

    if (jobs.length === 0) {
      return [];
    }

    logger.info({ jobCount: jobs.length }, 'Processing batch of Customer.io sync jobs');

    const results: ProcessSyncJobResult[] = [];

    // Process jobs sequentially to respect rate limits
    for (const job of jobs) {
      const result = await this.processJob(job);
      results.push(result);

      // Small delay between jobs to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success && !r.shouldRetry).length;
    const retrying = results.filter((r) => r.shouldRetry).length;

    logger.info(
      { succeeded, failed, retrying, total: jobs.length },
      'Customer.io sync batch processing complete'
    );

    return results;
  }

  /**
   * Get sync failure queue for admin intervention
   */
  async getFailureQueue(filters: FailureQueueFilters = {}): Promise<{
    failures: SyncFailureItem[];
    total: number;
  }> {
    const { syncPhase, errorType, search, limit = 50, offset = 0 } = filters;

    const conditions: string[] = ["j.status = 'failed'"];
    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (syncPhase) {
      conditions.push(`j.sync_phase = $${paramIndex++}`);
      params.push(syncPhase);
    }

    if (errorType) {
      const errorPatterns: Record<string, string> = {
        rate_limit: '%429%',
        server_error: '%5__%',
        network: '%network%',
        other: '%',
      };
      if (errorType !== 'other') {
        conditions.push(`j.error_message ILIKE $${paramIndex++}`);
        params.push(errorPatterns[errorType]);
      }
    }

    if (search) {
      conditions.push(
        `(s.customer_email ILIKE $${paramIndex} OR CONCAT(s.customer_first_name, ' ', s.customer_last_name) ILIKE $${paramIndex})`
      );
      params.push(`%${search}%`);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countResult = await db.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM signup_customerio_sync_jobs j
       JOIN signups s ON s.id = j.signup_id
       WHERE ${whereClause}`,
      params
    );

    // Get failures with pagination
    params.push(limit, offset);
    const failures = await db.queryMany<SyncFailureItem>(
      `SELECT 
        j.id,
        j.signup_id as "signupId",
        CONCAT(s.customer_first_name, ' ', s.customer_last_name) as "customerName",
        s.customer_email as "customerEmail",
        j.sync_phase as "syncPhase",
        j.error_message as "errorMessage",
        j.attempt_count as "attemptCount",
        j.updated_at as "lastAttemptAt",
        j.created_at as "createdAt"
       FROM signup_customerio_sync_jobs j
       JOIN signups s ON s.id = j.signup_id
       WHERE ${whereClause}
       ORDER BY j.attempt_count DESC, j.updated_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      params
    );

    return {
      failures,
      total: parseInt(countResult?.count || '0'),
    };
  }

  /**
   * Manual retry for a failed sync job
   * Resets attempt count and schedules for immediate processing
   */
  async manualRetry(signupId: string, syncPhase?: SyncPhase): Promise<{
    retriedJobs: string[];
    message: string;
  }> {
    const retriedJobs: string[] = [];

    // Get failed jobs for this signup
    let query = `
      UPDATE signup_customerio_sync_jobs
      SET status = 'pending',
          attempt_count = 0,
          next_retry_at = NULL,
          error_message = NULL,
          updated_at = NOW()
      WHERE signup_id = $1
      AND status = 'failed'
    `;
    const params: (string | SyncPhase)[] = [signupId];

    if (syncPhase) {
      query += ' AND sync_phase = $2';
      params.push(syncPhase);
    }

    query += ' RETURNING id, sync_phase';

    const result = await db.queryMany<{ id: string; sync_phase: SyncPhase }>(query, params);

    for (const row of result) {
      retriedJobs.push(row.id);

      // Update signup to reset sync failure status
      await db.query(
        `UPDATE signups 
         SET customerio_sync_failed = false,
             customerio_sync_error = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [signupId]
      );

      // Create audit log
      await this.createAuditLog({
        signupId,
        action: 'customerio_synced', // We'll use a custom detail to indicate manual retry
        details: {
          jobId: row.id,
          syncPhase: row.sync_phase,
          manualRetry: true,
        },
      });

      logger.info(
        { signupId, jobId: row.id, syncPhase: row.sync_phase },
        'Manual retry scheduled for Customer.io sync'
      );
    }

    return {
      retriedJobs,
      message:
        retriedJobs.length > 0
          ? `Scheduled ${retriedJobs.length} job(s) for retry`
          : 'No failed jobs found to retry',
    };
  }

  /**
   * Update job status
   */
  private async updateJobStatus(jobId: string, status: JobStatus): Promise<void> {
    await db.query(
      `UPDATE signup_customerio_sync_jobs 
       SET status = $1, updated_at = NOW()
       WHERE id = $2`,
      [status, jobId]
    );
  }

  /**
   * Complete a job successfully
   */
  private async completeJob(jobId: string, contactId?: string): Promise<void> {
    await db.query(
      `UPDATE signup_customerio_sync_jobs 
       SET status = 'completed',
           updated_at = NOW()
       WHERE id = $1`,
      [jobId]
    );
  }

  /**
   * Schedule a retry for a job
   */
  private async scheduleRetry(
    jobId: string,
    attemptCount: number,
    errorMessage: string,
    nextRetryAt: Date
  ): Promise<void> {
    await db.query(
      `UPDATE signup_customerio_sync_jobs 
       SET status = 'pending',
           attempt_count = $1,
           error_message = $2,
           next_retry_at = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [attemptCount, errorMessage, nextRetryAt, jobId]
    );
  }

  /**
   * Mark a job as permanently failed
   */
  private async failJob(
    jobId: string,
    attemptCount: number,
    errorMessage: string
  ): Promise<void> {
    await db.query(
      `UPDATE signup_customerio_sync_jobs 
       SET status = 'failed',
           attempt_count = $1,
           error_message = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [attemptCount, errorMessage, jobId]
    );
  }

  /**
   * Update signup sync status
   */
  private async updateSignupSyncStatus(
    signupId: string,
    syncPhase: SyncPhase,
    success: boolean,
    contactId?: string,
    error?: string
  ): Promise<void> {
    if (success) {
      await db.query(
        `UPDATE signups 
         SET customerio_synced = true,
             customerio_synced_at = NOW(),
             customerio_contact_id = COALESCE($2, customerio_contact_id),
             customerio_sync_failed = false,
             customerio_sync_error = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [signupId, contactId]
      );
    } else {
      await db.query(
        `UPDATE signups 
         SET customerio_sync_failed = true,
             customerio_sync_error = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [signupId, error]
      );
    }
  }

  /**
   * Calculate next retry time with exponential backoff
   * Delays: 5s, 25s, 125s, 625s, 3125s
   */
  private calculateNextRetry(attemptCount: number): Date {
    const delayMs =
      this.retryConfig.baseDelayMs *
      Math.pow(this.retryConfig.backoffMultiplier, attemptCount - 1);

    return new Date(Date.now() + delayMs);
  }

  /**
   * Create audit log entry
   */
  private async createAuditLog(input: CreateAuditLogInput): Promise<void> {
    try {
      await db.query(
        `INSERT INTO signup_audit_log (id, signup_id, action, user_id, details, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [
          randomUUID(),
          input.signupId,
          input.action,
          input.userId || null,
          input.details ? JSON.stringify(input.details) : null,
        ]
      );
    } catch (error) {
      logger.error({ error, input }, 'Failed to create audit log');
    }
  }

  /**
   * Publish WebSocket event for sync status change
   */
  private async publishSyncEvent(
    signupId: string,
    syncPhase: SyncPhase,
    success: boolean,
    error?: string
  ): Promise<void> {
    try {
      await eventPublisher.publish({
        type: success ? 'sign_up.customerio_synced' : 'sign_up.customerio_sync_failed',
        metadata: {
          signupId,
          syncPhase,
          success,
          error,
        },
      });
    } catch (error) {
      logger.error({ error, signupId }, 'Failed to publish sync event');
    }
  }

  /**
   * Get sync job statistics
   */
  async getJobStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    byPhase: {
      initial: { completed: number; failed: number };
      enriched: { completed: number; failed: number };
    };
  }> {
    const stats = await db.queryOne<{
      pending: string;
      processing: string;
      completed: string;
      failed: string;
      initial_completed: string;
      initial_failed: string;
      enriched_completed: string;
      enriched_failed: string;
    }>(
      `SELECT 
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'processing') as processing,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'completed' AND sync_phase = 'initial') as initial_completed,
        COUNT(*) FILTER (WHERE status = 'failed' AND sync_phase = 'initial') as initial_failed,
        COUNT(*) FILTER (WHERE status = 'completed' AND sync_phase = 'enriched') as enriched_completed,
        COUNT(*) FILTER (WHERE status = 'failed' AND sync_phase = 'enriched') as enriched_failed
       FROM signup_customerio_sync_jobs`
    );

    return {
      pending: parseInt(stats?.pending || '0'),
      processing: parseInt(stats?.processing || '0'),
      completed: parseInt(stats?.completed || '0'),
      failed: parseInt(stats?.failed || '0'),
      byPhase: {
        initial: {
          completed: parseInt(stats?.initial_completed || '0'),
          failed: parseInt(stats?.initial_failed || '0'),
        },
        enriched: {
          completed: parseInt(stats?.enriched_completed || '0'),
          failed: parseInt(stats?.enriched_failed || '0'),
        },
      },
    };
  }

  /**
   * Clean up stuck processing jobs
   * Jobs stuck in 'processing' for more than 5 minutes are reset
   */
  async cleanupStuckJobs(): Promise<number> {
    const result = await db.query(
      `UPDATE signup_customerio_sync_jobs 
       SET status = 'pending', 
           updated_at = NOW()
       WHERE status = 'processing'
       AND updated_at < NOW() - INTERVAL '5 minutes'`
    );

    const resetCount = result.rowCount || 0;
    if (resetCount > 0) {
      logger.info({ resetCount }, 'Reset stuck Customer.io sync jobs');
    }

    return resetCount;
  }
}

// Export singleton instance
export const customerioSyncJobService = new CustomerioSyncJobService();

// Export types
export type { SyncJobWithSignup };
