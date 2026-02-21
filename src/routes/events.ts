/**
 * Event API Routes
 * WO-29: Event CRUD API and basic operations
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eventService } from '../services/eventService.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateBody, validateQuery, validateParams, commonSchemas } from '../middleware/validate.js';

const createEventSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  eventType: z.enum(['activation', 'promotion', 'tournament', 'watch_party', 'corporate', 'other']).optional(),
  venue: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  region: z.string().optional(),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  timezone: z.string().optional(),
  venueContactName: z.string().optional(),
  venueContactPhone: z.string().optional(),
  venueContactEmail: z.string().email().optional(),
  expectedAttendance: z.number().int().positive().optional(),
  budget: z.number().positive().optional(),
  minAmbassadors: z.number().int().positive().optional(),
  maxAmbassadors: z.number().int().positive().optional(),
  requiredSkillLevel: z.enum(['trainee', 'standard', 'senior', 'lead']).optional(),
  operatorIds: z.array(z.number().int().positive()).optional(),
});

const updateEventSchema = createEventSchema.partial().omit({ operatorIds: true });

const searchSchema = z.object({
  status: z.enum(['planned', 'confirmed', 'active', 'completed', 'cancelled']).optional(),
  eventType: z.enum(['activation', 'promotion', 'tournament', 'watch_party', 'corporate', 'other']).optional(),
  region: z.string().optional(),
  state: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  search: z.string().optional(),
  page: z.string().optional().default('1').transform(Number),
  limit: z.string().optional().default('20').transform(Number),
});

export async function eventRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticate);

  /**
   * GET /events - List/search events
   */
  fastify.get('/', {
    preHandler: [validateQuery(searchSchema)],
  }, async (request) => {
    const query = request.query as z.infer<typeof searchSchema>;
    const result = await eventService.search(query, query.page, query.limit);

    return {
      success: true,
      data: result.items,
      meta: { page: result.page, limit: result.limit, total: result.total },
    };
  });

  /**
   * GET /events/upcoming - Get upcoming events
   */
  fastify.get('/upcoming', async (request) => {
    const limit = (request.query as { limit?: string }).limit;
    const events = await eventService.getUpcoming(limit ? parseInt(limit) : 10);
    return { success: true, data: events };
  });

  /**
   * GET /events/:id - Get event by ID
   */
  fastify.get('/:id', {
    preHandler: [validateParams(commonSchemas.id)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const event = await eventService.getWithDetails(id);
    
    if (!event) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Event not found' },
      });
    }

    return { success: true, data: event };
  });

  /**
   * POST /events - Create event
   */
  fastify.post('/', {
    preHandler: [requireRole('admin', 'manager'), validateBody(createEventSchema)],
  }, async (request, reply) => {
    const input = request.body as z.infer<typeof createEventSchema>;
    const event = await eventService.create(input, request.user?.id);

    return reply.status(201).send({ success: true, data: event });
  });

  /**
   * PUT /events/:id - Update event
   */
  fastify.put('/:id', {
    preHandler: [requireRole('admin', 'manager'), validateParams(commonSchemas.id), validateBody(updateEventSchema)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = request.body as z.infer<typeof updateEventSchema>;
    const event = await eventService.update(id, input, request.user?.id);
    
    if (!event) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Event not found' },
      });
    }

    return { success: true, data: event };
  });

  /**
   * PATCH /events/:id/status - Update event status
   */
  fastify.patch('/:id/status', {
    preHandler: [
      requireRole('admin', 'manager'),
      validateParams(commonSchemas.id),
      validateBody(z.object({
        status: z.enum(['planned', 'confirmed', 'active', 'completed', 'cancelled']),
        reason: z.string().optional(),
      })),
    ],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status, reason } = request.body as { status: string; reason?: string };

    try {
      const event = await eventService.updateStatus(id, status as any, request.user?.id, reason);
      
      if (!event) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Event not found' },
        });
      }

      return { success: true, data: event };
    } catch (error: any) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_TRANSITION', message: error.message },
      });
    }
  });

  /**
   * DELETE /events/:id - Delete event (soft or hard)
   * Query params:
   *   - hard=true: permanently delete from database
   *   - reason: cancellation reason (for soft delete)
   */
  fastify.delete('/:id', {
    preHandler: [requireRole('admin'), validateParams(commonSchemas.id)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { reason, hard } = request.query as { reason?: string; hard?: string };

    const isHardDelete = hard === 'true';
    
    let deleted: boolean;
    if (isHardDelete) {
      deleted = await eventService.hardDelete(id);
    } else {
      deleted = await eventService.delete(id, request.user?.id, reason);
    }
    
    if (!deleted) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Event not found' },
      });
    }

    return { success: true, data: { deleted: isHardDelete, cancelled: !isHardDelete } };
  });
}
