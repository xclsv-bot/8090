/**
 * Admin Chat Types
 * WO-81: Event Chat Admin Monitoring & Moderation
 */

// Chat room with admin-specific metrics
export interface AdminChatRoom {
  id: string;
  eventId: string | null;
  roomType: string;
  name: string | null;
  description: string | null;
  isActive: boolean;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
  // Joined data
  eventTitle?: string;
  eventDate?: string;
  eventStatus?: string;
  // Metrics
  messageCount: number;
  memberCount: number;
  lastActivityAt: Date | null;
}

// Chat message with sender details
export interface AdminChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  messageType: string;
  content: string;
  attachmentKey: string | null;
  attachmentName: string | null;
  attachmentType: string | null;
  attachmentSize: number | null;
  replyToId: string | null;
  isEdited: boolean;
  editedAt: Date | null;
  isDeleted: boolean;
  deletedAt: Date | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  // Joined data
  senderFirstName?: string;
  senderLastName?: string;
  senderEmail?: string;
  // Moderation tracking
  moderatedBy?: string;
  moderatedAt?: Date;
  moderationReason?: string;
}

// Moderation action types
export type ModerationAction = 'edit' | 'delete' | 'warn' | 'flag';

// Moderation log entry
export interface ModerationLogEntry {
  id: string;
  messageId: string;
  roomId: string;
  action: ModerationAction;
  adminId: string;
  reason: string | null;
  originalContent: string | null;
  newContent: string | null;
  createdAt: Date;
  // Joined data
  adminFirstName?: string;
  adminLastName?: string;
}

// Admin intervention message
export interface AdminIntervention {
  id: string;
  roomId: string;
  eventId: string;
  adminId: string;
  content: string;
  interventionType: 'message' | 'warning' | 'announcement';
  createdAt: Date;
}

// Escalation request
export interface EscalationRequest {
  id: string;
  roomId: string;
  eventId: string;
  reporterId: string;
  messageId: string | null;
  reason: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'in_progress' | 'resolved' | 'dismissed';
  assignedTo: string | null;
  resolvedAt: Date | null;
  resolutionNotes: string | null;
  createdAt: Date;
}

// Chat analytics
export interface ChatAnalytics {
  roomId: string;
  eventId: string | null;
  totalMessages: number;
  uniqueParticipants: number;
  messagesLast24h: number;
  messagesLast7d: number;
  avgMessagesPerDay: number;
  peakHour: number | null;
  topContributors: {
    userId: string;
    firstName: string | null;
    lastName: string | null;
    messageCount: number;
  }[];
  messageTypeBreakdown: {
    type: string;
    count: number;
  }[];
  flaggedMessageCount: number;
  moderationActionCount: number;
}

// Summary analytics across all chats
export interface ChatAnalyticsSummary {
  totalActiveChats: number;
  totalMessages: number;
  totalParticipants: number;
  messagesLast24h: number;
  pendingEscalations: number;
  moderationActionsToday: number;
  topActiveChats: {
    roomId: string;
    eventId: string;
    eventTitle: string;
    messageCount: number;
    lastActivityAt: Date;
  }[];
}

// Chat status for suspension
export type ChatStatus = 'active' | 'suspended' | 'archived';

// Filter options for message search
export interface MessageFilterOptions {
  senderId?: string;
  messageType?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
  isDeleted?: boolean;
  isFlagged?: boolean;
  limit?: number;
  offset?: number;
}

// Pagination metadata
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
