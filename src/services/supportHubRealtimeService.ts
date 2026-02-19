/**
 * Support Hub Real-time Service
 * WO-58: Support Hub Real-time Messaging System
 * Phase 12: Support Hub Foundation
 * 
 * Provides real-time WebSocket functionality for:
 * - Ticket status updates and notifications
 * - Direct messaging with typing indicators
 * - Admin presence management
 * - Push notifications and announcements
 * - Read receipts and delivery confirmations
 */

import { randomUUID } from 'crypto';
import { WebSocket } from 'ws';
import { db } from './database.js';
import { logger } from '../utils/logger.js';
import type { UserRole } from '../types/index.js';
import {
  SupportHubEventTypes,
  type SupportHubEvent,
  type SupportHubEventType,
  type SupportHubSubscriptionFilter,
  type SupportHubClientSubscription,
  type AdminPresenceStatus,
  type NotificationPriority,
  type RateLimitConfig,
  DEFAULT_RATE_LIMITS,
} from '../types/support-hub-realtime.js';
import type { 
  TicketStatus, 
  TicketPriority, 
  TicketCategory,
  MessageSenderType 
} from '../types/support-hub.js';

// ============================================
// CONNECTED CLIENT TYPE
// ============================================

interface SupportHubConnectedClient {
  ws: WebSocket;
  clientId: string;
  userId: string;
  userRole: UserRole;
  subscriptions: SupportHubSubscriptionFilter;
  presenceStatus: AdminPresenceStatus;
  connectedAt: Date;
  lastActivity: Date;
  lastPing: Date;
  rateLimits: {
    messageCount: number;
    typingCount: number;
    subscriptionCount: number;
    windowStart: Date;
  };
}

// ============================================
// TYPING INDICATOR STATE
// ============================================

interface TypingState {
  userId: string;
  userName: string;
  conversationId: string;
  startedAt: Date;
  timeoutId: NodeJS.Timeout;
}

// ============================================
// SERVICE CLASS
// ============================================

class SupportHubRealtimeService {
  private clients: Map<string, SupportHubConnectedClient> = new Map();
  private userClients: Map<string, Set<string>> = new Map(); // userId -> clientIds
  private adminPresence: Map<string, AdminPresenceStatus> = new Map();
  private typingStates: Map<string, TypingState> = new Map(); // `${conversationId}:${userId}` -> state
  private eventBuffer: SupportHubEvent[] = [];
  private readonly MAX_BUFFER_SIZE = 500;
  private readonly TYPING_TIMEOUT_MS = 5000;
  private rateLimitConfig: RateLimitConfig = DEFAULT_RATE_LIMITS;

  // ============================================
  // CLIENT MANAGEMENT
  // ============================================

  /**
   * Register a new WebSocket client for Support Hub
   */
  registerClient(
    ws: WebSocket,
    userId: string,
    userRole: UserRole
  ): string {
    const clientId = randomUUID();
    const now = new Date();

    const client: SupportHubConnectedClient = {
      ws,
      clientId,
      userId,
      userRole,
      subscriptions: {},
      presenceStatus: 'online',
      connectedAt: now,
      lastActivity: now,
      lastPing: now,
      rateLimits: {
        messageCount: 0,
        typingCount: 0,
        subscriptionCount: 0,
        windowStart: now,
      },
    };

    this.clients.set(clientId, client);

    // Track user -> clients mapping
    if (!this.userClients.has(userId)) {
      this.userClients.set(userId, new Set());
    }
    this.userClients.get(userId)!.add(clientId);

    // Update admin presence if applicable
    if (userRole === 'admin' || userRole === 'manager') {
      this.updateAdminPresence(userId, 'online');
    }

    logger.info(
      { clientId, userId, userRole },
      'Support Hub WebSocket client registered'
    );

    return clientId;
  }

  /**
   * Unregister a client
   */
  unregisterClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Remove from user -> clients mapping
    const userClientSet = this.userClients.get(client.userId);
    if (userClientSet) {
      userClientSet.delete(clientId);
      if (userClientSet.size === 0) {
        this.userClients.delete(client.userId);
        
        // Update admin presence to offline if no more connections
        if (client.userRole === 'admin' || client.userRole === 'manager') {
          this.updateAdminPresence(client.userId, 'offline');
        }
      }
    }

    // Clear any typing states for this client
    this.clearTypingState(client.userId);

    this.clients.delete(clientId);
    logger.info(
      { clientId, userId: client.userId },
      'Support Hub WebSocket client unregistered'
    );
  }

  /**
   * Update client subscription filters
   */
  updateSubscription(clientId: string, filters: SupportHubSubscriptionFilter): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    // Rate limiting check
    if (!this.checkRateLimit(client, 'subscription')) {
      this.sendError(client, 'Rate limit exceeded for subscription changes');
      return false;
    }

    client.subscriptions = { ...client.subscriptions, ...filters };
    client.lastActivity = new Date();

    logger.debug(
      { clientId, filters },
      'Support Hub client subscription updated'
    );

    // Send confirmation
    this.sendToClient(client, {
      type: 'subscription_updated',
      filters: client.subscriptions,
      timestamp: new Date().toISOString(),
    });

    return true;
  }

  // ============================================
  // EVENT PUBLISHING
  // ============================================

  /**
   * Publish an event to relevant clients
   */
  async publish(event: Omit<SupportHubEvent, 'id' | 'timestamp'>): Promise<string> {
    const fullEvent: SupportHubEvent = {
      ...event,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
    } as SupportHubEvent;

    // Add to buffer for potential replay
    this.eventBuffer.push(fullEvent);
    if (this.eventBuffer.length > this.MAX_BUFFER_SIZE) {
      this.eventBuffer.shift();
    }

    // Log event to database
    await this.logEvent(fullEvent);

    // Send to relevant clients
    let sentCount = 0;
    for (const [clientId, client] of Array.from(this.clients)) {
      if (this.shouldReceiveEvent(client, fullEvent)) {
        this.sendToClient(client, { type: 'event', data: fullEvent });
        sentCount++;
      }
    }

    logger.info(
      { eventType: event.type, eventId: fullEvent.id, sentCount },
      'Support Hub event published'
    );

    return fullEvent.id;
  }

  /**
   * Send event directly to specific users
   */
  async publishToUsers(
    userIds: string[],
    event: Omit<SupportHubEvent, 'id' | 'timestamp'>
  ): Promise<string> {
    const fullEvent: SupportHubEvent = {
      ...event,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
    } as SupportHubEvent;

    // Log event
    await this.logEvent(fullEvent);

    // Send to all clients of specified users
    let sentCount = 0;
    for (const userId of userIds) {
      const clientIds = this.userClients.get(userId);
      if (clientIds) {
        for (const clientId of Array.from(clientIds)) {
          const client = this.clients.get(clientId);
          if (client) {
            this.sendToClient(client, { type: 'event', data: fullEvent });
            sentCount++;
          }
        }
      }
    }

    logger.info(
      { eventType: event.type, eventId: fullEvent.id, targetUsers: userIds.length, sentCount },
      'Support Hub event published to specific users'
    );

    return fullEvent.id;
  }

  /**
   * Send to all admins
   */
  async publishToAdmins(event: Omit<SupportHubEvent, 'id' | 'timestamp'>): Promise<string> {
    const fullEvent: SupportHubEvent = {
      ...event,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
    } as SupportHubEvent;

    await this.logEvent(fullEvent);

    let sentCount = 0;
    for (const [, client] of Array.from(this.clients)) {
      if (client.userRole === 'admin' || client.userRole === 'manager') {
        this.sendToClient(client, { type: 'event', data: fullEvent });
        sentCount++;
      }
    }

    logger.info(
      { eventType: event.type, eventId: fullEvent.id, sentCount },
      'Support Hub event published to admins'
    );

    return fullEvent.id;
  }

  // ============================================
  // TICKET EVENTS
  // ============================================

  /**
   * Publish ticket created event
   */
  async publishTicketCreated(params: {
    ticketId: string;
    ticketNumber: string;
    subject: string;
    category: TicketCategory;
    priority: TicketPriority;
    ambassadorId?: string;
    ambassadorName?: string;
    assignedTo?: string;
    assignedToName?: string;
    slaDueAt?: Date;
  }): Promise<string> {
    const targets: string[] = [];
    if (params.ambassadorId) targets.push(params.ambassadorId);
    if (params.assignedTo) targets.push(params.assignedTo);

    return this.publish({
      type: SupportHubEventTypes.TICKET_CREATED,
      payload: {
        ...params,
        slaDueAt: params.slaDueAt?.toISOString(),
      },
    } as any);
  }

  /**
   * Publish ticket status changed event
   */
  async publishTicketStatusChanged(params: {
    ticketId: string;
    ticketNumber: string;
    subject: string;
    previousStatus: TicketStatus;
    newStatus: TicketStatus;
    ambassadorId?: string;
    assignedTo?: string;
    changedBy?: string;
    changedByName?: string;
  }): Promise<string> {
    const targets: string[] = [];
    if (params.ambassadorId) targets.push(params.ambassadorId);
    if (params.assignedTo) targets.push(params.assignedTo);

    // Publish to specific users
    if (targets.length > 0) {
      return this.publishToUsers(targets, {
        type: SupportHubEventTypes.TICKET_STATUS_CHANGED,
        payload: params,
      } as any);
    }

    // Fallback to general publish
    return this.publish({
      type: SupportHubEventTypes.TICKET_STATUS_CHANGED,
      payload: params,
    } as any);
  }

  /**
   * Publish ticket message added event
   */
  async publishTicketMessageAdded(params: {
    ticketId: string;
    ticketNumber: string;
    messageId: string;
    content: string;
    senderType: MessageSenderType;
    senderId?: string;
    senderName?: string;
    isInternalNote: boolean;
    hasAttachments: boolean;
    ambassadorId?: string;
    assignedTo?: string;
  }): Promise<string> {
    const targets: string[] = [];
    
    // Don't send internal notes to ambassadors
    if (!params.isInternalNote && params.ambassadorId) {
      targets.push(params.ambassadorId);
    }
    if (params.assignedTo) targets.push(params.assignedTo);

    const eventPayload = {
      ticketId: params.ticketId,
      ticketNumber: params.ticketNumber,
      messageId: params.messageId,
      content: params.content,
      contentPreview: params.content.substring(0, 100),
      senderType: params.senderType,
      senderId: params.senderId,
      senderName: params.senderName,
      isInternalNote: params.isInternalNote,
      hasAttachments: params.hasAttachments,
    };

    if (targets.length > 0) {
      return this.publishToUsers(targets, {
        type: SupportHubEventTypes.TICKET_MESSAGE_ADDED,
        payload: eventPayload,
      } as any);
    }

    return this.publish({
      type: SupportHubEventTypes.TICKET_MESSAGE_ADDED,
      payload: eventPayload,
    } as any);
  }

  /**
   * Publish SLA warning event
   */
  async publishSlaWarning(params: {
    ticketId: string;
    ticketNumber: string;
    subject: string;
    priority: TicketPriority;
    slaDueAt: Date;
    hoursRemaining: number;
    assignedTo?: string;
    assignedToName?: string;
  }): Promise<string> {
    // SLA warnings go to admins and assigned agent
    const event = {
      type: SupportHubEventTypes.TICKET_SLA_WARNING,
      payload: {
        ...params,
        slaDueAt: params.slaDueAt.toISOString(),
      },
    } as any;

    if (params.assignedTo) {
      await this.publishToUsers([params.assignedTo], event);
    }

    return this.publishToAdmins(event);
  }

  // ============================================
  // DIRECT MESSAGING EVENTS
  // ============================================

  /**
   * Publish direct message sent event
   */
  async publishDMSent(params: {
    messageId: string;
    conversationId: string;
    senderId: string;
    senderName: string;
    senderType: 'ambassador' | 'admin';
    recipientId: string;
    content: string;
  }): Promise<string> {
    return this.publishToUsers([params.recipientId], {
      type: SupportHubEventTypes.DM_MESSAGE_SENT,
      payload: {
        ...params,
        contentPreview: params.content.substring(0, 100),
        sentAt: new Date().toISOString(),
      },
    } as any);
  }

  /**
   * Publish message delivery confirmation
   */
  async publishDMDelivered(params: {
    messageId: string;
    conversationId: string;
    senderId: string;
  }): Promise<string> {
    return this.publishToUsers([params.senderId], {
      type: SupportHubEventTypes.DM_MESSAGE_DELIVERED,
      payload: {
        messageId: params.messageId,
        conversationId: params.conversationId,
        deliveredAt: new Date().toISOString(),
      },
    } as any);
  }

  /**
   * Publish read receipt
   */
  async publishReadReceipt(params: {
    conversationId: string;
    readerId: string;
    lastReadMessageId: string;
    otherParticipantId: string;
  }): Promise<string> {
    return this.publishToUsers([params.otherParticipantId], {
      type: SupportHubEventTypes.DM_MESSAGE_READ,
      payload: {
        conversationId: params.conversationId,
        readerId: params.readerId,
        readAt: new Date().toISOString(),
        lastReadMessageId: params.lastReadMessageId,
      },
    } as any);
  }

  // ============================================
  // TYPING INDICATORS
  // ============================================

  /**
   * Handle typing indicator start
   */
  handleTypingStart(clientId: string, conversationId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Rate limiting
    if (!this.checkRateLimit(client, 'typing')) {
      return;
    }

    const stateKey = `${conversationId}:${client.userId}`;
    
    // Clear existing timeout
    const existingState = this.typingStates.get(stateKey);
    if (existingState) {
      clearTimeout(existingState.timeoutId);
    }

    // Get user name
    this.getUserName(client.userId, client.userRole).then(userName => {
      // Set new typing state with auto-clear timeout
      const timeoutId = setTimeout(() => {
        this.clearTypingState(client.userId, conversationId);
        this.broadcastTypingStop(conversationId, client.userId);
      }, this.TYPING_TIMEOUT_MS);

      this.typingStates.set(stateKey, {
        userId: client.userId,
        userName,
        conversationId,
        startedAt: new Date(),
        timeoutId,
      });

      // Broadcast to other participants
      this.broadcastTypingStart(conversationId, client.userId, userName);
    });
  }

  /**
   * Handle typing indicator stop
   */
  handleTypingStop(clientId: string, conversationId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    this.clearTypingState(client.userId, conversationId);
    this.broadcastTypingStop(conversationId, client.userId);
  }

  private clearTypingState(userId: string, conversationId?: string): void {
    if (conversationId) {
      const stateKey = `${conversationId}:${userId}`;
      const state = this.typingStates.get(stateKey);
      if (state) {
        clearTimeout(state.timeoutId);
        this.typingStates.delete(stateKey);
      }
    } else {
      // Clear all typing states for this user
      for (const [key, state] of Array.from(this.typingStates)) {
        if (state.userId === userId) {
          clearTimeout(state.timeoutId);
          this.typingStates.delete(key);
        }
      }
    }
  }

  private async broadcastTypingStart(
    conversationId: string,
    userId: string,
    userName: string
  ): Promise<void> {
    // Get other participant
    const otherParticipantId = await this.getOtherParticipant(conversationId, userId);
    if (!otherParticipantId) return;

    this.publishToUsers([otherParticipantId], {
      type: SupportHubEventTypes.DM_TYPING_START,
      payload: {
        conversationId,
        userId,
        userName,
      },
    } as any);
  }

  private async broadcastTypingStop(
    conversationId: string,
    userId: string
  ): Promise<void> {
    const otherParticipantId = await this.getOtherParticipant(conversationId, userId);
    if (!otherParticipantId) return;

    this.publishToUsers([otherParticipantId], {
      type: SupportHubEventTypes.DM_TYPING_STOP,
      payload: {
        conversationId,
        userId,
      },
    } as any);
  }

  // ============================================
  // ADMIN PRESENCE
  // ============================================

  /**
   * Update admin presence status
   */
  updateAdminPresence(
    adminId: string,
    status: AdminPresenceStatus,
    statusMessage?: string
  ): void {
    const previousStatus = this.adminPresence.get(adminId);
    this.adminPresence.set(adminId, status);

    // Update all clients for this admin
    const clientIds = this.userClients.get(adminId);
    if (clientIds) {
      for (const clientId of Array.from(clientIds)) {
        const client = this.clients.get(clientId);
        if (client) {
          client.presenceStatus = status;
        }
      }
    }

    // Broadcast presence change
    if (previousStatus !== status) {
      this.broadcastAdminPresence(adminId, status, statusMessage);
    }
  }

  private async broadcastAdminPresence(
    adminId: string,
    status: AdminPresenceStatus,
    statusMessage?: string
  ): Promise<void> {
    const adminName = await this.getUserName(adminId, 'admin');

    const eventType = {
      online: SupportHubEventTypes.ADMIN_ONLINE,
      offline: SupportHubEventTypes.ADMIN_OFFLINE,
      away: SupportHubEventTypes.ADMIN_AWAY,
      busy: SupportHubEventTypes.ADMIN_BUSY,
    }[status];

    // Broadcast to all connected clients
    this.publish({
      type: eventType,
      payload: {
        adminId,
        adminName,
        status,
        lastSeenAt: status === 'offline' ? new Date().toISOString() : undefined,
        statusMessage,
      },
    } as any);
  }

  /**
   * Get all online admins
   */
  getOnlineAdmins(): Array<{ adminId: string; status: AdminPresenceStatus }> {
    const admins: Array<{ adminId: string; status: AdminPresenceStatus }> = [];
    
    for (const [adminId, status] of Array.from(this.adminPresence)) {
      if (status !== 'offline') {
        admins.push({ adminId, status });
      }
    }
    
    return admins;
  }

  // ============================================
  // CONTENT EVENTS
  // ============================================

  /**
   * Publish article published event
   */
  async publishArticlePublished(params: {
    articleId: string;
    title: string;
    slug: string;
    category: string;
    excerpt?: string;
    authorId?: string;
    authorName?: string;
  }): Promise<string> {
    return this.publish({
      type: SupportHubEventTypes.ARTICLE_PUBLISHED,
      payload: params,
    } as any);
  }

  /**
   * Publish video published event
   */
  async publishVideoPublished(params: {
    videoId: string;
    title: string;
    category: string;
    description?: string;
    durationSeconds: number;
    isRequired: boolean;
    thumbnailUrl?: string;
  }): Promise<string> {
    return this.publish({
      type: SupportHubEventTypes.VIDEO_PUBLISHED,
      payload: params,
    } as any);
  }

  // ============================================
  // NOTIFICATIONS
  // ============================================

  /**
   * Send push notification to specific users
   */
  async sendPushNotification(params: {
    userIds: string[];
    title: string;
    body: string;
    priority?: NotificationPriority;
    category: string;
    actionUrl?: string;
    imageUrl?: string;
    data?: Record<string, unknown>;
    expiresAt?: Date;
  }): Promise<string> {
    const notificationId = randomUUID();

    // Log notification for persistence
    await this.logNotification(notificationId, params);

    return this.publishToUsers(params.userIds, {
      type: SupportHubEventTypes.NOTIFICATION_PUSH,
      payload: {
        notificationId,
        title: params.title,
        body: params.body,
        priority: params.priority || 'normal',
        category: params.category,
        actionUrl: params.actionUrl,
        imageUrl: params.imageUrl,
        data: params.data,
        expiresAt: params.expiresAt?.toISOString(),
      },
    } as any);
  }

  /**
   * Send announcement to all or specific audience
   */
  async sendAnnouncement(params: {
    title: string;
    content: string;
    priority?: NotificationPriority;
    targetAudience: 'all' | 'ambassadors' | 'admins';
    actionUrl?: string;
    expiresAt?: Date;
  }): Promise<string> {
    const announcementId = randomUUID();

    const event = {
      type: SupportHubEventTypes.ANNOUNCEMENT,
      payload: {
        announcementId,
        title: params.title,
        content: params.content,
        priority: params.priority || 'normal',
        targetAudience: params.targetAudience,
        actionUrl: params.actionUrl,
        expiresAt: params.expiresAt?.toISOString(),
      },
    } as any;

    if (params.targetAudience === 'admins') {
      return this.publishToAdmins(event);
    }

    // For 'all' or 'ambassadors', publish to everyone
    // The client-side can filter based on targetAudience
    return this.publish(event);
  }

  // ============================================
  // CONNECTION MANAGEMENT
  // ============================================

  /**
   * Handle client ping (heartbeat)
   */
  handlePing(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.lastPing = new Date();
      client.lastActivity = new Date();
      this.sendToClient(client, { 
        type: 'pong', 
        timestamp: new Date().toISOString() 
      });
    }
  }

  /**
   * Clean up stale connections
   */
  cleanupStaleConnections(): number {
    const staleThreshold = new Date(Date.now() - 60000); // 60 seconds
    let cleaned = 0;

    for (const [clientId, client] of Array.from(this.clients)) {
      if (client.lastPing < staleThreshold) {
        logger.warn({ clientId, userId: client.userId }, 'Removing stale Support Hub connection');
        try {
          client.ws.close();
        } catch (e) {
          // Ignore close errors
        }
        this.unregisterClient(clientId);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    totalClients: number;
    byRole: Record<string, number>;
    onlineAdmins: number;
    activeTyping: number;
    eventBufferSize: number;
  } {
    const byRole: Record<string, number> = {};

    for (const client of Array.from(this.clients.values())) {
      byRole[client.userRole] = (byRole[client.userRole] || 0) + 1;
    }

    return {
      totalClients: this.clients.size,
      byRole,
      onlineAdmins: this.getOnlineAdmins().length,
      activeTyping: this.typingStates.size,
      eventBufferSize: this.eventBuffer.length,
    };
  }

  /**
   * Check if user is online
   */
  isUserOnline(userId: string): boolean {
    return this.userClients.has(userId) && this.userClients.get(userId)!.size > 0;
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private shouldReceiveEvent(
    client: SupportHubConnectedClient,
    event: SupportHubEvent
  ): boolean {
    const { userRole, subscriptions, userId } = client;

    // Admins and managers receive all support hub events
    if (userRole === 'admin' || userRole === 'manager') {
      return this.matchesSubscriptionFilter(subscriptions, event);
    }

    // Ambassadors only receive events related to them
    if (userRole === 'ambassador') {
      const payload = event.payload as any;

      // Check if event is about this ambassador's ticket
      if (payload?.ambassadorId === userId) {
        return this.matchesSubscriptionFilter(subscriptions, event);
      }

      // Check if event is a DM for this user
      if (payload?.recipientId === userId || payload?.senderId === userId) {
        return this.matchesSubscriptionFilter(subscriptions, event);
      }

      // Check typing indicators for conversations they're part of
      if (event.type.startsWith('support.dm.typing')) {
        // Will be filtered by conversationId in subscription
        return this.matchesSubscriptionFilter(subscriptions, event);
      }

      // Announcements for ambassadors or all
      if (event.type === SupportHubEventTypes.ANNOUNCEMENT) {
        const audience = payload?.targetAudience;
        return audience === 'all' || audience === 'ambassadors';
      }

      // Content events (articles, videos) go to everyone
      if (event.type.startsWith('support.content.')) {
        return true;
      }

      return false;
    }

    return false;
  }

  private matchesSubscriptionFilter(
    filters: SupportHubSubscriptionFilter,
    event: SupportHubEvent
  ): boolean {
    // No filters means receive all
    if (!filters.eventTypes?.length) {
      // But still check specific filters
      return this.matchesSpecificFilters(filters, event);
    }

    // Check event type filter
    if (!filters.eventTypes.includes(event.type)) {
      return false;
    }

    return this.matchesSpecificFilters(filters, event);
  }

  private matchesSpecificFilters(
    filters: SupportHubSubscriptionFilter,
    event: SupportHubEvent
  ): boolean {
    const payload = event.payload as any;

    // Ticket ID filter
    if (filters.ticketIds?.length && payload?.ticketId) {
      if (!filters.ticketIds.includes(payload.ticketId)) {
        return false;
      }
    }

    // Conversation ID filter
    if (filters.conversationIds?.length && payload?.conversationId) {
      if (!filters.conversationIds.includes(payload.conversationId)) {
        return false;
      }
    }

    return true;
  }

  private checkRateLimit(
    client: SupportHubConnectedClient,
    type: 'message' | 'typing' | 'subscription'
  ): boolean {
    const now = new Date();
    const windowMs = 60000; // 1 minute window

    // Reset window if expired
    if (now.getTime() - client.rateLimits.windowStart.getTime() > windowMs) {
      client.rateLimits = {
        messageCount: 0,
        typingCount: 0,
        subscriptionCount: 0,
        windowStart: now,
      };
    }

    switch (type) {
      case 'message':
        if (client.rateLimits.messageCount >= this.rateLimitConfig.maxMessagesPerMinute) {
          return false;
        }
        client.rateLimits.messageCount++;
        break;
      case 'typing':
        if (client.rateLimits.typingCount >= this.rateLimitConfig.maxTypingUpdatesPerMinute) {
          return false;
        }
        client.rateLimits.typingCount++;
        break;
      case 'subscription':
        if (client.rateLimits.subscriptionCount >= this.rateLimitConfig.maxSubscriptionChangesPerMinute) {
          return false;
        }
        client.rateLimits.subscriptionCount++;
        break;
    }

    return true;
  }

  private sendToClient(client: SupportHubConnectedClient, message: any): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(JSON.stringify(message));
      } catch (error) {
        logger.error({ error, clientId: client.clientId }, 'Failed to send message to Support Hub client');
      }
    }
  }

  private sendError(client: SupportHubConnectedClient, message: string): void {
    this.sendToClient(client, { type: 'error', message, timestamp: new Date().toISOString() });
  }

  private async logEvent(event: SupportHubEvent): Promise<void> {
    try {
      await db.query(
        `INSERT INTO support_hub_events (id, event_type, payload, user_id, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [event.id, event.type, JSON.stringify(event), event.userId, event.timestamp]
      );
    } catch (error) {
      logger.error({ error, eventId: event.id }, 'Failed to log Support Hub event');
    }
  }

  private async logNotification(
    notificationId: string,
    params: {
      userIds: string[];
      title: string;
      body: string;
      priority?: NotificationPriority;
      category: string;
    }
  ): Promise<void> {
    try {
      await db.query(
        `INSERT INTO support_hub_notifications (id, title, body, priority, category, target_user_ids)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          notificationId,
          params.title,
          params.body,
          params.priority || 'normal',
          params.category,
          params.userIds,
        ]
      );
    } catch (error) {
      // Non-fatal - log and continue
      logger.warn({ error, notificationId }, 'Failed to log notification');
    }
  }

  private async getUserName(userId: string, role: string): Promise<string> {
    try {
      if (role === 'ambassador') {
        const result = await db.queryOne<{ first_name: string; last_name: string }>(
          'SELECT first_name, last_name FROM ambassadors WHERE id = $1',
          [userId]
        );
        return result ? `${result.first_name} ${result.last_name}` : 'Unknown';
      } else {
        const result = await db.queryOne<{ first_name: string; last_name: string }>(
          'SELECT first_name, last_name FROM users WHERE id = $1',
          [userId]
        );
        return result ? `${result.first_name} ${result.last_name}` : 'Unknown';
      }
    } catch {
      return 'Unknown';
    }
  }

  private async getOtherParticipant(
    conversationId: string,
    userId: string
  ): Promise<string | null> {
    try {
      const result = await db.queryOne<{ participant1_id: string; participant2_id: string }>(
        'SELECT participant1_id, participant2_id FROM conversations WHERE id = $1',
        [conversationId]
      );
      if (!result) return null;
      return result.participant1_id === userId ? result.participant2_id : result.participant1_id;
    } catch {
      return null;
    }
  }
}

// Export singleton instance
export const supportHubRealtimeService = new SupportHubRealtimeService();

// Cleanup stale connections every 30 seconds
setInterval(() => {
  const cleaned = supportHubRealtimeService.cleanupStaleConnections();
  if (cleaned > 0) {
    logger.info({ cleanedConnections: cleaned }, 'Support Hub stale connections cleaned');
  }
}, 30000);
