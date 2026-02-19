/**
 * Support Hub Real-time Types
 * WO-58: Support Hub Real-time Messaging System
 * Phase 12: Support Hub Foundation
 * 
 * Defines WebSocket event types, payloads, and subscription filters
 * for real-time support hub functionality.
 */

import type { 
  TicketStatus, 
  TicketPriority, 
  MessageSenderType,
  TicketCategory 
} from './support-hub.js';

// ============================================
// SUPPORT HUB EVENT TYPES
// ============================================

export const SupportHubEventTypes = {
  // Ticket events
  TICKET_CREATED: 'support.ticket.created',
  TICKET_UPDATED: 'support.ticket.updated',
  TICKET_ASSIGNED: 'support.ticket.assigned',
  TICKET_STATUS_CHANGED: 'support.ticket.status_changed',
  TICKET_PRIORITY_CHANGED: 'support.ticket.priority_changed',
  TICKET_MESSAGE_ADDED: 'support.ticket.message_added',
  TICKET_SLA_WARNING: 'support.ticket.sla_warning',
  TICKET_SLA_BREACHED: 'support.ticket.sla_breached',

  // Direct messaging events
  DM_MESSAGE_SENT: 'support.dm.message_sent',
  DM_MESSAGE_DELIVERED: 'support.dm.message_delivered',
  DM_MESSAGE_READ: 'support.dm.message_read',
  DM_TYPING_START: 'support.dm.typing_start',
  DM_TYPING_STOP: 'support.dm.typing_stop',

  // Presence events
  ADMIN_ONLINE: 'support.presence.admin_online',
  ADMIN_OFFLINE: 'support.presence.admin_offline',
  ADMIN_AWAY: 'support.presence.admin_away',
  ADMIN_BUSY: 'support.presence.admin_busy',

  // Content events
  ARTICLE_PUBLISHED: 'support.content.article_published',
  ARTICLE_UPDATED: 'support.content.article_updated',
  VIDEO_PUBLISHED: 'support.content.video_published',
  VIDEO_UPDATED: 'support.content.video_updated',

  // Notification events
  NOTIFICATION_PUSH: 'support.notification.push',
  ANNOUNCEMENT: 'support.notification.announcement',
} as const;

export type SupportHubEventType = typeof SupportHubEventTypes[keyof typeof SupportHubEventTypes];

// ============================================
// BASE EVENT INTERFACE
// ============================================

export interface SupportHubBaseEvent {
  id: string;
  type: SupportHubEventType;
  timestamp: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

// ============================================
// TICKET EVENT PAYLOADS
// ============================================

export interface TicketCreatedEvent extends SupportHubBaseEvent {
  type: 'support.ticket.created';
  payload: {
    ticketId: string;
    ticketNumber: string;
    subject: string;
    category: TicketCategory;
    priority: TicketPriority;
    ambassadorId?: string;
    ambassadorName?: string;
    assignedTo?: string;
    assignedToName?: string;
    slaDueAt?: string;
  };
}

export interface TicketUpdatedEvent extends SupportHubBaseEvent {
  type: 'support.ticket.updated';
  payload: {
    ticketId: string;
    ticketNumber: string;
    changes: Record<string, { old: unknown; new: unknown }>;
  };
}

export interface TicketAssignedEvent extends SupportHubBaseEvent {
  type: 'support.ticket.assigned';
  payload: {
    ticketId: string;
    ticketNumber: string;
    assignedTo: string;
    assignedToName: string;
    previousAssignee?: string;
  };
}

export interface TicketStatusChangedEvent extends SupportHubBaseEvent {
  type: 'support.ticket.status_changed';
  payload: {
    ticketId: string;
    ticketNumber: string;
    subject: string;
    previousStatus: TicketStatus;
    newStatus: TicketStatus;
    changedBy?: string;
    changedByName?: string;
  };
}

export interface TicketPriorityChangedEvent extends SupportHubBaseEvent {
  type: 'support.ticket.priority_changed';
  payload: {
    ticketId: string;
    ticketNumber: string;
    previousPriority: TicketPriority;
    newPriority: TicketPriority;
    newSlaDueAt?: string;
  };
}

export interface TicketMessageAddedEvent extends SupportHubBaseEvent {
  type: 'support.ticket.message_added';
  payload: {
    ticketId: string;
    ticketNumber: string;
    messageId: string;
    content: string;
    contentPreview: string;
    senderType: MessageSenderType;
    senderId?: string;
    senderName?: string;
    isInternalNote: boolean;
    hasAttachments: boolean;
  };
}

export interface TicketSlaWarningEvent extends SupportHubBaseEvent {
  type: 'support.ticket.sla_warning';
  payload: {
    ticketId: string;
    ticketNumber: string;
    subject: string;
    priority: TicketPriority;
    slaDueAt: string;
    hoursRemaining: number;
    assignedTo?: string;
    assignedToName?: string;
  };
}

export interface TicketSlaBreachedEvent extends SupportHubBaseEvent {
  type: 'support.ticket.sla_breached';
  payload: {
    ticketId: string;
    ticketNumber: string;
    subject: string;
    priority: TicketPriority;
    slaDueAt: string;
    hoursOverdue: number;
    assignedTo?: string;
    assignedToName?: string;
  };
}

// ============================================
// DIRECT MESSAGING EVENT PAYLOADS
// ============================================

export interface DMMessageSentEvent extends SupportHubBaseEvent {
  type: 'support.dm.message_sent';
  payload: {
    messageId: string;
    conversationId: string;
    senderId: string;
    senderName: string;
    senderType: 'ambassador' | 'admin';
    recipientId: string;
    content: string;
    contentPreview: string;
    sentAt: string;
  };
}

export interface DMMessageDeliveredEvent extends SupportHubBaseEvent {
  type: 'support.dm.message_delivered';
  payload: {
    messageId: string;
    conversationId: string;
    deliveredAt: string;
  };
}

export interface DMMessageReadEvent extends SupportHubBaseEvent {
  type: 'support.dm.message_read';
  payload: {
    conversationId: string;
    readerId: string;
    readAt: string;
    lastReadMessageId: string;
  };
}

export interface DMTypingStartEvent extends SupportHubBaseEvent {
  type: 'support.dm.typing_start';
  payload: {
    conversationId: string;
    userId: string;
    userName: string;
  };
}

export interface DMTypingStopEvent extends SupportHubBaseEvent {
  type: 'support.dm.typing_stop';
  payload: {
    conversationId: string;
    userId: string;
  };
}

// ============================================
// PRESENCE EVENT PAYLOADS
// ============================================

export type AdminPresenceStatus = 'online' | 'offline' | 'away' | 'busy';

export interface AdminPresenceEvent extends SupportHubBaseEvent {
  type: 'support.presence.admin_online' | 'support.presence.admin_offline' | 
        'support.presence.admin_away' | 'support.presence.admin_busy';
  payload: {
    adminId: string;
    adminName: string;
    status: AdminPresenceStatus;
    lastSeenAt?: string;
    statusMessage?: string;
  };
}

// ============================================
// CONTENT EVENT PAYLOADS
// ============================================

export interface ArticlePublishedEvent extends SupportHubBaseEvent {
  type: 'support.content.article_published';
  payload: {
    articleId: string;
    title: string;
    slug: string;
    category: string;
    excerpt?: string;
    authorId?: string;
    authorName?: string;
  };
}

export interface ArticleUpdatedEvent extends SupportHubBaseEvent {
  type: 'support.content.article_updated';
  payload: {
    articleId: string;
    title: string;
    slug: string;
    changes: string[];
  };
}

export interface VideoPublishedEvent extends SupportHubBaseEvent {
  type: 'support.content.video_published';
  payload: {
    videoId: string;
    title: string;
    category: string;
    description?: string;
    durationSeconds: number;
    isRequired: boolean;
    thumbnailUrl?: string;
  };
}

export interface VideoUpdatedEvent extends SupportHubBaseEvent {
  type: 'support.content.video_updated';
  payload: {
    videoId: string;
    title: string;
    changes: string[];
  };
}

// ============================================
// NOTIFICATION EVENT PAYLOADS
// ============================================

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface PushNotificationEvent extends SupportHubBaseEvent {
  type: 'support.notification.push';
  payload: {
    notificationId: string;
    title: string;
    body: string;
    priority: NotificationPriority;
    category: string;
    actionUrl?: string;
    imageUrl?: string;
    data?: Record<string, unknown>;
    expiresAt?: string;
  };
}

export interface AnnouncementEvent extends SupportHubBaseEvent {
  type: 'support.notification.announcement';
  payload: {
    announcementId: string;
    title: string;
    content: string;
    priority: NotificationPriority;
    targetAudience: 'all' | 'ambassadors' | 'admins';
    actionUrl?: string;
    expiresAt?: string;
  };
}

// ============================================
// UNION TYPE FOR ALL EVENTS
// ============================================

export type SupportHubEvent =
  | TicketCreatedEvent
  | TicketUpdatedEvent
  | TicketAssignedEvent
  | TicketStatusChangedEvent
  | TicketPriorityChangedEvent
  | TicketMessageAddedEvent
  | TicketSlaWarningEvent
  | TicketSlaBreachedEvent
  | DMMessageSentEvent
  | DMMessageDeliveredEvent
  | DMMessageReadEvent
  | DMTypingStartEvent
  | DMTypingStopEvent
  | AdminPresenceEvent
  | ArticlePublishedEvent
  | ArticleUpdatedEvent
  | VideoPublishedEvent
  | VideoUpdatedEvent
  | PushNotificationEvent
  | AnnouncementEvent;

// ============================================
// SUBSCRIPTION TYPES
// ============================================

export interface SupportHubSubscriptionFilter {
  // Event type filtering
  eventTypes?: SupportHubEventType[];
  
  // Ticket-specific filters
  ticketIds?: string[];
  ticketStatuses?: TicketStatus[];
  ticketPriorities?: TicketPriority[];
  
  // User-specific filters
  ambassadorIds?: string[];
  adminIds?: string[];
  
  // Conversation filters
  conversationIds?: string[];
  
  // Content filters
  articleCategories?: string[];
  videoCategories?: string[];
}

export interface SupportHubClientSubscription {
  clientId: string;
  userId: string;
  userRole: string;
  filters: SupportHubSubscriptionFilter;
  subscribedAt: Date;
  lastActivity: Date;
}

// ============================================
// WEBSOCKET MESSAGE TYPES
// ============================================

export interface SupportHubWSMessage {
  action: 'subscribe' | 'unsubscribe' | 'typing' | 'presence' | 'read_receipt' | 'ping';
  payload?: unknown;
}

export interface SupportHubSubscribeMessage extends SupportHubWSMessage {
  action: 'subscribe';
  payload: SupportHubSubscriptionFilter;
}

export interface SupportHubTypingMessage extends SupportHubWSMessage {
  action: 'typing';
  payload: {
    conversationId: string;
    isTyping: boolean;
  };
}

export interface SupportHubPresenceMessage extends SupportHubWSMessage {
  action: 'presence';
  payload: {
    status: AdminPresenceStatus;
    statusMessage?: string;
  };
}

export interface SupportHubReadReceiptMessage extends SupportHubWSMessage {
  action: 'read_receipt';
  payload: {
    conversationId: string;
    lastReadMessageId: string;
  };
}

// ============================================
// RATE LIMITING TYPES
// ============================================

export interface RateLimitConfig {
  maxMessagesPerMinute: number;
  maxTypingUpdatesPerMinute: number;
  maxSubscriptionChangesPerMinute: number;
  cooldownPeriodMs: number;
}

export const DEFAULT_RATE_LIMITS: RateLimitConfig = {
  maxMessagesPerMinute: 60,
  maxTypingUpdatesPerMinute: 30,
  maxSubscriptionChangesPerMinute: 10,
  cooldownPeriodMs: 1000,
};

// ============================================
// CONNECTION STATE TYPES
// ============================================

export interface ConnectionState {
  connected: boolean;
  lastConnectedAt?: Date;
  lastDisconnectedAt?: Date;
  reconnectAttempts: number;
  lastError?: string;
}

export interface ReconnectionConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export const DEFAULT_RECONNECTION_CONFIG: ReconnectionConfig = {
  maxRetries: 10,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};
