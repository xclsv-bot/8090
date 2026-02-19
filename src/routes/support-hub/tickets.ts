/**
 * Support Ticket Routes
 * WO-57: Support Hub API and Backend Services
 * Phase 12: Support Hub Foundation
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { supportTicketService } from '../../services/supportHubService.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { validateBody, validateQuery, validateParams, commonSchemas } from '../../middleware/validate.js';
import type {
  TicketCategory,
  TicketPriority,
  TicketStatus,
  CreateTicketInput,
  UpdateTicketInput,
  CreateTicketMessageInput,
  SubmitTicketFeedbackInput,
  TicketAttachment,
} from '../../types/support-hub.js';

// Validation schemas
const ticketCategorySchema = z.enum([
  'general_inquiry', 'technical_issue', 'payroll_question',
  'event_problem', 'signup_issue', 'account_access', 'feedback', 'other'
]);

const ticketPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);

const ticketStatusSchema = z.enum([
  'open', 'in_progress', 'waiting_on_user',
  'waiting_on_admin', 'resolved', 'closed'
]);

const attachmentSchema = z.object({
  url: z.string().url(),
  filename: z.string(),
  size: z.number().int().positive(),
  type: z.string(),
});

const createTicketSchema = z.object({
  subject: z.string().min(1).max(255),
  description: z.string().min(1).max(10000),
  category: ticketCategorySchema.optional(),
  priority: ticketPrioritySchema.optional(),
  tags: z.array(z.string()).optional(),
  relatedEventId: z.string().uuid().optional(),
  relatedSignupId: z.string().uuid().optional(),
  source: z.string().optional(),
});

const updateTicketSchema = z.object({
  subject: z.string().min(1).max(255).optional(),
  description: z.string().min(1).max(10000).optional(),
  category: ticketCategorySchema.optional(),
  priority: ticketPrioritySchema.optional(),
  status: ticketStatusSchema.optional(),
  tags: z.array(z.string()).optional(),
  assignedTo: z.string().uuid().optional(),
  resolutionNotes: z.string().max(5000).optional(),
  relatedArticleIds: z.array(z.string().uuid()).optional(),
});

const searchTicketsSchema = z.object({
  ambassadorId: z.string().uuid().optional(),
  assignedTo: z.string().uuid().optional(),
  status: z.string().optional().transform(v => {
    if (!v) return undefined;
    const statuses = v.split(',') as TicketStatus[];
    return statuses.length === 1 ? statuses[0] : statuses;
  }),
  priority: z.string().optional().transform(v => {
    if (!v) return undefined;
    const priorities = v.split(',') as TicketPriority[];
    return priorities.length === 1 ? priorities[0] : priorities;
  }),
  category: ticketCategorySchema.optional(),
  tags: z.string().optional().transform(v => v ? v.split(',') : undefined),
  search: z.string().optional(),
  slaAtRisk: z.string().optional().transform(v => v === 'true'),
  createdAfter: z.string().datetime().optional().transform(v => v ? new Date(v) : undefined),
  createdBefore: z.string().datetime().optional().transform(v => v ? new Date(v) : undefined),
  page: z.string().optional().default('1').transform(Number),
  limit: z.string().optional().default('20').transform(Number),
});

const createMessageSchema = z.object({
  content: z.string().min(1).max(10000),
  isInternalNote: z.boolean().optional(),
  attachments: z.array(attachmentSchema).optional(),
  replyToMessageId: z.string().uuid().optional(),
});

const submitFeedbackSchema = z.object({
  satisfactionRating: z.number().int().min(1).max(5),
  satisfactionFeedback: z.string().max(2000).optional(),
});

export async function ticketRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.addHook('preHandler', authenticate);

  /**
   * GET /tickets - List/search tickets
   * Ambassadors see only their tickets, admins see all
   */
  fastify.get('/', {
    preHandler: [validateQuery(searchTicketsSchema)],
  }, async (request) => {
    const query = request.query as z.infer<typeof searchTicketsSchema>;
    const isAdmin = request.user?.role === 'admin' || request.user?.role === 'manager';

    // Non-admins can only see their own tickets
    const filters = {
      ...query,
      ambassadorId: isAdmin ? query.ambassadorId : request.user!.id,
    };

    const result = await supportTicketService.searchTickets(
      filters,
      query.page,
      query.limit
    );

    return {
      success: true,
      data: result.items,
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
    };
  });

  /**
   * GET /tickets/stats - Get support statistics (admin only)
   */
  fastify.get('/stats', {
    preHandler: [requireRole('admin', 'manager')],
  }, async () => {
    const stats = await supportTicketService.getStats();
    return { success: true, data: stats };
  });

  /**
   * GET /tickets/my - Get current user's tickets
   */
  fastify.get('/my', {
    preHandler: [validateQuery(z.object({
      status: z.string().optional().transform(v => v ? v.split(',') as TicketStatus[] : undefined),
    }))],
  }, async (request) => {
    const { status } = request.query as { status?: TicketStatus[] };
    const tickets = await supportTicketService.getTicketsForAmbassador(
      request.user!.id,
      status
    );
    return { success: true, data: tickets };
  });

  /**
   * GET /tickets/assigned - Get tickets assigned to current admin
   */
  fastify.get('/assigned', {
    preHandler: [requireRole('admin', 'manager')],
  }, async (request) => {
    const result = await supportTicketService.searchTickets(
      { assignedTo: request.user!.id, status: ['open', 'in_progress', 'waiting_on_user', 'waiting_on_admin'] },
      1,
      100
    );
    return { success: true, data: result.items };
  });

  /**
   * GET /tickets/at-risk - Get tickets at risk of SLA breach (admin only)
   */
  fastify.get('/at-risk', {
    preHandler: [requireRole('admin', 'manager')],
  }, async () => {
    const result = await supportTicketService.searchTickets(
      { slaAtRisk: true },
      1,
      100
    );
    return { success: true, data: result.items };
  });

  /**
   * GET /tickets/:id - Get ticket by ID
   */
  fastify.get('/:id', {
    preHandler: [validateParams(commonSchemas.id)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const isAdmin = request.user?.role === 'admin' || request.user?.role === 'manager';

    const ticket = await supportTicketService.getTicketById(id);

    if (!ticket) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Ticket not found' },
      });
    }

    // Non-admins can only see their own tickets
    if (!isAdmin && ticket.ambassadorId !== request.user!.id) {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You can only view your own tickets' },
      });
    }

    return { success: true, data: ticket };
  });

  /**
   * GET /tickets/number/:ticketNumber - Get ticket by ticket number
   */
  fastify.get('/number/:ticketNumber', async (request, reply) => {
    const { ticketNumber } = request.params as { ticketNumber: string };
    const isAdmin = request.user?.role === 'admin' || request.user?.role === 'manager';

    const ticket = await supportTicketService.getTicketByNumber(ticketNumber);

    if (!ticket) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Ticket not found' },
      });
    }

    // Non-admins can only see their own tickets
    if (!isAdmin && ticket.ambassadorId !== request.user!.id) {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You can only view your own tickets' },
      });
    }

    return { success: true, data: ticket };
  });

  /**
   * POST /tickets - Create new ticket
   */
  fastify.post('/', {
    preHandler: [validateBody(createTicketSchema)],
  }, async (request, reply) => {
    const input = request.body as CreateTicketInput;

    const ticket = await supportTicketService.createTicket(input, request.user!.id);

    return reply.status(201).send({
      success: true,
      data: ticket,
    });
  });

  /**
   * PUT /tickets/:id - Update ticket
   * Ambassadors can only update subject/description, admins can update everything
   */
  fastify.put('/:id', {
    preHandler: [validateParams(commonSchemas.id), validateBody(updateTicketSchema)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = request.body as UpdateTicketInput;
    const isAdmin = request.user?.role === 'admin' || request.user?.role === 'manager';

    const ticket = await supportTicketService.getTicketById(id);

    if (!ticket) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Ticket not found' },
      });
    }

    // Non-admins can only update their own tickets and limited fields
    if (!isAdmin) {
      if (ticket.ambassadorId !== request.user!.id) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'You can only update your own tickets' },
        });
      }
      
      // Limit updateable fields for non-admins
      const allowedInput: UpdateTicketInput = {
        subject: input.subject,
        description: input.description,
      };
      
      const updated = await supportTicketService.updateTicket(id, allowedInput);
      return { success: true, data: updated };
    }

    const updated = await supportTicketService.updateTicket(id, input);
    return { success: true, data: updated };
  });

  /**
   * PATCH /tickets/:id/assign - Assign ticket to admin
   */
  fastify.patch('/:id/assign', {
    preHandler: [
      requireRole('admin', 'manager'),
      validateParams(commonSchemas.id),
      validateBody(z.object({ assignedTo: z.string().uuid() })),
    ],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { assignedTo } = request.body as { assignedTo: string };

    const ticket = await supportTicketService.updateTicket(id, { assignedTo, status: 'in_progress' });

    if (!ticket) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Ticket not found' },
      });
    }

    return { success: true, data: ticket };
  });

  /**
   * PATCH /tickets/:id/status - Update ticket status
   */
  fastify.patch('/:id/status', {
    preHandler: [
      validateParams(commonSchemas.id),
      validateBody(z.object({ 
        status: ticketStatusSchema,
        resolutionNotes: z.string().max(5000).optional(),
      })),
    ],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status, resolutionNotes } = request.body as { status: TicketStatus; resolutionNotes?: string };
    const isAdmin = request.user?.role === 'admin' || request.user?.role === 'manager';

    const ticket = await supportTicketService.getTicketById(id);

    if (!ticket) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Ticket not found' },
      });
    }

    // Non-admins can only close their own resolved tickets
    if (!isAdmin) {
      if (ticket.ambassadorId !== request.user!.id) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'You can only update your own tickets' },
        });
      }
      
      if (status !== 'closed' || ticket.status !== 'resolved') {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: 'You can only close resolved tickets' },
        });
      }
    }

    const updated = await supportTicketService.updateTicket(id, { status, resolutionNotes });
    return { success: true, data: updated };
  });

  /**
   * PATCH /tickets/:id/priority - Update ticket priority (admin only)
   */
  fastify.patch('/:id/priority', {
    preHandler: [
      requireRole('admin', 'manager'),
      validateParams(commonSchemas.id),
      validateBody(z.object({ priority: ticketPrioritySchema })),
    ],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { priority } = request.body as { priority: TicketPriority };

    const ticket = await supportTicketService.updateTicket(id, { priority });

    if (!ticket) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Ticket not found' },
      });
    }

    return { success: true, data: ticket };
  });

  /**
   * PATCH /tickets/:id/resolve - Resolve ticket (admin only)
   */
  fastify.patch('/:id/resolve', {
    preHandler: [
      requireRole('admin', 'manager'),
      validateParams(commonSchemas.id),
      validateBody(z.object({
        resolutionNotes: z.string().max(5000).optional(),
        relatedArticleIds: z.array(z.string().uuid()).optional(),
      })),
    ],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { resolutionNotes, relatedArticleIds } = request.body as {
      resolutionNotes?: string;
      relatedArticleIds?: string[];
    };

    const ticket = await supportTicketService.updateTicket(id, {
      status: 'resolved',
      resolutionNotes,
      relatedArticleIds,
    });

    if (!ticket) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Ticket not found' },
      });
    }

    return { success: true, data: ticket };
  });

  // ========================================
  // MESSAGE ROUTES
  // ========================================

  /**
   * GET /tickets/:id/messages - Get messages for a ticket
   */
  fastify.get('/:id/messages', {
    preHandler: [validateParams(commonSchemas.id)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const isAdmin = request.user?.role === 'admin' || request.user?.role === 'manager';

    const ticket = await supportTicketService.getTicketById(id);

    if (!ticket) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Ticket not found' },
      });
    }

    // Non-admins can only see their own ticket messages
    if (!isAdmin && ticket.ambassadorId !== request.user!.id) {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You can only view your own ticket messages' },
      });
    }

    // Admins can see internal notes
    const messages = await supportTicketService.getTicketMessages(id, isAdmin);
    return { success: true, data: messages };
  });

  /**
   * POST /tickets/:id/messages - Add message to ticket
   */
  fastify.post('/:id/messages', {
    preHandler: [validateParams(commonSchemas.id), validateBody(createMessageSchema)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = request.body as Omit<CreateTicketMessageInput, 'ticketId'>;
    const isAdmin = request.user?.role === 'admin' || request.user?.role === 'manager';

    const ticket = await supportTicketService.getTicketById(id);

    if (!ticket) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Ticket not found' },
      });
    }

    // Non-admins can only message on their own tickets
    if (!isAdmin && ticket.ambassadorId !== request.user!.id) {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You can only message on your own tickets' },
      });
    }

    // Non-admins cannot create internal notes
    if (!isAdmin && input.isInternalNote) {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Only admins can create internal notes' },
      });
    }

    const senderType = isAdmin ? 'admin' : 'ambassador';
    const message = await supportTicketService.addMessage(
      { ticketId: id, ...input },
      request.user!.id,
      senderType
    );

    return reply.status(201).send({
      success: true,
      data: message,
    });
  });

  // ========================================
  // FEEDBACK ROUTES
  // ========================================

  /**
   * POST /tickets/:id/feedback - Submit satisfaction feedback
   */
  fastify.post('/:id/feedback', {
    preHandler: [validateParams(commonSchemas.id), validateBody(submitFeedbackSchema)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = request.body as Omit<SubmitTicketFeedbackInput, 'ticketId'>;

    const ticket = await supportTicketService.getTicketById(id);

    if (!ticket) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Ticket not found' },
      });
    }

    // Only ticket owner can submit feedback
    if (ticket.ambassadorId !== request.user!.id) {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You can only submit feedback for your own tickets' },
      });
    }

    // Can only submit feedback for resolved/closed tickets
    if (ticket.status !== 'resolved' && ticket.status !== 'closed') {
      return reply.status(400).send({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Can only submit feedback for resolved or closed tickets' },
      });
    }

    const updated = await supportTicketService.submitFeedback({
      ticketId: id,
      ...input,
    });

    return { success: true, data: updated };
  });
}
