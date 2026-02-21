/**
 * Admin Chat Routes
 * WO-81: Event Chat Admin Monitoring & Moderation
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { adminChatService } from '../../services/adminChatService.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { validateBody, validateParams, validateQuery, commonSchemas } from '../../middleware/validate.js';

// Validation schemas
const listChatsQuerySchema = z.object({
  status: z.enum(['active', 'archived', 'all']).optional(),
  eventId: z.string().uuid().optional(),
  page: z.string().optional().default('1').transform(Number),
  limit: z.string().optional().default('50').transform(Number),
});

const messageFilterSchema = z.object({
  senderId: z.string().uuid().optional(),
  messageType: z.enum(['text', 'image', 'file', 'system']).optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  search: z.string().optional(),
  isDeleted: z.string().optional().transform((v) => v === 'true'),
  page: z.string().optional().default('1').transform(Number),
  limit: z.string().optional().default('50').transform(Number),
});

const editMessageSchema = z.object({
  content: z.string().min(1).max(4000),
  reason: z.string().max(500).optional(),
});

const deleteMessageSchema = z.object({
  reason: z.string().max(500).optional(),
});

const interventionSchema = z.object({
  content: z.string().min(1).max(4000),
  interventionType: z.enum(['message', 'warning', 'announcement']).optional(),
});

const escalationSchema = z.object({
  reason: z.string().min(1).max(1000),
  messageId: z.string().uuid().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
});

const suspendChatSchema = z.object({
  reason: z.string().max(500).optional(),
});

const eventIdParams = z.object({
  eventId: z.string().uuid(),
});

const messageIdParams = z.object({
  eventId: z.string().uuid(),
  messageId: z.string().uuid(),
});

export async function adminChatRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication and admin role
  fastify.addHook('preHandler', authenticate);
  fastify.addHook('preHandler', requireRole('admin', 'manager'));

  /**
   * GET /admin/chats - List all active chats with status/metrics
   */
  fastify.get('/', {
    preHandler: [validateQuery(listChatsQuerySchema)],
  }, async (request) => {
    const query = request.query as z.infer<typeof listChatsQuerySchema>;
    const { rooms, total } = await adminChatService.getAllChats({
      status: query.status,
      eventId: query.eventId,
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    });

    return {
      success: true,
      data: rooms,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  });

  /**
   * GET /admin/chats/analytics/summary - Aggregate analytics across all chats
   */
  fastify.get('/analytics/summary', async () => {
    const summary = await adminChatService.getAnalyticsSummary();
    return { success: true, data: summary };
  });

  /**
   * GET /admin/chats/:eventId - Get chat details for specific event
   */
  fastify.get('/:eventId', {
    preHandler: [validateParams(eventIdParams)],
  }, async (request, reply) => {
    const { eventId } = request.params as { eventId: string };
    const chat = await adminChatService.getChatByEventId(eventId);

    if (!chat) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Chat room not found for this event' },
      });
    }

    return { success: true, data: chat };
  });

  /**
   * GET /admin/chats/:eventId/messages - Get message history with filters
   */
  fastify.get('/:eventId/messages', {
    preHandler: [validateParams(eventIdParams), validateQuery(messageFilterSchema)],
  }, async (request) => {
    const { eventId } = request.params as { eventId: string };
    const query = request.query as z.infer<typeof messageFilterSchema>;

    const { messages, total } = await adminChatService.getMessages(eventId, {
      senderId: query.senderId,
      messageType: query.messageType,
      fromDate: query.fromDate,
      toDate: query.toDate,
      search: query.search,
      isDeleted: query.isDeleted,
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
    });

    return {
      success: true,
      data: messages,
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  });

  /**
   * PUT /admin/chats/:eventId/messages/:messageId - Edit message (moderation)
   */
  fastify.put('/:eventId/messages/:messageId', {
    preHandler: [validateParams(messageIdParams), validateBody(editMessageSchema)],
  }, async (request, reply) => {
    const { eventId, messageId } = request.params as { eventId: string; messageId: string };
    const { content, reason } = request.body as z.infer<typeof editMessageSchema>;

    const message = await adminChatService.editMessage(
      eventId,
      messageId,
      content,
      request.user!.id,
      reason
    );

    if (!message) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Message not found' },
      });
    }

    return { success: true, data: message };
  });

  /**
   * DELETE /admin/chats/:eventId/messages/:messageId - Delete/hide message
   */
  fastify.delete('/:eventId/messages/:messageId', {
    preHandler: [validateParams(messageIdParams), validateBody(deleteMessageSchema.optional())],
  }, async (request, reply) => {
    const { eventId, messageId } = request.params as { eventId: string; messageId: string };
    const body = request.body as z.infer<typeof deleteMessageSchema> | undefined;

    const deleted = await adminChatService.deleteMessage(
      eventId,
      messageId,
      request.user!.id,
      body?.reason
    );

    if (!deleted) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Message not found' },
      });
    }

    return { success: true, data: { deleted: true } };
  });

  /**
   * POST /admin/chats/:eventId/intervene - Send admin message to chat
   */
  fastify.post('/:eventId/intervene', {
    preHandler: [validateParams(eventIdParams), validateBody(interventionSchema)],
  }, async (request, reply) => {
    const { eventId } = request.params as { eventId: string };
    const { content, interventionType } = request.body as z.infer<typeof interventionSchema>;

    const message = await adminChatService.sendIntervention(
      eventId,
      request.user!.id,
      content,
      interventionType
    );

    if (!message) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Event not found' },
      });
    }

    return reply.status(201).send({ success: true, data: message });
  });

  /**
   * POST /admin/chats/:eventId/escalate - Escalate issue
   */
  fastify.post('/:eventId/escalate', {
    preHandler: [validateParams(eventIdParams), validateBody(escalationSchema)],
  }, async (request, reply) => {
    const { eventId } = request.params as { eventId: string };
    const { reason, messageId, priority } = request.body as z.infer<typeof escalationSchema>;

    const escalation = await adminChatService.createEscalation(
      eventId,
      request.user!.id,
      reason,
      { messageId, priority }
    );

    if (!escalation) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Chat room not found for this event' },
      });
    }

    return reply.status(201).send({ success: true, data: escalation });
  });

  /**
   * POST /admin/chats/:eventId/suspend - Suspend chat
   */
  fastify.post('/:eventId/suspend', {
    preHandler: [validateParams(eventIdParams), validateBody(suspendChatSchema.optional())],
  }, async (request, reply) => {
    const { eventId } = request.params as { eventId: string };
    const body = request.body as z.infer<typeof suspendChatSchema> | undefined;

    const suspended = await adminChatService.suspendChat(
      eventId,
      request.user!.id,
      body?.reason
    );

    if (!suspended) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Chat room not found for this event' },
      });
    }

    return { success: true, data: { suspended: true } };
  });

  /**
   * POST /admin/chats/:eventId/resume - Resume suspended chat
   */
  fastify.post('/:eventId/resume', {
    preHandler: [validateParams(eventIdParams)],
  }, async (request, reply) => {
    const { eventId } = request.params as { eventId: string };

    const resumed = await adminChatService.resumeChat(eventId, request.user!.id);

    if (!resumed) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Chat room not found for this event' },
      });
    }

    return { success: true, data: { resumed: true } };
  });

  /**
   * GET /admin/chats/:eventId/analytics - Get chat metrics
   */
  fastify.get('/:eventId/analytics', {
    preHandler: [validateParams(eventIdParams)],
  }, async (request, reply) => {
    const { eventId } = request.params as { eventId: string };

    const analytics = await adminChatService.getChatAnalytics(eventId);

    if (!analytics) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Chat room not found for this event' },
      });
    }

    return { success: true, data: analytics };
  });

  /**
   * GET /admin/chats/:eventId/moderation-log - Get moderation history
   */
  fastify.get('/:eventId/moderation-log', {
    preHandler: [validateParams(eventIdParams)],
  }, async (request) => {
    const { eventId } = request.params as { eventId: string };
    const query = request.query as { page?: string; limit?: string };

    const page = parseInt(query.page || '1', 10);
    const limit = parseInt(query.limit || '50', 10);

    const log = await adminChatService.getModerationLog(eventId, {
      limit,
      offset: (page - 1) * limit,
    });

    return { success: true, data: log };
  });
}
