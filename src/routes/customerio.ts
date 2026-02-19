/**
 * Customer.io Sync Routes
 * WO-69: Customer.io Sync System and Retry Infrastructure
 *
 * Endpoints:
 * - GET /api/signups/customerio/sync-failures - Get failure queue
 * - POST /api/signups/:id/customerio/retry - Manual retry for failed syncs
 * - GET /api/signups/customerio/stats - Get sync statistics
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { customerioSyncJobService } from '../services/customerioSyncJobService.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery, commonSchemas } from '../middleware/validate.js';

// ============================================
// SCHEMAS
// ============================================

const failureQueueQuerySchema = z.object({
  syncPhase: z.enum(['initial', 'enriched']).optional(),
  errorType: z.enum(['rate_limit', 'server_error', 'network', 'other']).optional(),
  search: z.string().optional(),
  limit: z.string().optional().default('50').transform(Number),
  offset: z.string().optional().default('0').transform(Number),
});

const retryBodySchema = z.object({
  syncPhase: z.enum(['initial', 'enriched']).optional(),
});

// ============================================
// ROUTES
// ============================================

export async function customerioRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication and admin/manager role
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireRole('admin', 'manager'));

  /**
   * GET /sync-failures - Get Customer.io sync failure queue
   *
   * Returns failed sync jobs prioritized by failure count and last attempt.
   * Supports filtering by sync phase, error type, and search.
   */
  fastify.get('/sync-failures', {
    preHandler: [validateQuery(failureQueueQuerySchema)],
  }, async (request) => {
    const filters = request.query as z.infer<typeof failureQueueQuerySchema>;

    const result = await customerioSyncJobService.getFailureQueue({
      syncPhase: filters.syncPhase,
      errorType: filters.errorType,
      search: filters.search,
      limit: filters.limit,
      offset: filters.offset,
    });

    return {
      success: true,
      data: result.failures,
      meta: {
        total: result.total,
        limit: filters.limit,
        offset: filters.offset,
      },
    };
  });

  /**
   * GET /stats - Get Customer.io sync statistics
   *
   * Returns counts of jobs by status and phase.
   */
  fastify.get('/stats', async () => {
    const stats = await customerioSyncJobService.getJobStats();

    return {
      success: true,
      data: stats,
    };
  });

  /**
   * POST /:id/retry - Manual retry for failed sync jobs
   *
   * Resets attempt count and schedules for immediate processing.
   * Can optionally specify a sync phase to retry only that phase.
   */
  fastify.post('/:id/retry', {
    preHandler: [
      validateParams(commonSchemas.id),
      validateBody(retryBodySchema.optional()),
    ],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as z.infer<typeof retryBodySchema> | undefined;

    const result = await customerioSyncJobService.manualRetry(id, body?.syncPhase);

    if (result.retriedJobs.length === 0) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'NO_FAILED_JOBS',
          message: result.message,
        },
      });
    }

    return {
      success: true,
      data: {
        retriedJobs: result.retriedJobs,
        message: result.message,
      },
    };
  });

  /**
   * POST /process - Manually trigger sync job processing
   *
   * Useful for admin intervention or testing.
   * Processes up to the specified number of jobs.
   */
  fastify.post('/process', {
    preHandler: [validateBody(z.object({
      limit: z.number().int().positive().max(100).optional().default(10),
    }).optional())],
  }, async (request) => {
    const body = request.body as { limit?: number } | undefined;
    const limit = body?.limit || 10;

    const results = await customerioSyncJobService.processPendingJobs(limit);

    return {
      success: true,
      data: {
        processed: results.length,
        succeeded: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success && !r.shouldRetry).length,
        retrying: results.filter((r) => r.shouldRetry).length,
        jobs: results.map((r) => ({
          jobId: r.jobId,
          signupId: r.signupId,
          syncPhase: r.syncPhase,
          status: r.status,
          success: r.success,
          error: r.error,
        })),
      },
    };
  });

  /**
   * POST /cleanup - Clean up stuck processing jobs
   *
   * Resets jobs that have been stuck in 'processing' status.
   */
  fastify.post('/cleanup', async () => {
    const resetCount = await customerioSyncJobService.cleanupStuckJobs();

    return {
      success: true,
      data: {
        resetCount,
        message: resetCount > 0
          ? `Reset ${resetCount} stuck job(s)`
          : 'No stuck jobs found',
      },
    };
  });
}
