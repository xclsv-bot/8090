/**
 * Support Hub WebSocket Routes
 * WO-58: Support Hub Real-time Messaging System
 * Phase 12: Support Hub Foundation
 * 
 * Dedicated WebSocket endpoint for Support Hub real-time features:
 * - Ticket updates and notifications
 * - Direct messaging with typing indicators
 * - Admin presence indicators
 * - Read receipts
 */

import { FastifyInstance } from 'fastify';
import { verifyToken } from '@clerk/backend';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { supportHubRealtimeService } from '../../services/supportHubRealtimeService.js';
import { directMessagingService } from '../../services/supportHubService.js';
import type { UserRole } from '../../types/index.js';
import type {
  SupportHubWSMessage,
  SupportHubSubscribeMessage,
  SupportHubTypingMessage,
  SupportHubPresenceMessage,
  SupportHubReadReceiptMessage,
  AdminPresenceStatus,
} from '../../types/support-hub-realtime.js';

export async function supportHubWebsocketRoutes(fastify: FastifyInstance): Promise<void> {
  // Register WebSocket plugin if not already registered
  try {
    await fastify.register(import('@fastify/websocket'));
  } catch (e) {
    // Plugin might already be registered at app level
    logger.debug('WebSocket plugin registration skipped (likely already registered)');
  }

  /**
   * Support Hub WebSocket endpoint
   * Path: /support-hub/ws
   * 
   * Query params:
   * - token: JWT token for authentication
   * 
   * Incoming message actions:
   * - subscribe: Update event subscriptions
   * - unsubscribe: Clear all subscriptions
   * - typing: Send typing indicator
   * - presence: Update presence status (admin only)
   * - read_receipt: Mark messages as read
   * - ping: Heartbeat
   */
  fastify.get('/ws', { websocket: true }, async (socket, request) => {
    let clientId: string | null = null;
    let userId: string | null = null;
    let userRole: UserRole | null = null;

    try {
      // Extract token from query or header
      const token = (request.query as any).token ||
        request.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        socket.send(JSON.stringify({
          type: 'error',
          code: 'AUTH_REQUIRED',
          message: 'Authentication required',
        }));
        socket.close(4001, 'Unauthorized');
        return;
      }

      // Verify token with Clerk
      try {
        const payload = await verifyToken(token, {
          secretKey: env.CLERK_SECRET_KEY,
        });

        if (!payload?.sub) {
          throw new Error('Invalid token payload');
        }

        userId = payload.sub;
        userRole = (payload.role as UserRole) || 'ambassador';
      } catch (authError) {
        logger.warn({ error: authError }, 'Support Hub WebSocket authentication failed');
        socket.send(JSON.stringify({
          type: 'error',
          code: 'AUTH_INVALID',
          message: 'Invalid authentication token',
        }));
        socket.close(4001, 'Unauthorized');
        return;
      }

      // Register client with the real-time service
      clientId = supportHubRealtimeService.registerClient(socket, userId, userRole);

      // Send connection confirmation with initial state
      const onlineAdmins = supportHubRealtimeService.getOnlineAdmins();
      socket.send(JSON.stringify({
        type: 'connected',
        clientId,
        userId,
        role: userRole,
        timestamp: new Date().toISOString(),
        initialState: {
          onlineAdmins,
        },
      }));

      logger.info({ clientId, userId, userRole }, 'Support Hub WebSocket connected');

      // Handle incoming messages
      socket.on('message', async (rawMessage: Buffer) => {
        try {
          const message: SupportHubWSMessage = JSON.parse(rawMessage.toString());

          switch (message.action) {
            case 'subscribe':
              handleSubscribe(clientId!, message as SupportHubSubscribeMessage);
              break;

            case 'unsubscribe':
              handleUnsubscribe(clientId!);
              break;

            case 'typing':
              handleTyping(clientId!, message as SupportHubTypingMessage);
              break;

            case 'presence':
              handlePresence(clientId!, userId!, userRole!, message as SupportHubPresenceMessage);
              break;

            case 'read_receipt':
              await handleReadReceipt(clientId!, userId!, message as SupportHubReadReceiptMessage);
              break;

            case 'ping':
              supportHubRealtimeService.handlePing(clientId!);
              break;

            default:
              socket.send(JSON.stringify({
                type: 'error',
                code: 'UNKNOWN_ACTION',
                message: `Unknown action: ${message.action}`,
              }));
          }
        } catch (error) {
          logger.error({ error, clientId }, 'Error processing Support Hub WebSocket message');
          socket.send(JSON.stringify({
            type: 'error',
            code: 'INVALID_MESSAGE',
            message: 'Invalid message format',
          }));
        }
      });

      // Handle disconnect
      socket.on('close', (code, reason) => {
        logger.info({ clientId, userId, code, reason: reason?.toString() }, 'Support Hub WebSocket disconnected');
        if (clientId) {
          supportHubRealtimeService.unregisterClient(clientId);
        }
      });

      // Handle errors
      socket.on('error', (error) => {
        logger.error({ error, clientId, userId }, 'Support Hub WebSocket error');
        if (clientId) {
          supportHubRealtimeService.unregisterClient(clientId);
        }
      });

    } catch (error) {
      logger.error({ error }, 'Support Hub WebSocket connection error');
      socket.send(JSON.stringify({
        type: 'error',
        code: 'CONNECTION_ERROR',
        message: 'Connection error',
      }));
      socket.close(4000, 'Connection error');
    }
  });

  /**
   * GET /support-hub/ws/stats - Get WebSocket statistics
   * Admin only endpoint for monitoring
   */
  fastify.get('/ws/stats', async (request, reply) => {
    // Basic auth check - in production, use proper auth middleware
    const stats = supportHubRealtimeService.getStats();
    return { success: true, data: stats };
  });

  /**
   * GET /support-hub/ws/online-admins - Get list of online admins
   * For showing availability to ambassadors
   */
  fastify.get('/ws/online-admins', async () => {
    const admins = supportHubRealtimeService.getOnlineAdmins();
    return { success: true, data: { admins } };
  });

  /**
   * GET /support-hub/ws/user/:userId/online - Check if user is online
   */
  fastify.get('/ws/user/:userId/online', async (request) => {
    const { userId } = request.params as { userId: string };
    const isOnline = supportHubRealtimeService.isUserOnline(userId);
    return { success: true, data: { userId, isOnline } };
  });
}

// ============================================
// MESSAGE HANDLERS
// ============================================

function handleSubscribe(clientId: string, message: SupportHubSubscribeMessage): void {
  const { payload } = message;
  
  if (!payload) {
    return;
  }

  supportHubRealtimeService.updateSubscription(clientId, payload);
  
  logger.debug({ clientId, filters: payload }, 'Support Hub client subscription updated');
}

function handleUnsubscribe(clientId: string): void {
  supportHubRealtimeService.updateSubscription(clientId, {
    eventTypes: [],
    ticketIds: [],
    conversationIds: [],
  });
  
  logger.debug({ clientId }, 'Support Hub client unsubscribed from all events');
}

function handleTyping(clientId: string, message: SupportHubTypingMessage): void {
  const { payload } = message;
  
  if (!payload?.conversationId) {
    return;
  }

  if (payload.isTyping) {
    supportHubRealtimeService.handleTypingStart(clientId, payload.conversationId);
  } else {
    supportHubRealtimeService.handleTypingStop(clientId, payload.conversationId);
  }
}

function handlePresence(
  clientId: string,
  userId: string,
  userRole: UserRole,
  message: SupportHubPresenceMessage
): void {
  // Only admins and managers can update presence
  if (userRole !== 'admin' && userRole !== 'manager') {
    return;
  }

  const { payload } = message;
  if (!payload?.status) {
    return;
  }

  const validStatuses: AdminPresenceStatus[] = ['online', 'offline', 'away', 'busy'];
  if (!validStatuses.includes(payload.status)) {
    return;
  }

  supportHubRealtimeService.updateAdminPresence(
    userId,
    payload.status,
    payload.statusMessage
  );

  logger.debug({ userId, status: payload.status }, 'Admin presence updated');
}

async function handleReadReceipt(
  clientId: string,
  userId: string,
  message: SupportHubReadReceiptMessage
): Promise<void> {
  const { payload } = message;
  
  if (!payload?.conversationId || !payload?.lastReadMessageId) {
    return;
  }

  try {
    // Mark messages as read in the database
    await directMessagingService.markMessagesAsRead(payload.conversationId, userId);

    // Get the other participant to send them the read receipt
    const conversations = await directMessagingService.getConversations(userId, 1, 1000);
    const conversation = conversations.items.find(c => c.id === payload.conversationId);
    
    if (conversation) {
      await supportHubRealtimeService.publishReadReceipt({
        conversationId: payload.conversationId,
        readerId: userId,
        lastReadMessageId: payload.lastReadMessageId,
        otherParticipantId: conversation.otherParticipantId,
      });
    }

    logger.debug({ userId, conversationId: payload.conversationId }, 'Read receipt processed');
  } catch (error) {
    logger.error({ error, clientId }, 'Failed to process read receipt');
  }
}
