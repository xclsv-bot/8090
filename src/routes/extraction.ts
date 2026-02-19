/**
 * Extraction Routes
 * WO-68: AI Extraction Pipeline - Admin Review Queue & Confirmation System
 *
 * Endpoints:
 * - GET /signups/extraction/review-queue - Priority-based admin review queue
 * - POST /signups/:id/extraction/confirm - Confirm or correct extraction
 * - POST /signups/:id/extraction/skip - Skip extraction for problematic images
 * - GET /signups/extraction/stats - Get extraction statistics
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { db } from '../services/database.js';
import { extractionJobService } from '../services/extractionJobService.js';
import { eventPublisher } from '../services/eventPublisher.js';
import { customerioSyncJobService } from '../services/customerioSyncJobService.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery, commonSchemas } from '../middleware/validate.js';
import { logger } from '../utils/logger.js';
import type {
  ExtractionReviewItem,
  ExtractionReviewQueueResponse,
  SignUpAuditAction,
} from '../types/signup.js';

// ============================================
// SCHEMAS
// ============================================

const reviewQueueQuerySchema = z.object({
  /** Filter by operator ID */
  operatorId: z.string().optional().transform((v) => v ? parseInt(v) : undefined),
  /** Filter by ambassador ID */
  ambassadorId: z.string().uuid().optional(),
  /** Minimum confidence score filter */
  minConfidence: z.string().optional().transform((v) => v ? parseFloat(v) : undefined),
  /** Maximum confidence score filter */
  maxConfidence: z.string().optional().transform((v) => v ? parseFloat(v) : undefined),
  /** Filter by missing fields */
  missingFields: z.enum(['bet_amount', 'team_bet_on', 'odds', 'any']).optional(),
  /** Sort by (default: priority) */
  sortBy: z.enum(['confidence', 'submitted_at', 'priority']).optional().default('priority'),
  /** Sort order */
  sortOrder: z.enum(['asc', 'desc']).optional().default('asc'),
  /** Page number (1-indexed) */
  page: z.string().optional().default('1').transform(Number),
  /** Items per page */
  pageSize: z.string().optional().default('20').transform(Number),
});

const confirmExtractionSchema = z.object({
  /** Corrected bet amount (optional) */
  betAmount: z.number().positive().optional(),
  /** Corrected team/selection (optional) */
  teamBetOn: z.string().min(1).max(255).optional(),
  /** Corrected odds (optional) */
  odds: z.string().min(1).max(50).optional(),
});

const skipExtractionSchema = z.object({
  /** Reason for skipping */
  reason: z.string().min(1).max(500).optional(),
});

// ============================================
// ROUTE HANDLERS
// ============================================

export async function extractionRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.addHook('preHandler', authenticate);

  /**
   * GET /signups/extraction/review-queue
   *
   * Returns pending extractions ordered by priority:
   * 1. Missing critical fields (bet_amount, team_bet_on) first
   * 2. Then by confidence score (lowest first)
   * 3. Then by submission time (oldest first)
   */
  fastify.get('/review-queue', {
    preHandler: [requireRole('admin', 'manager'), validateQuery(reviewQueueQuerySchema)],
  }, async (request, reply) => {
    const query = request.query as z.infer<typeof reviewQueueQuerySchema>;
    const { page, pageSize, sortBy, sortOrder } = query;

    // Build filter conditions
    const conditions: string[] = ["s.extraction_status = 'pending'"];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (query.operatorId) {
      conditions.push(`s.operator_id = $${paramIndex++}`);
      values.push(query.operatorId);
    }

    if (query.ambassadorId) {
      conditions.push(`s.ambassador_id = $${paramIndex++}`);
      values.push(query.ambassadorId);
    }

    if (query.minConfidence !== undefined) {
      conditions.push(`s.extraction_confidence >= $${paramIndex++}`);
      values.push(query.minConfidence);
    }

    if (query.maxConfidence !== undefined) {
      conditions.push(`s.extraction_confidence <= $${paramIndex++}`);
      values.push(query.maxConfidence);
    }

    if (query.missingFields) {
      if (query.missingFields === 'any') {
        conditions.push('(s.bet_amount IS NULL OR s.team_bet_on IS NULL OR s.odds IS NULL)');
      } else {
        const fieldMap: Record<string, string> = {
          bet_amount: 's.bet_amount IS NULL',
          team_bet_on: 's.team_bet_on IS NULL',
          odds: 's.odds IS NULL',
        };
        conditions.push(fieldMap[query.missingFields]);
      }
    }

    const whereClause = conditions.join(' AND ');

    // Build ORDER BY clause
    let orderClause: string;
    const order = sortOrder === 'desc' ? 'DESC' : 'ASC';
    const oppositeOrder = sortOrder === 'desc' ? 'ASC' : 'DESC';

    if (sortBy === 'priority') {
      // Priority order: missing critical fields first, then by confidence (low first), then by age
      orderClause = `
        ORDER BY 
          CASE WHEN s.bet_amount IS NULL OR s.team_bet_on IS NULL THEN 0 ELSE 1 END ASC,
          COALESCE(s.extraction_confidence, 0) ASC,
          s.submitted_at ASC
      `;
    } else if (sortBy === 'confidence') {
      orderClause = `ORDER BY COALESCE(s.extraction_confidence, 0) ${order}, s.submitted_at ASC`;
    } else {
      orderClause = `ORDER BY s.submitted_at ${order}`;
    }

    const offset = (page - 1) * pageSize;

    // Get paginated results
    const [items, countResult] = await Promise.all([
      db.queryMany<{
        id: string;
        customer_first_name: string;
        customer_last_name: string;
        customer_email: string;
        operator_id: number;
        operator_name: string | null;
        ambassador_id: string;
        ambassador_name: string | null;
        image_url: string | null;
        extraction_confidence: number | null;
        bet_amount: number | null;
        team_bet_on: string | null;
        odds: string | null;
        submitted_at: Date;
      }>(
        `SELECT 
          s.id,
          s.customer_first_name,
          s.customer_last_name,
          s.customer_email,
          s.operator_id,
          o.display_name as operator_name,
          s.ambassador_id,
          CONCAT(a.first_name, ' ', a.last_name) as ambassador_name,
          s.image_url,
          s.extraction_confidence,
          s.bet_amount,
          s.team_bet_on,
          s.odds,
          s.submitted_at
         FROM signups s
         LEFT JOIN operators o ON o.id = s.operator_id
         LEFT JOIN ambassadors a ON a.id = s.ambassador_id
         WHERE ${whereClause}
         ${orderClause}
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, pageSize, offset]
      ),
      db.queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM signups s WHERE ${whereClause}`,
        values
      ),
    ]);

    // Transform to response format
    const signups: ExtractionReviewItem[] = items.map((item) => {
      const missingFields: string[] = [];
      if (item.bet_amount === null) missingFields.push('bet_amount');
      if (item.team_bet_on === null) missingFields.push('team_bet_on');
      if (item.odds === null) missingFields.push('odds');

      return {
        id: item.id,
        customerName: `${item.customer_first_name} ${item.customer_last_name}`.trim(),
        customerEmail: item.customer_email,
        operator: item.operator_name || String(item.operator_id),
        ambassador: item.ambassador_name || item.ambassador_id,
        imageUrl: item.image_url || '',
        extractionConfidence: item.extraction_confidence ?? 0,
        betAmount: item.bet_amount ?? undefined,
        teamBetOn: item.team_bet_on ?? undefined,
        odds: item.odds ?? undefined,
        missingFields,
      };
    });

    const total = parseInt(countResult?.count || '0');

    const response: ExtractionReviewQueueResponse = {
      signups,
      totalPending: total,
    };

    return {
      success: true,
      data: response,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  });

  /**
   * POST /signups/:id/extraction/confirm
   *
   * Confirm extracted values as accurate or provide corrections.
   * Updates status to 'confirmed' with admin attribution.
   */
  fastify.post('/:id/extraction/confirm', {
    preHandler: [
      requireRole('admin', 'manager'),
      validateParams(commonSchemas.id),
      validateBody(confirmExtractionSchema),
    ],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const corrections = request.body as z.infer<typeof confirmExtractionSchema>;
    const userId = request.user?.id;

    // Get current signup
    const signup = await db.queryOne<{
      id: string;
      extraction_status: string;
      bet_amount: number | null;
      team_bet_on: string | null;
      odds: string | null;
    }>(
      `SELECT id, extraction_status, bet_amount, team_bet_on, odds 
       FROM signups WHERE id = $1`,
      [id]
    );

    if (!signup) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Signup not found' },
      });
    }

    if (signup.extraction_status !== 'pending') {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_STATUS',
          message: `Cannot confirm extraction with status '${signup.extraction_status}'`,
        },
      });
    }

    // Determine final values (corrections override extracted)
    const finalBetAmount = corrections.betAmount ?? signup.bet_amount;
    const finalTeamBetOn = corrections.teamBetOn ?? signup.team_bet_on;
    const finalOdds = corrections.odds ?? signup.odds;

    // Update signup with confirmed values
    const updatedSignup = await db.queryOne<{
      id: string;
      extraction_status: string;
      bet_amount: number | null;
      team_bet_on: string | null;
      odds: string | null;
      extraction_reviewed_by: string | null;
      extraction_reviewed_at: Date | null;
    }>(
      `UPDATE signups SET
        extraction_status = 'confirmed',
        bet_amount = $1,
        team_bet_on = $2,
        odds = $3,
        extraction_reviewed_by = $4,
        extraction_reviewed_at = NOW(),
        updated_at = NOW()
       WHERE id = $5
       RETURNING id, extraction_status, bet_amount, team_bet_on, odds, 
                 extraction_reviewed_by, extraction_reviewed_at`,
      [finalBetAmount, finalTeamBetOn, finalOdds, userId, id]
    );

    // Create audit log
    await createAuditLog({
      signupId: id,
      action: 'extraction_reviewed',
      userId,
      details: {
        action: 'confirmed',
        corrections: Object.keys(corrections).length > 0 ? corrections : null,
        originalValues: {
          betAmount: signup.bet_amount,
          teamBetOn: signup.team_bet_on,
          odds: signup.odds,
        },
        finalValues: {
          betAmount: finalBetAmount,
          teamBetOn: finalTeamBetOn,
          odds: finalOdds,
        },
      },
    });

    // Publish WebSocket event
    await eventPublisher.publish({
      type: 'sign_up.extraction_confirmed',
      userId,
      metadata: {
        signupId: id,
        extractionStatus: 'confirmed',
        betAmount: finalBetAmount,
        teamBetOn: finalTeamBetOn,
        odds: finalOdds,
        reviewedBy: userId,
      },
    });

    logger.info(
      { signupId: id, reviewedBy: userId, hasCorrections: Object.keys(corrections).length > 0 },
      'Extraction confirmed'
    );

    // WO-69: Trigger Phase 2 (enriched) Customer.io sync
    try {
      await customerioSyncJobService.createEnrichedSyncJob(id);
      logger.info({ signupId: id }, 'Enriched Customer.io sync job created');
    } catch (syncError) {
      // Don't fail the confirmation if sync job creation fails
      logger.error(
        { error: syncError, signupId: id },
        'Failed to create enriched Customer.io sync job - will retry later'
      );
    }

    return {
      success: true,
      data: {
        id: updatedSignup?.id,
        extractionStatus: 'confirmed',
        betAmount: finalBetAmount,
        teamBetOn: finalTeamBetOn,
        odds: finalOdds,
        reviewedBy: userId,
        reviewedAt: updatedSignup?.extraction_reviewed_at?.toISOString(),
      },
    };
  });

  /**
   * POST /signups/:id/extraction/skip
   *
   * Skip extraction for problematic images.
   * Signup proceeds without enriched bet data.
   */
  fastify.post('/:id/extraction/skip', {
    preHandler: [
      requireRole('admin', 'manager'),
      validateParams(commonSchemas.id),
      validateBody(skipExtractionSchema),
    ],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { reason } = request.body as z.infer<typeof skipExtractionSchema>;
    const userId = request.user?.id;

    // Get current signup
    const signup = await db.queryOne<{ id: string; extraction_status: string }>(
      'SELECT id, extraction_status FROM signups WHERE id = $1',
      [id]
    );

    if (!signup) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Signup not found' },
      });
    }

    // Allow skipping pending or failed extractions
    if (!['pending', 'skipped'].includes(signup.extraction_status)) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'INVALID_STATUS',
          message: `Cannot skip extraction with status '${signup.extraction_status}'`,
        },
      });
    }

    // Update signup to skipped
    await db.query(
      `UPDATE signups SET
        extraction_status = 'skipped',
        extraction_reviewed_by = $1,
        extraction_reviewed_at = NOW(),
        updated_at = NOW()
       WHERE id = $2`,
      [userId, id]
    );

    // Create audit log
    await createAuditLog({
      signupId: id,
      action: 'extraction_reviewed',
      userId,
      details: {
        action: 'skipped',
        reason: reason || 'Manual skip by admin',
      },
    });

    // Publish WebSocket event
    await eventPublisher.publish({
      type: 'sign_up.extraction_skipped',
      userId,
      metadata: {
        signupId: id,
        extractionStatus: 'skipped',
        reason,
        skippedBy: userId,
      },
    });

    logger.info({ signupId: id, skippedBy: userId, reason }, 'Extraction skipped');

    return {
      success: true,
      data: {
        id,
        extractionStatus: 'skipped',
        reason,
        skippedBy: userId,
      },
    };
  });

  /**
   * GET /signups/extraction/stats
   *
   * Get extraction statistics for monitoring.
   */
  fastify.get('/stats', {
    preHandler: [requireRole('admin', 'manager')],
  }, async (request) => {
    const [signupStats, jobStats] = await Promise.all([
      // Signup extraction stats by status
      db.queryMany<{ status: string; count: string }>(
        `SELECT extraction_status as status, COUNT(*) as count
         FROM signups
         WHERE extraction_status IS NOT NULL
         GROUP BY extraction_status`
      ),
      // Job processing stats
      extractionJobService.getJobStats(),
    ]);

    // Calculate average confidence by status
    const confidenceStats = await db.queryOne<{
      avg_pending: string | null;
      avg_confirmed: string | null;
      avg_overall: string | null;
    }>(
      `SELECT 
        AVG(extraction_confidence) FILTER (WHERE extraction_status = 'pending') as avg_pending,
        AVG(extraction_confidence) FILTER (WHERE extraction_status = 'confirmed') as avg_confirmed,
        AVG(extraction_confidence) as avg_overall
       FROM signups
       WHERE extraction_confidence IS NOT NULL`
    );

    return {
      success: true,
      data: {
        byStatus: signupStats.reduce(
          (acc, r) => ({ ...acc, [r.status]: parseInt(r.count) }),
          {} as Record<string, number>
        ),
        jobs: jobStats,
        confidence: {
          avgPending: confidenceStats?.avg_pending
            ? parseFloat(confidenceStats.avg_pending)
            : null,
          avgConfirmed: confidenceStats?.avg_confirmed
            ? parseFloat(confidenceStats.avg_confirmed)
            : null,
          avgOverall: confidenceStats?.avg_overall
            ? parseFloat(confidenceStats.avg_overall)
            : null,
        },
      },
    };
  });

  /**
   * POST /signups/extraction/process
   *
   * Trigger processing of pending extraction jobs.
   * Typically called by a cron job or manual trigger.
   */
  fastify.post('/process', {
    preHandler: [requireRole('admin')],
  }, async (request) => {
    const { limit } = request.query as { limit?: string };
    const batchSize = limit ? parseInt(limit) : 10;

    const results = await extractionJobService.processPendingJobs(batchSize);

    return {
      success: true,
      data: {
        processed: results.length,
        succeeded: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success && !r.shouldRetry).length,
        retrying: results.filter((r) => r.shouldRetry).length,
        results: results.map((r) => ({
          signupId: r.signupId,
          jobId: r.jobId,
          status: r.status,
          success: r.success,
          error: r.error,
        })),
      },
    };
  });

  /**
   * POST /signups/extraction/cleanup
   *
   * Clean up stuck processing jobs.
   */
  fastify.post('/cleanup', {
    preHandler: [requireRole('admin')],
  }, async () => {
    const resetCount = await extractionJobService.cleanupStuckJobs();

    return {
      success: true,
      data: { resetCount },
    };
  });
}

// ============================================
// HELPER FUNCTIONS
// ============================================

async function createAuditLog(input: {
  signupId: string;
  action: SignUpAuditAction;
  userId?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
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
