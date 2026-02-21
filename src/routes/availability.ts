/**
 * Availability Routes
 * WO-35: Event Scheduling & Availability API
 * WO-89: Availability System Restructure
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { availabilityService } from '../services/availabilityService.js';
import { authenticate } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery, commonSchemas } from '../middleware/validate.js';

// ============================================
// Schemas
// ============================================

const availabilitySlotSchema = z.object({
  dayOfWeek: z.number().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  endTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  timezone: z.string().default('America/New_York'),
  preferredRegions: z.array(z.string()).optional(),
});

const exceptionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isAvailable: z.boolean().default(false),
  startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(),
  reason: z.string().max(255).optional(),
});

const dateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const exceptionRangeSchema = z.object({
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  isAvailable: z.boolean().default(false),
  reason: z.string().max(255).optional(),
});

// ============================================
// Routes
// ============================================

export async function availabilityRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticate);

  // ==========================================
  // General Availability Patterns
  // ==========================================

  /**
   * GET /availability/:ambassadorId
   * Get general availability patterns
   */
  fastify.get('/:id', {
    preHandler: [validateParams(commonSchemas.id)],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const availability = await availabilityService.getGeneralAvailability(id);
    return { success: true, data: availability };
  });

  /**
   * PUT /availability/:ambassadorId
   * Set general availability patterns (replaces all)
   */
  fastify.put('/:id', {
    preHandler: [
      validateParams(commonSchemas.id),
      validateBody(z.object({ slots: z.array(availabilitySlotSchema) })),
    ],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const { slots } = request.body as { slots: z.infer<typeof availabilitySlotSchema>[] };
    
    await availabilityService.setGeneralAvailability(id, slots);
    return { success: true, data: { updated: true } };
  });

  /**
   * PATCH /availability/:ambassadorId/day/:dayOfWeek
   * Update single day's availability
   */
  fastify.patch('/:id/day/:dayOfWeek', {
    preHandler: [
      validateParams(z.object({
        id: z.string().uuid(),
        dayOfWeek: z.coerce.number().min(0).max(6),
      })),
      validateBody(z.object({
        startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
        endTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
        timezone: z.string().default('America/New_York'),
        preferredRegions: z.array(z.string()).optional(),
      })),
    ],
  }, async (request) => {
    const { id, dayOfWeek } = request.params as { id: string; dayOfWeek: number };
    const slot = request.body as {
      startTime: string;
      endTime: string;
      timezone: string;
      preferredRegions?: string[];
    };
    
    await availabilityService.updateAvailabilitySlot(id, dayOfWeek, slot);
    return { success: true, data: { updated: true } };
  });

  // ==========================================
  // Exceptions
  // ==========================================

  /**
   * GET /availability/:ambassadorId/exceptions
   * Get all exceptions
   */
  fastify.get('/:id/exceptions', {
    preHandler: [validateParams(commonSchemas.id)],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const { from } = request.query as { from?: string };
    const exceptions = await availabilityService.getExceptions(id, from);
    return { success: true, data: exceptions };
  });

  /**
   * POST /availability/:ambassadorId/exceptions
   * Add single exception
   */
  fastify.post('/:id/exceptions', {
    preHandler: [validateParams(commonSchemas.id), validateBody(exceptionSchema)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const exception = request.body as z.infer<typeof exceptionSchema>;
    
    await availabilityService.addException(id, exception);
    return reply.status(201).send({ success: true, data: { created: true } });
  });

  /**
   * POST /availability/:ambassadorId/exceptions/range
   * Add exceptions for date range (vacation, time-off)
   */
  fastify.post('/:id/exceptions/range', {
    preHandler: [validateParams(commonSchemas.id), validateBody(exceptionRangeSchema)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { fromDate, toDate, isAvailable, reason } = request.body as z.infer<typeof exceptionRangeSchema>;
    
    const count = await availabilityService.setExceptionRange(id, fromDate, toDate, isAvailable, reason);
    return reply.status(201).send({ 
      success: true, 
      data: { created: true, daysSet: count } 
    });
  });

  /**
   * DELETE /availability/:ambassadorId/exceptions/:date
   * Remove exception for specific date
   */
  fastify.delete('/:id/exceptions/:date', {
    preHandler: [validateParams(z.object({
      id: z.string().uuid(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))],
  }, async (request, reply) => {
    const { id, date } = request.params as { id: string; date: string };
    const removed = await availabilityService.removeException(id, date);
    
    if (!removed) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Exception not found' },
      });
    }

    return { success: true, data: { removed: true } };
  });

  // ==========================================
  // Computed Availability
  // ==========================================

  /**
   * GET /availability/check/:ambassadorId/:date
   * Check if ambassador is available on specific date (simple boolean)
   */
  fastify.get('/check/:id/:date', {
    preHandler: [validateParams(z.object({
      id: z.string().uuid(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))],
  }, async (request) => {
    const { id, date } = request.params as { id: string; date: string };
    const available = await availabilityService.isAvailable(id, date);
    return { success: true, data: { available } };
  });

  /**
   * GET /availability/details/:ambassadorId/:date
   * Get detailed availability for specific date (patterns + exceptions considered)
   */
  fastify.get('/details/:id/:date', {
    preHandler: [validateParams(z.object({
      id: z.string().uuid(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))],
  }, async (request) => {
    const { id, date } = request.params as { id: string; date: string };
    const availability = await availabilityService.getAvailabilityForDate(id, date);
    return { success: true, data: availability };
  });

  /**
   * GET /availability/range/:ambassadorId
   * Get availability for date range
   */
  fastify.get('/range/:id', {
    preHandler: [
      validateParams(commonSchemas.id),
      validateQuery(dateRangeSchema),
    ],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const { from, to } = request.query as { from: string; to: string };
    const availability = await availabilityService.getAvailabilityRange(id, from, to);
    return { success: true, data: availability };
  });

  /**
   * GET /availability/available
   * Get all available ambassadors for date
   */
  fastify.get('/available', {
    preHandler: [validateQuery(z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      region: z.string().optional(),
    }))],
  }, async (request) => {
    const { date, region } = request.query as { date: string; region?: string };
    const ambassadors = await availabilityService.getAvailableAmbassadors(date, region);
    return { success: true, data: ambassadors };
  });

  /**
   * GET /availability/heatmap
   * Get availability heatmap for date range
   */
  fastify.get('/heatmap', {
    preHandler: [validateQuery(dateRangeSchema)],
  }, async (request) => {
    const { from, to } = request.query as { from: string; to: string };
    const heatmap = await availabilityService.getHeatmap(from, to);
    return { success: true, data: heatmap };
  });

  // ==========================================
  // Admin / Management Endpoints
  // ==========================================

  /**
   * GET /availability/stats
   * Get availability system statistics
   */
  fastify.get('/stats', async () => {
    const stats = await availabilityService.getStatistics();
    return { success: true, data: stats };
  });

  /**
   * POST /availability/migrate
   * Migrate existing data to new schema (idempotent)
   */
  fastify.post('/migrate', async (request, reply) => {
    const result = await availabilityService.migrateExistingData();
    
    if (result.errors.length > 0) {
      return reply.status(500).send({
        success: false,
        data: result,
        error: { code: 'MIGRATION_ERROR', message: result.errors.join('; ') },
      });
    }

    return { success: true, data: result };
  });

  /**
   * POST /availability/copy
   * Copy availability from one ambassador to another
   */
  fastify.post('/copy', {
    preHandler: [validateBody(z.object({
      sourceAmbassadorId: z.string().uuid(),
      targetAmbassadorId: z.string().uuid(),
    }))],
  }, async (request, reply) => {
    const { sourceAmbassadorId, targetAmbassadorId } = request.body as {
      sourceAmbassadorId: string;
      targetAmbassadorId: string;
    };
    
    const result = await availabilityService.copyAvailability(sourceAmbassadorId, targetAmbassadorId);
    return reply.status(201).send({ success: true, data: result });
  });

  /**
   * DELETE /availability/exceptions/cleanup
   * Remove old exceptions before date
   */
  fastify.delete('/exceptions/cleanup', {
    preHandler: [validateQuery(z.object({
      before: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))],
  }, async (request) => {
    const { before } = request.query as { before: string };
    const removed = await availabilityService.clearOldExceptions(before);
    return { success: true, data: { removed } };
  });
}
