/**
 * Manual Insight Routes
 * WO-86: Manual Insight Management
 * 
 * CRUD endpoints for managing traffic insights.
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { manualInsightService } from '../services/manualInsightService.js';
import { authenticate } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery, commonSchemas } from '../middleware/validate.js';
import { TrafficExpectation, InsightType, DayOfWeek } from '../types/manualInsight.js';

// Validation schemas
const trafficExpectationSchema = z.enum(['high', 'moderate', 'low']);
const insightTypeSchema = z.enum(['recurring', 'specific']);
const dayOfWeekSchema = z.number().int().min(0).max(6) as z.ZodType<DayOfWeek>;
const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const createRecurringSchema = z.object({
  operatorId: z.string().uuid().optional(),
  dayOfWeek: dayOfWeekSchema,
  trafficExpectation: trafficExpectationSchema,
  label: z.string().min(1).max(100),
  notes: z.string().max(500).optional(),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
});

const createSpecificDateSchema = z.object({
  operatorId: z.string().uuid().optional(),
  date: dateStringSchema,
  trafficExpectation: trafficExpectationSchema,
  label: z.string().min(1).max(100),
  notes: z.string().max(500).optional(),
  autoExpire: z.boolean().optional(),
});

const updateInsightSchema = z.object({
  trafficExpectation: trafficExpectationSchema.optional(),
  label: z.string().min(1).max(100).optional(),
  notes: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
  dayOfWeek: dayOfWeekSchema.optional(),
  startDate: dateStringSchema.nullable().optional(),
  endDate: dateStringSchema.nullable().optional(),
  date: dateStringSchema.optional(),
  autoExpire: z.boolean().optional(),
});

const listQuerySchema = z.object({
  operatorId: z.string().uuid().optional(),
  insightType: insightTypeSchema.optional(),
  trafficExpectation: trafficExpectationSchema.optional(),
  isActive: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  includeExpired: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  page: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
});

const effectiveQuerySchema = z.object({
  date: dateStringSchema,
  operatorId: z.string().uuid().optional(),
});

const rangeQuerySchema = z.object({
  startDate: dateStringSchema,
  endDate: dateStringSchema,
  operatorId: z.string().uuid().optional(),
});

export async function manualInsightRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticate);

  /**
   * GET /manual-insights - List insights with filtering
   */
  fastify.get('/', {
    preHandler: [validateQuery(listQuerySchema)],
  }, async (request) => {
    const query = request.query as z.infer<typeof listQuerySchema>;
    const result = await manualInsightService.list(query);
    
    return {
      success: true,
      data: result.insights,
      meta: {
        total: result.total,
        page: query.page ?? 1,
        limit: query.limit ?? 50,
      },
    };
  });

  /**
   * GET /manual-insights/stats - Get insight statistics
   */
  fastify.get('/stats', {
    preHandler: [validateQuery(z.object({
      operatorId: z.string().uuid().optional(),
    }))],
  }, async (request) => {
    const { operatorId } = request.query as { operatorId?: string };
    const stats = await manualInsightService.getStats(operatorId);
    return { success: true, data: stats };
  });

  /**
   * GET /manual-insights/effective - Get effective insight for a date
   * This is the main integration endpoint for the scoring algorithm
   */
  fastify.get('/effective', {
    preHandler: [validateQuery(effectiveQuerySchema)],
  }, async (request) => {
    const { date, operatorId } = request.query as z.infer<typeof effectiveQuerySchema>;
    const effective = await manualInsightService.getEffectiveInsight(date, operatorId);
    return { success: true, data: effective };
  });

  /**
   * GET /manual-insights/range - Get insights for a date range
   */
  fastify.get('/range', {
    preHandler: [validateQuery(rangeQuerySchema)],
  }, async (request) => {
    const { startDate, endDate, operatorId } = request.query as z.infer<typeof rangeQuerySchema>;
    const insights = await manualInsightService.getInsightsForRange(startDate, endDate, operatorId);
    
    // Convert Map to object for JSON serialization
    const result: Record<string, unknown> = {};
    insights.forEach((value, key) => {
      result[key] = value;
    });
    
    return { success: true, data: result };
  });

  /**
   * GET /manual-insights/:id - Get insight by ID
   */
  fastify.get('/:id', {
    preHandler: [validateParams(commonSchemas.id)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const insight = await manualInsightService.getById(id);
    
    if (!insight) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Insight not found' },
      });
    }
    
    return { success: true, data: insight };
  });

  /**
   * POST /manual-insights/recurring - Create recurring pattern insight
   */
  fastify.post('/recurring', {
    preHandler: [validateBody(createRecurringSchema)],
  }, async (request, reply) => {
    const input = request.body as z.infer<typeof createRecurringSchema>;
    const userId = request.user?.id ?? 'system';
    
    const insight = await manualInsightService.createRecurring(input, userId);
    return reply.status(201).send({ success: true, data: insight });
  });

  /**
   * POST /manual-insights/specific - Create specific date insight
   */
  fastify.post('/specific', {
    preHandler: [validateBody(createSpecificDateSchema)],
  }, async (request, reply) => {
    const input = request.body as z.infer<typeof createSpecificDateSchema>;
    const userId = request.user?.id ?? 'system';
    
    const insight = await manualInsightService.createSpecificDate(input, userId);
    return reply.status(201).send({ success: true, data: insight });
  });

  /**
   * PUT /manual-insights/:id - Update an insight
   */
  fastify.put('/:id', {
    preHandler: [validateParams(commonSchemas.id), validateBody(updateInsightSchema)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = request.body as z.infer<typeof updateInsightSchema>;
    
    const insight = await manualInsightService.update(id, input);
    
    if (!insight) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Insight not found' },
      });
    }
    
    return { success: true, data: insight };
  });

  /**
   * DELETE /manual-insights/:id - Delete an insight
   */
  fastify.delete('/:id', {
    preHandler: [validateParams(commonSchemas.id)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = await manualInsightService.delete(id);
    
    if (!deleted) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Insight not found' },
      });
    }
    
    return { success: true, data: { deleted: true } };
  });

  /**
   * POST /manual-insights/cleanup - Cleanup expired insights
   * Admin endpoint to manually trigger cleanup
   */
  fastify.post('/cleanup', async () => {
    const count = await manualInsightService.cleanupExpired();
    return { success: true, data: { cleanedUp: count } };
  });
}
