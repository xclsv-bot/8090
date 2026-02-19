/**
 * Extraction Job Service
 * WO-68: AI Extraction Pipeline - Job Management
 *
 * Handles asynchronous AI extraction job processing with:
 * - Job creation immediately after sign-up submission
 * - Exponential backoff retry mechanism (5s, 25s, 125s)
 * - Status management and audit tracking
 * - Integration with AI vision service
 * - Update sign-up with extraction results
 */

import { randomUUID } from 'crypto';
import { PoolClient } from 'pg';
import { db } from './database.js';
import {
  aiVisionService,
  AIServiceUnavailableError,
  ExtractionTimeoutError,
  type BetSlipExtractionResult,
} from './aiVisionService.js';
import { eventPublisher } from './eventPublisher.js';
import { logger } from '../utils/logger.js';
import type {
  SignUpExtractionJob,
  JobStatus,
  ExtractionStatus,
  CreateAuditLogInput,
} from '../types/signup.js';

// ============================================
// TYPES
// ============================================

/**
 * Configuration for extraction retries
 */
interface RetryConfig {
  maxAttempts: number;
  /** Base delay in milliseconds for exponential backoff */
  baseDelayMs: number;
  /** Multiplier for exponential backoff */
  backoffMultiplier: number;
}

/**
 * Result of processing an extraction job
 */
interface ProcessJobResult {
  success: boolean;
  signupId: string;
  jobId: string;
  status: JobStatus;
  extraction?: BetSlipExtractionResult;
  error?: string;
  shouldRetry: boolean;
  nextRetryAt?: Date;
}

/**
 * Extraction job with signup details for processing
 */
interface ExtractionJobWithSignup extends SignUpExtractionJob {
  imageUrl: string;
  operatorId: number;
  customerEmail: string;
}

// ============================================
// CONSTANTS
// ============================================

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 5000, // 5 seconds
  backoffMultiplier: 5, // 5s -> 25s -> 125s
};

// ============================================
// EXTRACTION JOB SERVICE
// ============================================

class ExtractionJobService {
  private readonly retryConfig: RetryConfig;

  constructor(retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG) {
    this.retryConfig = retryConfig;
  }

  /**
   * Create an extraction job for a sign-up
   * Called immediately after sign-up submission
   */
  async createJob(signupId: string, client?: PoolClient): Promise<SignUpExtractionJob> {
    const id = randomUUID();
    const now = new Date();

    const query = `
      INSERT INTO signup_extraction_jobs (
        id, signup_id, status, attempt_count, max_attempts,
        created_at, updated_at
      ) VALUES ($1, $2, 'pending', 0, $3, $4, $4)
      RETURNING *
    `;

    const values = [id, signupId, this.retryConfig.maxAttempts, now];

    let job: SignUpExtractionJob | null;
    
    if (client) {
      const result = await client.query<SignUpExtractionJob>(query, values);
      job = result.rows[0] || null;
    } else {
      job = await db.queryOne<SignUpExtractionJob>(query, values);
    }

    if (job) {
      // Create audit log entry
      await this.createAuditLog({
        signupId,
        action: 'extraction_started',
        details: { jobId: id },
      });

      logger.info({ signupId, jobId: id }, 'Extraction job created');
    }

    return job!;
  }

  /**
   * Get pending jobs ready for processing
   * Returns jobs that are pending and either:
   * - Have no next_retry_at (first attempt)
   * - Have next_retry_at in the past
   */
  async getPendingJobs(limit: number = 10): Promise<ExtractionJobWithSignup[]> {
    return db.queryMany<ExtractionJobWithSignup>(
      `SELECT 
        j.*,
        s.image_url,
        s.operator_id,
        s.customer_email
       FROM signup_extraction_jobs j
       JOIN signups s ON s.id = j.signup_id
       WHERE j.status = 'pending'
       AND s.image_url IS NOT NULL
       AND (j.next_retry_at IS NULL OR j.next_retry_at <= NOW())
       ORDER BY j.created_at ASC
       LIMIT $1`,
      [limit]
    );
  }

  /**
   * Get a single extraction job by ID
   */
  async getJob(jobId: string): Promise<SignUpExtractionJob | null> {
    return db.queryOne<SignUpExtractionJob>(
      'SELECT * FROM signup_extraction_jobs WHERE id = $1',
      [jobId]
    );
  }

  /**
   * Get extraction job by signup ID
   */
  async getJobBySignupId(signupId: string): Promise<SignUpExtractionJob | null> {
    return db.queryOne<SignUpExtractionJob>(
      'SELECT * FROM signup_extraction_jobs WHERE signup_id = $1',
      [signupId]
    );
  }

  /**
   * Process a single extraction job
   */
  async processJob(job: ExtractionJobWithSignup): Promise<ProcessJobResult> {
    const { id: jobId, signupId, imageUrl, operatorId, attemptCount } = job;

    logger.info(
      { jobId, signupId, attempt: attemptCount + 1 },
      'Processing extraction job'
    );

    try {
      // Mark job as processing
      await this.updateJobStatus(jobId, 'processing');

      // Call AI vision service
      const extraction = await aiVisionService.extractBetSlipData(imageUrl, {
        operatorHint: operatorId ? String(operatorId) : undefined,
      });

      // Update signup with extraction results
      await this.updateSignupWithExtraction(signupId, extraction);

      // Mark job as completed
      await this.completeJob(jobId, extraction);

      // Create audit log
      await this.createAuditLog({
        signupId,
        action: 'extraction_completed',
        details: {
          jobId,
          confidenceScore: extraction.confidenceScore,
          betAmount: extraction.betAmount,
          teamBetOn: extraction.teamBetOn,
          odds: extraction.odds,
        },
      });

      // Publish WebSocket event
      await this.publishExtractionCompleted(signupId, extraction);

      logger.info(
        {
          jobId,
          signupId,
          confidenceScore: extraction.confidenceScore,
        },
        'Extraction job completed successfully'
      );

      return {
        success: true,
        signupId,
        jobId,
        status: 'completed',
        extraction,
        shouldRetry: false,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const newAttemptCount = attemptCount + 1;

      // Determine if we should retry
      const shouldRetry =
        newAttemptCount < this.retryConfig.maxAttempts &&
        this.isRetryableError(error);

      if (shouldRetry) {
        // Schedule retry with exponential backoff
        const nextRetryAt = this.calculateNextRetry(newAttemptCount);

        await this.scheduleRetry(jobId, newAttemptCount, errorMessage, nextRetryAt);

        logger.warn(
          {
            jobId,
            signupId,
            attempt: newAttemptCount,
            nextRetryAt,
            error: errorMessage,
          },
          'Extraction job failed, scheduling retry'
        );

        return {
          success: false,
          signupId,
          jobId,
          status: 'pending',
          error: errorMessage,
          shouldRetry: true,
          nextRetryAt,
        };
      } else {
        // Max retries exhausted or non-retryable error
        await this.failJob(jobId, newAttemptCount, errorMessage);

        // Mark signup extraction as skipped
        await this.skipSignupExtraction(signupId, errorMessage);

        // Create audit log
        await this.createAuditLog({
          signupId,
          action: 'extraction_failed',
          details: {
            jobId,
            attempt: newAttemptCount,
            error: errorMessage,
            exhaustedRetries: newAttemptCount >= this.retryConfig.maxAttempts,
          },
        });

        logger.error(
          {
            jobId,
            signupId,
            attempt: newAttemptCount,
            error: errorMessage,
          },
          'Extraction job failed permanently'
        );

        return {
          success: false,
          signupId,
          jobId,
          status: 'failed',
          error: errorMessage,
          shouldRetry: false,
        };
      }
    }
  }

  /**
   * Process multiple pending jobs (batch processing)
   */
  async processPendingJobs(limit: number = 10): Promise<ProcessJobResult[]> {
    const jobs = await this.getPendingJobs(limit);

    if (jobs.length === 0) {
      return [];
    }

    logger.info({ jobCount: jobs.length }, 'Processing batch of extraction jobs');

    const results: ProcessJobResult[] = [];

    // Process jobs sequentially to avoid overwhelming AI service
    for (const job of jobs) {
      const result = await this.processJob(job);
      results.push(result);

      // Small delay between jobs
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success && !r.shouldRetry).length;
    const retrying = results.filter((r) => r.shouldRetry).length;

    logger.info(
      { succeeded, failed, retrying, total: jobs.length },
      'Batch processing complete'
    );

    return results;
  }

  /**
   * Update job status
   */
  private async updateJobStatus(jobId: string, status: JobStatus): Promise<void> {
    await db.query(
      `UPDATE signup_extraction_jobs 
       SET status = $1, updated_at = NOW()
       WHERE id = $2`,
      [status, jobId]
    );
  }

  /**
   * Complete a job with extraction results
   */
  private async completeJob(
    jobId: string,
    extraction: BetSlipExtractionResult
  ): Promise<void> {
    await db.query(
      `UPDATE signup_extraction_jobs 
       SET status = 'completed',
           ai_response = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(extraction.rawResponse), jobId]
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
      `UPDATE signup_extraction_jobs 
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
      `UPDATE signup_extraction_jobs 
       SET status = 'failed',
           attempt_count = $1,
           error_message = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [attemptCount, errorMessage, jobId]
    );
  }

  /**
   * Update signup with extraction results
   */
  private async updateSignupWithExtraction(
    signupId: string,
    extraction: BetSlipExtractionResult
  ): Promise<void> {
    await db.query(
      `UPDATE signups 
       SET extraction_status = 'pending',
           extraction_confidence = $1,
           bet_amount = $2,
           team_bet_on = $3,
           odds = $4,
           updated_at = NOW()
       WHERE id = $5`,
      [
        extraction.confidenceScore,
        extraction.betAmount,
        extraction.teamBetOn,
        extraction.odds,
        signupId,
      ]
    );
  }

  /**
   * Mark signup extraction as skipped (failed permanently)
   */
  private async skipSignupExtraction(
    signupId: string,
    reason: string
  ): Promise<void> {
    await db.query(
      `UPDATE signups 
       SET extraction_status = 'skipped',
           updated_at = NOW()
       WHERE id = $1`,
      [signupId]
    );

    logger.info({ signupId, reason }, 'Signup extraction marked as skipped');
  }

  /**
   * Calculate next retry time with exponential backoff
   * Delays: 5s, 25s, 125s (base * multiplier^attempt)
   */
  private calculateNextRetry(attemptCount: number): Date {
    const delayMs =
      this.retryConfig.baseDelayMs *
      Math.pow(this.retryConfig.backoffMultiplier, attemptCount - 1);

    return new Date(Date.now() + delayMs);
  }

  /**
   * Determine if an error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    // Retryable: service unavailable, timeouts
    if (error instanceof AIServiceUnavailableError) return true;
    if (error instanceof ExtractionTimeoutError) return true;

    // Retryable: network errors
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (
        message.includes('network') ||
        message.includes('timeout') ||
        message.includes('econnrefused') ||
        message.includes('enotfound') ||
        message.includes('unavailable')
      ) {
        return true;
      }
    }

    // Non-retryable by default
    return false;
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
   * Publish WebSocket event for extraction completion
   */
  private async publishExtractionCompleted(
    signupId: string,
    extraction: BetSlipExtractionResult
  ): Promise<void> {
    try {
      await eventPublisher.publish({
        type: 'sign_up.extraction_completed',
        metadata: {
          signupId,
          extractionStatus: 'pending', // Pending admin review
          extractionConfidence: extraction.confidenceScore,
          betAmount: extraction.betAmount,
          teamBetOn: extraction.teamBetOn,
          odds: extraction.odds,
        },
      });
    } catch (error) {
      logger.error({ error, signupId }, 'Failed to publish extraction event');
    }
  }

  /**
   * Get extraction job statistics
   */
  async getJobStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    avgConfidence: number | null;
  }> {
    const stats = await db.queryOne<{
      pending: string;
      processing: string;
      completed: string;
      failed: string;
      avg_confidence: string | null;
    }>(
      `SELECT 
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'processing') as processing,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        AVG(
          CASE WHEN status = 'completed' 
          THEN (ai_response->>'confidenceScore')::numeric 
          END
        ) as avg_confidence
       FROM signup_extraction_jobs`
    );

    return {
      pending: parseInt(stats?.pending || '0'),
      processing: parseInt(stats?.processing || '0'),
      completed: parseInt(stats?.completed || '0'),
      failed: parseInt(stats?.failed || '0'),
      avgConfidence: stats?.avg_confidence ? parseFloat(stats.avg_confidence) : null,
    };
  }

  /**
   * Clean up stuck processing jobs
   * Jobs stuck in 'processing' for more than 5 minutes are reset
   */
  async cleanupStuckJobs(): Promise<number> {
    const result = await db.query(
      `UPDATE signup_extraction_jobs 
       SET status = 'pending', 
           updated_at = NOW()
       WHERE status = 'processing'
       AND updated_at < NOW() - INTERVAL '5 minutes'`
    );

    const resetCount = result.rowCount || 0;
    if (resetCount > 0) {
      logger.info({ resetCount }, 'Reset stuck extraction jobs');
    }

    return resetCount;
  }
}

// Export singleton instance
export const extractionJobService = new ExtractionJobService();

// Export types
export type { ProcessJobResult, ExtractionJobWithSignup };
