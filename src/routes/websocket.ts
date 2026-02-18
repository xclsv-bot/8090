/**
 * WebSocket Gateway Routes
 * WO-21: Real-time event system
 */

import { FastifyInstance } from 'fastify';
import { verifyToken } from '@clerk/backend';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { eventPublisher } from '../services/eventPublisher.js';
import type { UserRole } from '../types/index.js';
import type { WSMessage, WSSubscribeMessage, WSReplayMessage, EventType } from '../types/events.js';

export async function websocketRoutes(fastify: FastifyInstance): Promise<void> {
  // Register WebSocket plugin
  await fastify.register(import('@fastify/websocket'));

  /**
   * Main WebSocket endpoint
   * Clients connect with Bearer token in query param or header
   */
  fastify.get('/ws', { websocket: true }, async (socket, request) => {
    let clientId: string | null = null;

    try {
      // Extract token from query or header
      const token = (request.query as any).token || 
                    request.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        socket.send(JSON.stringify({ 
          type: 'error', 
          message: 'Authentication required' 
        }));
        socket.close(4001, 'Unauthorized');
        return;
      }

      // Verify token with Clerk
      let userId: string;
      let userRole: UserRole;

      try {
        const payload = await verifyToken(token, {
          secretKey: env.CLERK_SECRET_KEY,
        });

        if (!payload?.sub) {
          throw new Error('Invalid token');
        }

        userId = payload.sub;
        userRole = (payload.role as UserRole) || 'ambassador';
      } catch (authError) {
        logger.warn({ error: authError }, 'WebSocket authentication failed');
        socket.send(JSON.stringify({ 
          type: 'error', 
          message: 'Invalid authentication token' 
        }));
        socket.close(4001, 'Unauthorized');
        return;
      }

      // Register client
      clientId = eventPublisher.registerClient(socket, userId, userRole);

      // Send connection confirmation
      socket.send(JSON.stringify({
        type: 'connected',
        clientId,
        userId,
        role: userRole,
        timestamp: new Date().toISOString(),
      }));

      // Handle incoming messages
      socket.on('message', async (rawMessage: Buffer) => {
        try {
          const message: WSMessage = JSON.parse(rawMessage.toString());

          switch (message.action) {
            case 'subscribe':
              handleSubscribe(clientId!, message as WSSubscribeMessage);
              break;

            case 'unsubscribe':
              handleUnsubscribe(clientId!);
              break;

            case 'ping':
              eventPublisher.handlePing(clientId!);
              break;

            case 'replay':
              await handleReplay(clientId!, message as WSReplayMessage);
              break;

            default:
              socket.send(JSON.stringify({
                type: 'error',
                message: `Unknown action: ${message.action}`,
              }));
          }
        } catch (error) {
          logger.error({ error, clientId }, 'Error processing WebSocket message');
          socket.send(JSON.stringify({
            type: 'error',
            message: 'Invalid message format',
          }));
        }
      });

      // Handle disconnect
      socket.on('close', () => {
        if (clientId) {
          eventPublisher.unregisterClient(clientId);
        }
      });

      // Handle errors
      socket.on('error', (error) => {
        logger.error({ error, clientId }, 'WebSocket error');
        if (clientId) {
          eventPublisher.unregisterClient(clientId);
        }
      });

    } catch (error) {
      logger.error({ error }, 'WebSocket connection error');
      socket.close(4000, 'Connection error');
    }
  });

  /**
   * WebSocket stats endpoint (admin only)
   */
  fastify.get('/ws/stats', async (request, reply) => {
    // TODO: Add auth middleware for admin
    const stats = eventPublisher.getStats();
    return { success: true, data: stats };
  });
}

/**
 * Handle subscription updates
 */
function handleSubscribe(clientId: string, message: WSSubscribeMessage): void {
  const { eventTypes, eventIds, ambassadorIds } = message.payload || {};

  eventPublisher.updateSubscription(clientId, {
    eventTypes: eventTypes as EventType[],
    eventIds,
    ambassadorIds,
  });

  logger.debug({ clientId, filters: message.payload }, 'Client subscribed to events');
}

/**
 * Handle unsubscription
 */
function handleUnsubscribe(clientId: string): void {
  eventPublisher.updateSubscription(clientId, {
    eventTypes: [],
    eventIds: [],
    ambassadorIds: [],
  });

  logger.debug({ clientId }, 'Client unsubscribed from all events');
}

/**
 * Handle event replay request
 */
async function handleReplay(clientId: string, message: WSReplayMessage): Promise<void> {
  const { fromTimestamp, eventTypes, limit } = message.payload || {};

  if (!fromTimestamp) {
    return;
  }

  await eventPublisher.replay(
    clientId,
    fromTimestamp,
    eventTypes as EventType[],
    limit
  );
}
