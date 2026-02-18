/**
 * Event Publisher Service
 * Handles publishing events to connected WebSocket clients with permission filtering
 */

import { randomUUID } from 'crypto';
import { WebSocket } from 'ws';
import { logger } from '../utils/logger.js';
import { db } from './database.js';
import type { 
  PlatformEvent, 
  EventType, 
  ClientSubscription, 
  SubscriptionFilter,
  BaseEvent 
} from '../types/events.js';
import type { UserRole } from '../types/index.js';

interface ConnectedClient {
  ws: WebSocket;
  clientId: string;
  userId: string;
  userRole: UserRole;
  subscriptions: SubscriptionFilter;
  connectedAt: Date;
  lastPing: Date;
}

class EventPublisher {
  private clients: Map<string, ConnectedClient> = new Map();
  private eventBuffer: PlatformEvent[] = [];
  private readonly MAX_BUFFER_SIZE = 1000;

  /**
   * Register a new WebSocket client
   */
  registerClient(
    ws: WebSocket,
    userId: string,
    userRole: UserRole
  ): string {
    const clientId = randomUUID();
    
    this.clients.set(clientId, {
      ws,
      clientId,
      userId,
      userRole,
      subscriptions: {},
      connectedAt: new Date(),
      lastPing: new Date(),
    });

    logger.info({ clientId, userId, userRole }, 'WebSocket client registered');
    
    return clientId;
  }

  /**
   * Unregister a client
   */
  unregisterClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      this.clients.delete(clientId);
      logger.info({ clientId, userId: client.userId }, 'WebSocket client unregistered');
    }
  }

  /**
   * Update client subscriptions
   */
  updateSubscription(clientId: string, filters: SubscriptionFilter): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.subscriptions = { ...client.subscriptions, ...filters };
      logger.debug({ clientId, filters }, 'Client subscription updated');
    }
  }

  /**
   * Publish an event to relevant clients
   */
  async publish(event: Omit<PlatformEvent, 'id' | 'timestamp'>): Promise<void> {
    const fullEvent: PlatformEvent = {
      ...event,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
    } as PlatformEvent;

    // Add to buffer for replay
    this.eventBuffer.push(fullEvent);
    if (this.eventBuffer.length > this.MAX_BUFFER_SIZE) {
      this.eventBuffer.shift();
    }

    // Log event to database
    await this.logEvent(fullEvent);

    // Send to relevant clients
    let sentCount = 0;
    for (const [clientId, client] of this.clients) {
      if (this.shouldReceiveEvent(client, fullEvent)) {
        this.sendToClient(client, fullEvent);
        sentCount++;
      }
    }

    logger.info(
      { eventType: event.type, eventId: fullEvent.id, sentCount },
      'Event published'
    );
  }

  /**
   * Check if a client should receive an event based on role and subscriptions
   */
  private shouldReceiveEvent(client: ConnectedClient, event: PlatformEvent): boolean {
    const { userRole, subscriptions, userId } = client;

    // Admins and managers receive all events
    if (userRole === 'admin' || userRole === 'manager') {
      return this.matchesSubscriptionFilter(subscriptions, event);
    }

    // Ambassadors only receive events related to them or their assignments
    if (userRole === 'ambassador') {
      const payload = (event as any).payload;
      
      // Check if event is about this ambassador
      if (payload?.ambassadorId && payload.ambassadorId === userId) {
        return this.matchesSubscriptionFilter(subscriptions, event);
      }

      // Check if subscribed to specific event IDs
      if (subscriptions.eventIds?.length && payload?.eventId) {
        if (subscriptions.eventIds.includes(payload.eventId)) {
          return this.matchesSubscriptionFilter(subscriptions, event);
        }
      }

      return false;
    }

    // Affiliates receive limited events (sync completed, etc.)
    if (userRole === 'affiliate') {
      const allowedTypes: EventType[] = [
        'external_sync.completed',
        'payroll.processed',
      ];
      return allowedTypes.includes(event.type as EventType);
    }

    return false;
  }

  /**
   * Check if event matches subscription filters
   */
  private matchesSubscriptionFilter(
    filters: SubscriptionFilter,
    event: PlatformEvent
  ): boolean {
    // If no filters, receive all (within permission)
    if (!filters.eventTypes?.length) {
      return true;
    }

    // Check event type filter
    if (filters.eventTypes && !filters.eventTypes.includes(event.type as EventType)) {
      return false;
    }

    return true;
  }

  /**
   * Send event to a specific client
   */
  private sendToClient(client: ConnectedClient, event: PlatformEvent): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(JSON.stringify({
          type: 'event',
          data: event,
        }));
      } catch (error) {
        logger.error({ error, clientId: client.clientId }, 'Failed to send event to client');
      }
    }
  }

  /**
   * Log event to database for audit and replay
   */
  private async logEvent(event: PlatformEvent): Promise<void> {
    try {
      await db.query(
        `INSERT INTO event_logs (id, event_type, payload, user_id, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [event.id, event.type, JSON.stringify(event), event.userId, event.timestamp]
      );
    } catch (error) {
      logger.error({ error, eventId: event.id }, 'Failed to log event');
    }
  }

  /**
   * Replay events from a specific timestamp
   */
  async replay(
    clientId: string,
    fromTimestamp: string,
    eventTypes?: EventType[],
    limit = 100
  ): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      const result = await db.queryMany<{ id: string; payload: string }>(
        `SELECT id, payload FROM event_logs
         WHERE created_at >= $1
         ${eventTypes?.length ? 'AND event_type = ANY($3)' : ''}
         ORDER BY created_at ASC
         LIMIT $2`,
        eventTypes?.length 
          ? [fromTimestamp, limit, eventTypes]
          : [fromTimestamp, limit]
      );

      for (const row of result) {
        const event = JSON.parse(row.payload) as PlatformEvent;
        if (this.shouldReceiveEvent(client, event)) {
          this.sendToClient(client, event);
        }
      }

      logger.info({ clientId, eventsReplayed: result.length }, 'Events replayed');
    } catch (error) {
      logger.error({ error, clientId }, 'Failed to replay events');
    }
  }

  /**
   * Handle client ping (for connection health)
   */
  handlePing(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.lastPing = new Date();
      client.ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
    }
  }

  /**
   * Get connection statistics
   */
  getStats(): { totalClients: number; byRole: Record<string, number> } {
    const byRole: Record<string, number> = {};
    
    for (const client of this.clients.values()) {
      byRole[client.userRole] = (byRole[client.userRole] || 0) + 1;
    }

    return {
      totalClients: this.clients.size,
      byRole,
    };
  }

  /**
   * Cleanup stale connections (no ping in 60 seconds)
   */
  cleanupStaleConnections(): void {
    const staleThreshold = new Date(Date.now() - 60000);
    
    for (const [clientId, client] of this.clients) {
      if (client.lastPing < staleThreshold) {
        logger.warn({ clientId }, 'Removing stale WebSocket connection');
        client.ws.close();
        this.clients.delete(clientId);
      }
    }
  }
}

// Export singleton instance
export const eventPublisher = new EventPublisher();

// Cleanup stale connections every 30 seconds
setInterval(() => {
  eventPublisher.cleanupStaleConnections();
}, 30000);
