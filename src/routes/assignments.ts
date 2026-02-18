/**
 * Assignment Routes
 * WO-30, WO-31: Ambassador assignment and auto-assignment
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { assignmentService } from '../services/assignmentService.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateBody, validateParams, commonSchemas } from '../middleware/validate.js';

const createAssignmentSchema = z.object({
  eventId: z.string().uuid(),
  ambassadorId: z.string().uuid(),
  role: z.string().optional(),
  scheduledStart: z.string().optional(),
  scheduledEnd: z.string().optional(),
  payRate: z.number().positive().optional(),
});

const bulkAssignSchema = z.object({
  eventId: z.string().uuid(),
  ambassadorIds: z.array(z.string().uuid()).min(1),
});

export async function assignmentRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticate);

  /**
   * GET /assignments/event/:id - Get assignments for event
   */
  fastify.get('/event/:id', {
    preHandler: [validateParams(commonSchemas.id)],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const assignments = await assignmentService.getByEvent(id);
    return { success: true, data: assignments };
  });

  /**
   * GET /assignments/ambassador/:id - Get assignments for ambassador
   */
  fastify.get('/ambassador/:id', {
    preHandler: [validateParams(commonSchemas.id)],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const { upcoming } = request.query as { upcoming?: string };
    const assignments = await assignmentService.getByAmbassador(id, upcoming !== 'false');
    return { success: true, data: assignments };
  });

  /**
   * POST /assignments - Create assignment
   */
  fastify.post('/', {
    preHandler: [requireRole('admin', 'manager'), validateBody(createAssignmentSchema)],
  }, async (request, reply) => {
    const input = request.body as z.infer<typeof createAssignmentSchema>;
    
    try {
      const assignment = await assignmentService.create(input, request.user?.id);
      return reply.status(201).send({ success: true, data: assignment });
    } catch (error: any) {
      return reply.status(409).send({
        success: false,
        error: { code: 'CONFLICT', message: error.message },
      });
    }
  });

  /**
   * POST /assignments/bulk - Bulk assign ambassadors
   */
  fastify.post('/bulk', {
    preHandler: [requireRole('admin', 'manager'), validateBody(bulkAssignSchema)],
  }, async (request) => {
    const { eventId, ambassadorIds } = request.body as z.infer<typeof bulkAssignSchema>;
    const result = await assignmentService.bulkAssign(eventId, ambassadorIds, request.user?.id);
    return { success: true, data: result };
  });

  /**
   * POST /assignments/suggest/:eventId - Get suggested ambassadors
   */
  fastify.post('/suggest/:id', {
    preHandler: [requireRole('admin', 'manager'), validateParams(commonSchemas.id)],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const { limit } = request.query as { limit?: string };
    const suggestions = await assignmentService.suggestAmbassadors(id, limit ? parseInt(limit) : 10);
    return { success: true, data: suggestions };
  });

  /**
   * PATCH /assignments/:id/status - Update status
   */
  fastify.patch('/:id/status', {
    preHandler: [
      validateParams(commonSchemas.id),
      validateBody(z.object({
        status: z.enum(['pending', 'confirmed', 'declined', 'no_show', 'completed', 'cancelled']),
        reason: z.string().optional(),
      })),
    ],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status, reason } = request.body as { status: string; reason?: string };

    const assignment = await assignmentService.updateStatus(id, status as any, request.user?.id, reason);
    
    if (!assignment) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Assignment not found' },
      });
    }

    return { success: true, data: assignment };
  });

  /**
   * POST /assignments/:id/check-in - Check in
   */
  fastify.post('/:id/check-in', {
    preHandler: [validateParams(commonSchemas.id)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const assignment = await assignmentService.checkIn(id);
    
    if (!assignment) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Assignment not found' },
      });
    }

    return { success: true, data: assignment };
  });

  /**
   * POST /assignments/:id/check-out - Check out
   */
  fastify.post('/:id/check-out', {
    preHandler: [validateParams(commonSchemas.id)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const assignment = await assignmentService.checkOut(id);
    
    if (!assignment) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Assignment not found' },
      });
    }

    return { success: true, data: assignment };
  });

  /**
   * POST /assignments/check-conflicts - Check for conflicts
   */
  fastify.post('/check-conflicts', {
    preHandler: [validateBody(z.object({
      ambassadorId: z.string().uuid(),
      eventId: z.string().uuid(),
    }))],
  }, async (request) => {
    const { ambassadorId, eventId } = request.body as { ambassadorId: string; eventId: string };
    const conflicts = await assignmentService.checkConflicts(ambassadorId, eventId);
    return { success: true, data: { hasConflicts: conflicts.length > 0, conflicts } };
  });
}
