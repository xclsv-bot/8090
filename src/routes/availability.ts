/**
 * Availability Routes
 * WO-35: Event Scheduling & Availability API
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { availabilityService } from '../services/availabilityService.js';
import { authenticate } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery, commonSchemas } from '../middleware/validate.js';

const availabilitySlotSchema = z.object({
  dayOfWeek: z.number().min(0).max(6),
  startTime: z.string(),
  endTime: z.string(),
  preferredRegions: z.array(z.string()).optional(),
});

const exceptionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  allDay: z.boolean().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  reason: z.string().optional(),
});

export async function availabilityRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticate);

  /**
   * GET /availability/:ambassadorId - Get general availability
   */
  fastify.get('/:id', {
    preHandler: [validateParams(commonSchemas.id)],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const availability = await availabilityService.getGeneralAvailability(id);
    return { success: true, data: availability };
  });

  /**
   * PUT /availability/:ambassadorId - Set general availability
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
   * GET /availability/:ambassadorId/exceptions - Get exceptions
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
   * POST /availability/:ambassadorId/exceptions - Add exception
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
   * DELETE /availability/:ambassadorId/exceptions/:date - Remove exception
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

  /**
   * GET /availability/check/:ambassadorId/:date - Check if available
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
   * GET /availability/available - Get available ambassadors for date
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
   * GET /availability/heatmap - Get availability heatmap
   */
  fastify.get('/heatmap', {
    preHandler: [validateQuery(z.object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))],
  }, async (request) => {
    const { from, to } = request.query as { from: string; to: string };
    const heatmap = await availabilityService.getHeatmap(from, to);
    return { success: true, data: heatmap };
  });
}
