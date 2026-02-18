/**
 * Chat Routes
 * WO-26: Event Chat API
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { chatService } from '../services/chatService.js';
import { authenticate } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery, commonSchemas } from '../middleware/validate.js';

const sendMessageSchema = z.object({
  content: z.string().min(1).max(4000),
  messageType: z.enum(['text', 'image', 'file', 'system']).optional(),
  attachmentKey: z.string().optional(),
  attachmentName: z.string().optional(),
  attachmentType: z.string().optional(),
  attachmentSize: z.number().optional(),
  replyToId: z.string().uuid().optional(),
});

export async function chatRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticate);

  /**
   * GET /chat/rooms - Get user's rooms
   */
  fastify.get('/rooms', async (request) => {
    const rooms = await chatService.getUserRooms(request.user!.id);
    return { success: true, data: rooms };
  });

  /**
   * GET /chat/event/:eventId/room - Get or create event room
   */
  fastify.get('/event/:id/room', {
    preHandler: [validateParams(commonSchemas.id)],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const room = await chatService.getOrCreateEventRoom(id);
    return { success: true, data: room };
  });

  /**
   * GET /chat/rooms/:roomId/messages - Get messages
   */
  fastify.get('/rooms/:id/messages', {
    preHandler: [validateParams(commonSchemas.id)],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const { limit, before } = request.query as { limit?: string; before?: string };
    
    const messages = await chatService.getMessages(
      id,
      limit ? parseInt(limit) : 50,
      before
    );
    return { success: true, data: messages };
  });

  /**
   * POST /chat/rooms/:roomId/messages - Send message
   */
  fastify.post('/rooms/:id/messages', {
    preHandler: [validateParams(commonSchemas.id), validateBody(sendMessageSchema)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = request.body as z.infer<typeof sendMessageSchema>;

    const message = await chatService.sendMessage({
      roomId: id,
      senderId: request.user!.id,
      ...input,
    });

    return reply.status(201).send({ success: true, data: message });
  });

  /**
   * PUT /chat/messages/:id - Edit message
   */
  fastify.put('/messages/:id', {
    preHandler: [
      validateParams(commonSchemas.id),
      validateBody(z.object({ content: z.string().min(1).max(4000) })),
    ],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { content } = request.body as { content: string };

    const message = await chatService.editMessage(id, content, request.user!.id);
    
    if (!message) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Message not found or not owned by user' },
      });
    }

    return { success: true, data: message };
  });

  /**
   * DELETE /chat/messages/:id - Delete message
   */
  fastify.delete('/messages/:id', {
    preHandler: [validateParams(commonSchemas.id)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = await chatService.deleteMessage(id, request.user!.id);
    
    if (!deleted) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Message not found or not owned by user' },
      });
    }

    return { success: true, data: { deleted: true } };
  });

  /**
   * POST /chat/messages/:id/reactions - Add reaction
   */
  fastify.post('/messages/:id/reactions', {
    preHandler: [
      validateParams(commonSchemas.id),
      validateBody(z.object({ reaction: z.string().min(1).max(10) })),
    ],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { reaction } = request.body as { reaction: string };

    await chatService.addReaction(id, request.user!.id, reaction);
    return reply.status(201).send({ success: true, data: { added: true } });
  });

  /**
   * DELETE /chat/messages/:id/reactions/:reaction - Remove reaction
   */
  fastify.delete('/messages/:id/reactions/:reaction', {
    preHandler: [validateParams(z.object({
      id: z.string().uuid(),
      reaction: z.string(),
    }))],
  }, async (request) => {
    const { id, reaction } = request.params as { id: string; reaction: string };
    await chatService.removeReaction(id, request.user!.id, reaction);
    return { success: true, data: { removed: true } };
  });

  /**
   * POST /chat/rooms/:roomId/read - Mark as read
   */
  fastify.post('/rooms/:id/read', {
    preHandler: [
      validateParams(commonSchemas.id),
      validateBody(z.object({ lastMessageId: z.string().uuid() })),
    ],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const { lastMessageId } = request.body as { lastMessageId: string };

    await chatService.markAsRead(id, request.user!.id, lastMessageId);
    return { success: true, data: { marked: true } };
  });

  /**
   * POST /chat/rooms/:roomId/join - Join room
   */
  fastify.post('/rooms/:id/join', {
    preHandler: [validateParams(commonSchemas.id)],
  }, async (request) => {
    const { id } = request.params as { id: string };
    await chatService.joinRoom(id, request.user!.id);
    return { success: true, data: { joined: true } };
  });

  /**
   * POST /chat/rooms/:roomId/leave - Leave room
   */
  fastify.post('/rooms/:id/leave', {
    preHandler: [validateParams(commonSchemas.id)],
  }, async (request) => {
    const { id } = request.params as { id: string };
    await chatService.leaveRoom(id, request.user!.id);
    return { success: true, data: { left: true } };
  });

  /**
   * GET /chat/rooms/:roomId/pinned - Get pinned messages
   */
  fastify.get('/rooms/:id/pinned', {
    preHandler: [validateParams(commonSchemas.id)],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const messages = await chatService.getPinnedMessages(id);
    return { success: true, data: messages };
  });

  /**
   * POST /chat/rooms/:roomId/pin/:messageId - Pin message
   */
  fastify.post('/rooms/:roomId/pin/:messageId', {
    preHandler: [validateParams(z.object({
      roomId: z.string().uuid(),
      messageId: z.string().uuid(),
    }))],
  }, async (request, reply) => {
    const { roomId, messageId } = request.params as { roomId: string; messageId: string };
    await chatService.pinMessage(roomId, messageId, request.user!.id);
    return reply.status(201).send({ success: true, data: { pinned: true } });
  });
}
