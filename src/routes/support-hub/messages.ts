/**
 * Direct Messaging Routes
 * WO-57: Support Hub API and Backend Services
 * Phase 12: Support Hub Foundation
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { directMessagingService } from '../../services/supportHubService.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { validateBody, validateQuery, validateParams, commonSchemas } from '../../middleware/validate.js';

// Validation schemas
const sendMessageSchema = z.object({
  toId: z.string().uuid(),
  content: z.string().min(1).max(5000),
});

const paginationSchema = z.object({
  page: z.string().optional().default('1').transform(Number),
  limit: z.string().optional().default('20').transform(Number),
});

const messagesQuerySchema = z.object({
  page: z.string().optional().default('1').transform(Number),
  limit: z.string().optional().default('50').transform(Number),
});

export async function messageRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.addHook('preHandler', authenticate);

  /**
   * GET /messages/conversations - Get user's conversations
   */
  fastify.get('/conversations', {
    preHandler: [validateQuery(paginationSchema)],
  }, async (request) => {
    const { page, limit } = request.query as z.infer<typeof paginationSchema>;

    const result = await directMessagingService.getConversations(
      request.user!.id,
      page,
      limit
    );

    return {
      success: true,
      data: result.items,
      meta: {
        page,
        limit,
        total: result.total,
      },
    };
  });

  /**
   * GET /messages/conversations/:conversationId - Get messages in a conversation
   */
  fastify.get('/conversations/:conversationId', {
    preHandler: [
      validateParams(z.object({ conversationId: z.string().uuid() })),
      validateQuery(messagesQuerySchema),
    ],
  }, async (request, reply) => {
    const { conversationId } = request.params as { conversationId: string };
    const { page, limit } = request.query as z.infer<typeof messagesQuerySchema>;

    // Verify user is part of the conversation
    const conversations = await directMessagingService.getConversations(request.user!.id, 1, 1000);
    const isParticipant = conversations.items.some(c => c.id === conversationId);

    if (!isParticipant) {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You are not part of this conversation' },
      });
    }

    const result = await directMessagingService.getMessages(conversationId, page, limit);

    // Mark messages as read
    await directMessagingService.markMessagesAsRead(conversationId, request.user!.id);

    return {
      success: true,
      data: result.items,
      meta: {
        page,
        limit,
        total: result.total,
      },
    };
  });

  /**
   * POST /messages/conversations/:conversationId/read - Mark conversation as read
   */
  fastify.post('/conversations/:conversationId/read', {
    preHandler: [validateParams(z.object({ conversationId: z.string().uuid() }))],
  }, async (request, reply) => {
    const { conversationId } = request.params as { conversationId: string };

    // Verify user is part of the conversation
    const conversations = await directMessagingService.getConversations(request.user!.id, 1, 1000);
    const isParticipant = conversations.items.some(c => c.id === conversationId);

    if (!isParticipant) {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'You are not part of this conversation' },
      });
    }

    await directMessagingService.markMessagesAsRead(conversationId, request.user!.id);

    return { success: true, data: { marked: true } };
  });

  /**
   * GET /messages/unread - Get unread message count
   */
  fastify.get('/unread', async (request) => {
    const count = await directMessagingService.getUnreadCount(request.user!.id);
    return { success: true, data: { unreadCount: count } };
  });

  /**
   * POST /messages/send - Send a direct message
   */
  fastify.post('/send', {
    preHandler: [validateBody(sendMessageSchema)],
  }, async (request, reply) => {
    const { toId, content } = request.body as z.infer<typeof sendMessageSchema>;
    const fromId = request.user!.id;
    const fromType = request.user!.role === 'admin' || request.user!.role === 'manager' 
      ? 'admin' 
      : 'ambassador';

    // Prevent messaging yourself
    if (fromId === toId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Cannot send message to yourself' },
      });
    }

    const message = await directMessagingService.sendMessage(fromId, toId, content, fromType);

    return reply.status(201).send({
      success: true,
      data: message,
    });
  });

  /**
   * POST /messages/to/:userId - Send a direct message to specific user
   */
  fastify.post('/to/:userId', {
    preHandler: [
      validateParams(z.object({ userId: z.string().uuid() })),
      validateBody(z.object({ content: z.string().min(1).max(5000) })),
    ],
  }, async (request, reply) => {
    const { userId: toId } = request.params as { userId: string };
    const { content } = request.body as { content: string };
    const fromId = request.user!.id;
    const fromType = request.user!.role === 'admin' || request.user!.role === 'manager' 
      ? 'admin' 
      : 'ambassador';

    // Prevent messaging yourself
    if (fromId === toId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'BAD_REQUEST', message: 'Cannot send message to yourself' },
      });
    }

    const message = await directMessagingService.sendMessage(fromId, toId, content, fromType);

    return reply.status(201).send({
      success: true,
      data: message,
    });
  });

  // ========================================
  // ADMIN-SPECIFIC ROUTES
  // ========================================

  /**
   * GET /messages/admin/all - Get all conversations (admin only)
   * For admin dashboard to see all ambassador conversations
   */
  fastify.get('/admin/all', {
    preHandler: [requireRole('admin', 'manager'), validateQuery(paginationSchema)],
  }, async (request) => {
    const { page, limit } = request.query as z.infer<typeof paginationSchema>;

    // Get all conversations across the platform
    // This is a simplified version - in production you might want a dedicated service method
    const result = await directMessagingService.getConversations(
      request.user!.id,
      page,
      limit
    );

    return {
      success: true,
      data: result.items,
      meta: {
        page,
        limit,
        total: result.total,
      },
    };
  });
}
