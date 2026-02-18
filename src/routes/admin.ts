/**
 * Admin Routes
 * WO-8: Support Hub
 * WO-12: Administrative workflows (W9, onboarding)
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { adminService } from '../services/adminService.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery, commonSchemas } from '../middleware/validate.js';

const createTicketSchema = z.object({
  category: z.string(),
  subject: z.string().min(1).max(200),
  description: z.string().min(1),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
});

const ticketFilterSchema = z.object({
  status: z.enum(['open', 'in_progress', 'waiting', 'resolved', 'closed']).optional(),
  category: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  assignedTo: z.string().optional(),
  page: z.string().optional().default('1').transform(Number),
  limit: z.string().optional().default('20').transform(Number),
});

export async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticate);

  // ============================================
  // ONBOARDING
  // ============================================

  /**
   * POST /admin/onboarding/:ambassadorId - Initialize onboarding
   */
  fastify.post('/onboarding/:id', {
    preHandler: [requireRole('admin', 'manager'), validateParams(commonSchemas.id)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tasks = await adminService.initializeOnboarding(id);
    return reply.status(201).send({ success: true, data: tasks });
  });

  /**
   * GET /admin/onboarding/:ambassadorId - Get onboarding progress
   */
  fastify.get('/onboarding/:id', {
    preHandler: [validateParams(commonSchemas.id)],
  }, async (request) => {
    const { id } = request.params as { id: string };

    // Ambassadors can only see their own onboarding
    if (request.user?.role === 'ambassador' && request.user?.id !== id) {
      return { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } };
    }

    const progress = await adminService.getOnboardingProgress(id);
    return { success: true, data: progress };
  });

  /**
   * POST /admin/onboarding/tasks/:taskId/complete - Complete task
   */
  fastify.post('/onboarding/tasks/:id/complete', {
    preHandler: [validateParams(commonSchemas.id)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const task = await adminService.completeTask(id);

    if (!task) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Task not found' },
      });
    }

    return { success: true, data: task };
  });

  // ============================================
  // DOCUMENTS
  // ============================================

  /**
   * GET /admin/documents/pending - Get pending documents
   */
  fastify.get('/documents/pending', {
    preHandler: [requireRole('admin', 'manager')],
  }, async () => {
    const documents = await adminService.getPendingDocuments();
    return { success: true, data: documents };
  });

  /**
   * POST /admin/documents/:id/review - Review document
   */
  fastify.post('/documents/:id/review', {
    preHandler: [
      requireRole('admin', 'manager'),
      validateParams(commonSchemas.id),
      validateBody(z.object({
        status: z.enum(['approved', 'rejected']),
        notes: z.string().optional(),
      })),
    ],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status, notes } = request.body as { status: 'approved' | 'rejected'; notes?: string };

    const document = await adminService.reviewDocument(id, status, request.user!.id, notes);

    if (!document) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Document not found' },
      });
    }

    return { success: true, data: document };
  });

  // ============================================
  // SUPPORT HUB
  // ============================================

  /**
   * GET /admin/support/tickets - Get tickets
   */
  fastify.get('/support/tickets', {
    preHandler: [validateQuery(ticketFilterSchema)],
  }, async (request) => {
    const query = request.query as z.infer<typeof ticketFilterSchema>;

    // Non-admins can only see their own tickets
    const filters: any = { ...query };
    if (request.user?.role === 'ambassador') {
      filters.userId = request.user.id;
    }

    const result = await adminService.getTickets(
      filters as any,
      query.page,
      query.limit
    );

    return { success: true, data: result.items, meta: { total: result.total } };
  });

  /**
   * POST /admin/support/tickets - Create ticket
   */
  fastify.post('/support/tickets', {
    preHandler: [validateBody(createTicketSchema)],
  }, async (request, reply) => {
    const input = request.body as z.infer<typeof createTicketSchema>;
    const ticket = await adminService.createTicket({
      userId: request.user!.id,
      ...input,
    });

    return reply.status(201).send({ success: true, data: ticket });
  });

  /**
   * PATCH /admin/support/tickets/:id/status - Update ticket status
   */
  fastify.patch('/support/tickets/:id/status', {
    preHandler: [
      requireRole('admin', 'manager'),
      validateParams(commonSchemas.id),
      validateBody(z.object({
        status: z.enum(['open', 'in_progress', 'waiting', 'resolved', 'closed']),
        assignedTo: z.string().uuid().optional(),
      })),
    ],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status, assignedTo } = request.body as { status: string; assignedTo?: string };

    const ticket = await adminService.updateTicketStatus(id, status as any, assignedTo);

    if (!ticket) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Ticket not found' },
      });
    }

    return { success: true, data: ticket };
  });

  /**
   * POST /admin/support/tickets/:id/comments - Add comment
   */
  fastify.post('/support/tickets/:id/comments', {
    preHandler: [
      validateParams(commonSchemas.id),
      validateBody(z.object({
        comment: z.string().min(1),
        isInternal: z.boolean().optional(),
      })),
    ],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { comment, isInternal } = request.body as { comment: string; isInternal?: boolean };

    // Only admins can add internal comments
    const internal = isInternal && ['admin', 'manager'].includes(request.user?.role || '');

    await adminService.addTicketComment(id, request.user!.id, comment, internal);
    return reply.status(201).send({ success: true, data: { added: true } });
  });

  /**
   * GET /admin/support/tickets/:id/comments - Get comments
   */
  fastify.get('/support/tickets/:id/comments', {
    preHandler: [validateParams(commonSchemas.id)],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const includeInternal = ['admin', 'manager'].includes(request.user?.role || '');
    const comments = await adminService.getTicketComments(id, includeInternal);
    return { success: true, data: comments };
  });

  /**
   * GET /admin/support/stats - Get support stats
   */
  fastify.get('/support/stats', {
    preHandler: [requireRole('admin', 'manager')],
  }, async () => {
    const stats = await adminService.getSupportStats();
    return { success: true, data: stats };
  });
}
