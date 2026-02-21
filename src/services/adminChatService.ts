/**
 * Admin Chat Service
 * WO-81: Event Chat Admin Monitoring & Moderation
 */

import { db } from './database.js';
import { logger } from '../utils/logger.js';
import type {
  AdminChatRoom,
  AdminChatMessage,
  ModerationLogEntry,
  ModerationAction,
  EscalationRequest,
  ChatAnalytics,
  ChatAnalyticsSummary,
  MessageFilterOptions,
} from '../types/adminChat.js';

class AdminChatService {
  /**
   * Get all chat rooms with metrics
   */
  async getAllChats(options?: {
    status?: 'active' | 'archived' | 'all';
    eventId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ rooms: AdminChatRoom[]; total: number }> {
    const { status = 'active', eventId, limit = 50, offset = 0 } = options || {};

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (status === 'active') {
      conditions.push(`cr.is_active = true AND cr.is_archived = false`);
    } else if (status === 'archived') {
      conditions.push(`cr.is_archived = true`);
    }

    if (eventId) {
      conditions.push(`cr.event_id = $${paramIndex++}`);
      params.push(eventId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countResult = await db.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM chat_rooms cr ${whereClause}`,
      params
    );
    const total = parseInt(countResult?.count || '0', 10);

    // Get rooms with metrics
    params.push(limit, offset);
    const rooms = await db.queryMany<AdminChatRoom>(
      `SELECT 
        cr.id,
        cr.event_id as "eventId",
        cr.room_type as "roomType",
        cr.name,
        cr.description,
        cr.is_active as "isActive",
        cr.is_archived as "isArchived",
        cr.created_at as "createdAt",
        cr.updated_at as "updatedAt",
        e.title as "eventTitle",
        e.event_date as "eventDate",
        e.status as "eventStatus",
        COALESCE(msg_count.count, 0)::int as "messageCount",
        COALESCE(member_count.count, 0)::int as "memberCount",
        last_msg.created_at as "lastActivityAt"
      FROM chat_rooms cr
      LEFT JOIN events e ON e.id = cr.event_id
      LEFT JOIN LATERAL (
        SELECT COUNT(*) as count FROM chat_messages WHERE room_id = cr.id AND is_deleted = false
      ) msg_count ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) as count FROM chat_room_members WHERE room_id = cr.id AND left_at IS NULL
      ) member_count ON true
      LEFT JOIN LATERAL (
        SELECT created_at FROM chat_messages WHERE room_id = cr.id ORDER BY created_at DESC LIMIT 1
      ) last_msg ON true
      ${whereClause}
      ORDER BY last_msg.created_at DESC NULLS LAST
      LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      params
    );

    return { rooms, total };
  }

  /**
   * Get chat details for specific event
   */
  async getChatByEventId(eventId: string): Promise<AdminChatRoom | null> {
    return db.queryOne<AdminChatRoom>(
      `SELECT 
        cr.id,
        cr.event_id as "eventId",
        cr.room_type as "roomType",
        cr.name,
        cr.description,
        cr.is_active as "isActive",
        cr.is_archived as "isArchived",
        cr.created_at as "createdAt",
        cr.updated_at as "updatedAt",
        e.title as "eventTitle",
        e.event_date as "eventDate",
        e.status as "eventStatus",
        COALESCE(msg_count.count, 0)::int as "messageCount",
        COALESCE(member_count.count, 0)::int as "memberCount",
        last_msg.created_at as "lastActivityAt"
      FROM chat_rooms cr
      LEFT JOIN events e ON e.id = cr.event_id
      LEFT JOIN LATERAL (
        SELECT COUNT(*) as count FROM chat_messages WHERE room_id = cr.id AND is_deleted = false
      ) msg_count ON true
      LEFT JOIN LATERAL (
        SELECT COUNT(*) as count FROM chat_room_members WHERE room_id = cr.id AND left_at IS NULL
      ) member_count ON true
      LEFT JOIN LATERAL (
        SELECT created_at FROM chat_messages WHERE room_id = cr.id ORDER BY created_at DESC LIMIT 1
      ) last_msg ON true
      WHERE cr.event_id = $1 AND cr.room_type = 'event'`,
      [eventId]
    );
  }

  /**
   * Get messages for a chat room with filters
   */
  async getMessages(
    eventId: string,
    filters: MessageFilterOptions
  ): Promise<{ messages: AdminChatMessage[]; total: number }> {
    const { senderId, messageType, fromDate, toDate, search, isDeleted, limit = 50, offset = 0 } = filters;

    // First get the room ID
    const room = await db.queryOne<{ id: string }>(
      `SELECT id FROM chat_rooms WHERE event_id = $1 AND room_type = 'event'`,
      [eventId]
    );

    if (!room) {
      return { messages: [], total: 0 };
    }

    const conditions: string[] = [`cm.room_id = $1`];
    const params: unknown[] = [room.id];
    let paramIndex = 2;

    if (senderId) {
      conditions.push(`cm.sender_id = $${paramIndex++}`);
      params.push(senderId);
    }

    if (messageType) {
      conditions.push(`cm.message_type = $${paramIndex++}`);
      params.push(messageType);
    }

    if (fromDate) {
      conditions.push(`cm.created_at >= $${paramIndex++}`);
      params.push(fromDate);
    }

    if (toDate) {
      conditions.push(`cm.created_at <= $${paramIndex++}`);
      params.push(toDate);
    }

    if (search) {
      conditions.push(`cm.content ILIKE $${paramIndex++}`);
      params.push(`%${search}%`);
    }

    if (isDeleted !== undefined) {
      conditions.push(`cm.is_deleted = $${paramIndex++}`);
      params.push(isDeleted);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // Get total count
    const countResult = await db.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM chat_messages cm ${whereClause}`,
      params
    );
    const total = parseInt(countResult?.count || '0', 10);

    // Get messages with sender info
    params.push(limit, offset);
    const messages = await db.queryMany<AdminChatMessage>(
      `SELECT 
        cm.id,
        cm.room_id as "roomId",
        cm.sender_id as "senderId",
        cm.message_type as "messageType",
        cm.content,
        cm.attachment_key as "attachmentKey",
        cm.attachment_name as "attachmentName",
        cm.attachment_type as "attachmentType",
        cm.attachment_size as "attachmentSize",
        cm.reply_to_id as "replyToId",
        cm.is_edited as "isEdited",
        cm.edited_at as "editedAt",
        cm.is_deleted as "isDeleted",
        cm.deleted_at as "deletedAt",
        cm.metadata,
        cm.created_at as "createdAt",
        a.first_name as "senderFirstName",
        a.last_name as "senderLastName",
        a.email as "senderEmail"
      FROM chat_messages cm
      LEFT JOIN ambassadors a ON a.id::text = cm.sender_id::text
      ${whereClause}
      ORDER BY cm.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      params
    );

    return { messages, total };
  }

  /**
   * Edit a message (admin moderation)
   */
  async editMessage(
    eventId: string,
    messageId: string,
    newContent: string,
    adminId: string,
    reason?: string
  ): Promise<AdminChatMessage | null> {
    // Get original message
    const original = await db.queryOne<{ content: string; room_id: string }>(
      `SELECT cm.content, cm.room_id 
       FROM chat_messages cm
       JOIN chat_rooms cr ON cr.id = cm.room_id
       WHERE cm.id = $1 AND cr.event_id = $2`,
      [messageId, eventId]
    );

    if (!original) {
      return null;
    }

    // Update message
    const updated = await db.queryOne<AdminChatMessage>(
      `UPDATE chat_messages
       SET content = $1, 
           is_edited = true, 
           edited_at = NOW(),
           metadata = COALESCE(metadata, '{}'::jsonb) || 
             jsonb_build_object('moderated_by', $2, 'moderation_reason', $3)
       WHERE id = $4
       RETURNING 
        id,
        room_id as "roomId",
        sender_id as "senderId",
        message_type as "messageType",
        content,
        is_edited as "isEdited",
        edited_at as "editedAt",
        is_deleted as "isDeleted",
        created_at as "createdAt"`,
      [newContent, adminId, reason, messageId]
    );

    // Log moderation action
    await this.logModerationAction({
      messageId,
      roomId: original.room_id,
      action: 'edit',
      adminId,
      reason: reason || null,
      originalContent: original.content,
      newContent,
    });

    logger.info(
      { messageId, adminId, action: 'edit' },
      'Admin moderated chat message'
    );

    return updated;
  }

  /**
   * Delete a message (admin moderation)
   */
  async deleteMessage(
    eventId: string,
    messageId: string,
    adminId: string,
    reason?: string
  ): Promise<boolean> {
    // Get original message
    const original = await db.queryOne<{ content: string; room_id: string }>(
      `SELECT cm.content, cm.room_id 
       FROM chat_messages cm
       JOIN chat_rooms cr ON cr.id = cm.room_id
       WHERE cm.id = $1 AND cr.event_id = $2`,
      [messageId, eventId]
    );

    if (!original) {
      return false;
    }

    // Soft delete message
    const result = await db.query(
      `UPDATE chat_messages
       SET is_deleted = true, 
           deleted_at = NOW(),
           metadata = COALESCE(metadata, '{}'::jsonb) || 
             jsonb_build_object('deleted_by', $1, 'deletion_reason', $2)
       WHERE id = $3`,
      [adminId, reason, messageId]
    );

    // Log moderation action
    await this.logModerationAction({
      messageId,
      roomId: original.room_id,
      action: 'delete',
      adminId,
      reason: reason || null,
      originalContent: original.content,
      newContent: null,
    });

    logger.info(
      { messageId, adminId, action: 'delete' },
      'Admin deleted chat message'
    );

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Send admin intervention message
   */
  async sendIntervention(
    eventId: string,
    adminId: string,
    content: string,
    interventionType: 'message' | 'warning' | 'announcement' = 'message'
  ): Promise<AdminChatMessage | null> {
    // Get or create room
    let room = await db.queryOne<{ id: string }>(
      `SELECT id FROM chat_rooms WHERE event_id = $1 AND room_type = 'event'`,
      [eventId]
    );

    if (!room) {
      // Create room if doesn't exist
      room = await db.queryOne<{ id: string }>(
        `INSERT INTO chat_rooms (event_id, room_type, name)
         SELECT $1, 'event', title FROM events WHERE id = $1
         RETURNING id`,
        [eventId]
      );

      if (!room) {
        return null;
      }
    }

    // Create system message
    const message = await db.queryOne<AdminChatMessage>(
      `INSERT INTO chat_messages (
        room_id, 
        sender_id, 
        message_type, 
        content, 
        metadata
      ) VALUES ($1, $2, 'system', $3, $4)
      RETURNING 
        id,
        room_id as "roomId",
        sender_id as "senderId",
        message_type as "messageType",
        content,
        created_at as "createdAt"`,
      [
        room.id,
        adminId,
        content,
        JSON.stringify({ interventionType, isAdminIntervention: true }),
      ]
    );

    logger.info(
      { eventId, adminId, interventionType },
      'Admin sent intervention message'
    );

    return message;
  }

  /**
   * Create escalation
   */
  async createEscalation(
    eventId: string,
    reporterId: string,
    reason: string,
    options?: {
      messageId?: string;
      priority?: 'low' | 'medium' | 'high' | 'urgent';
    }
  ): Promise<EscalationRequest | null> {
    const room = await db.queryOne<{ id: string }>(
      `SELECT id FROM chat_rooms WHERE event_id = $1 AND room_type = 'event'`,
      [eventId]
    );

    if (!room) {
      return null;
    }

    const escalation = await db.queryOne<EscalationRequest>(
      `INSERT INTO chat_escalations (
        room_id, 
        event_id, 
        reporter_id, 
        message_id, 
        reason, 
        priority
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING 
        id,
        room_id as "roomId",
        event_id as "eventId",
        reporter_id as "reporterId",
        message_id as "messageId",
        reason,
        priority,
        status,
        created_at as "createdAt"`,
      [
        room.id,
        eventId,
        reporterId,
        options?.messageId || null,
        reason,
        options?.priority || 'medium',
      ]
    );

    logger.info(
      { eventId, reporterId, priority: options?.priority || 'medium' },
      'Chat escalation created'
    );

    return escalation;
  }

  /**
   * Suspend chat room
   */
  async suspendChat(
    eventId: string,
    adminId: string,
    reason?: string
  ): Promise<boolean> {
    const result = await db.query(
      `UPDATE chat_rooms
       SET is_active = false,
           updated_at = NOW()
       WHERE event_id = $1 AND room_type = 'event'`,
      [eventId]
    );

    if ((result.rowCount ?? 0) > 0) {
      // Log the suspension
      await db.query(
        `INSERT INTO chat_room_events (room_id, event_type, admin_id, reason)
         SELECT id, 'suspended', $2, $3 
         FROM chat_rooms WHERE event_id = $1 AND room_type = 'event'`,
        [eventId, adminId, reason]
      ).catch(() => {
        // Table may not exist yet, log and continue
        logger.debug('chat_room_events table not found, skipping event log');
      });

      logger.info({ eventId, adminId, reason }, 'Chat room suspended');
    }

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Resume suspended chat
   */
  async resumeChat(eventId: string, adminId: string): Promise<boolean> {
    const result = await db.query(
      `UPDATE chat_rooms
       SET is_active = true,
           updated_at = NOW()
       WHERE event_id = $1 AND room_type = 'event'`,
      [eventId]
    );

    if ((result.rowCount ?? 0) > 0) {
      logger.info({ eventId, adminId }, 'Chat room resumed');
    }

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Get analytics for specific chat
   */
  async getChatAnalytics(eventId: string): Promise<ChatAnalytics | null> {
    const room = await db.queryOne<{ id: string }>(
      `SELECT id FROM chat_rooms WHERE event_id = $1 AND room_type = 'event'`,
      [eventId]
    );

    if (!room) {
      return null;
    }

    const stats = await db.queryOne<{
      totalMessages: string;
      uniqueParticipants: string;
      messagesLast24h: string;
      messagesLast7d: string;
    }>(
      `SELECT 
        COUNT(*) FILTER (WHERE is_deleted = false) as "totalMessages",
        COUNT(DISTINCT sender_id) as "uniqueParticipants",
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours' AND is_deleted = false) as "messagesLast24h",
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days' AND is_deleted = false) as "messagesLast7d"
      FROM chat_messages
      WHERE room_id = $1`,
      [room.id]
    );

    const topContributors = await db.queryMany<{
      userId: string;
      firstName: string | null;
      lastName: string | null;
      messageCount: string;
    }>(
      `SELECT 
        cm.sender_id as "userId",
        a.first_name as "firstName",
        a.last_name as "lastName",
        COUNT(*)::int as "messageCount"
      FROM chat_messages cm
      LEFT JOIN ambassadors a ON a.id::text = cm.sender_id::text
      WHERE cm.room_id = $1 AND cm.is_deleted = false
      GROUP BY cm.sender_id, a.first_name, a.last_name
      ORDER BY COUNT(*) DESC
      LIMIT 10`,
      [room.id]
    );

    const messageTypeBreakdown = await db.queryMany<{
      type: string;
      count: string;
    }>(
      `SELECT message_type as type, COUNT(*)::int as count
       FROM chat_messages
       WHERE room_id = $1 AND is_deleted = false
       GROUP BY message_type`,
      [room.id]
    );

    // Calculate average messages per day
    const firstMessage = await db.queryOne<{ created_at: Date }>(
      `SELECT created_at FROM chat_messages WHERE room_id = $1 ORDER BY created_at ASC LIMIT 1`,
      [room.id]
    );

    let avgMessagesPerDay = 0;
    if (firstMessage && stats) {
      const daysSinceFirst = Math.max(
        1,
        Math.ceil((Date.now() - new Date(firstMessage.created_at).getTime()) / (1000 * 60 * 60 * 24))
      );
      avgMessagesPerDay = parseInt(stats.totalMessages, 10) / daysSinceFirst;
    }

    return {
      roomId: room.id,
      eventId,
      totalMessages: parseInt(stats?.totalMessages || '0', 10),
      uniqueParticipants: parseInt(stats?.uniqueParticipants || '0', 10),
      messagesLast24h: parseInt(stats?.messagesLast24h || '0', 10),
      messagesLast7d: parseInt(stats?.messagesLast7d || '0', 10),
      avgMessagesPerDay: Math.round(avgMessagesPerDay * 100) / 100,
      peakHour: null, // TODO: Calculate peak hour
      topContributors: topContributors.map((c) => ({
        ...c,
        messageCount: parseInt(String(c.messageCount), 10),
      })),
      messageTypeBreakdown: messageTypeBreakdown.map((b) => ({
        ...b,
        count: parseInt(String(b.count), 10),
      })),
      flaggedMessageCount: 0, // TODO: Implement flagging
      moderationActionCount: 0, // TODO: Count from moderation log
    };
  }

  /**
   * Get aggregate analytics summary
   */
  async getAnalyticsSummary(): Promise<ChatAnalyticsSummary> {
    const stats = await db.queryOne<{
      totalActiveChats: string;
      totalMessages: string;
      totalParticipants: string;
      messagesLast24h: string;
    }>(
      `SELECT 
        (SELECT COUNT(*) FROM chat_rooms WHERE is_active = true AND is_archived = false)::int as "totalActiveChats",
        (SELECT COUNT(*) FROM chat_messages WHERE is_deleted = false)::int as "totalMessages",
        (SELECT COUNT(DISTINCT sender_id) FROM chat_messages)::int as "totalParticipants",
        (SELECT COUNT(*) FROM chat_messages WHERE created_at > NOW() - INTERVAL '24 hours' AND is_deleted = false)::int as "messagesLast24h"`
    );

    const topActiveChats = await db.queryMany<{
      roomId: string;
      eventId: string;
      eventTitle: string;
      messageCount: string;
      lastActivityAt: Date;
    }>(
      `SELECT 
        cr.id as "roomId",
        cr.event_id as "eventId",
        e.title as "eventTitle",
        COUNT(cm.id)::int as "messageCount",
        MAX(cm.created_at) as "lastActivityAt"
      FROM chat_rooms cr
      JOIN events e ON e.id = cr.event_id
      LEFT JOIN chat_messages cm ON cm.room_id = cr.id AND cm.is_deleted = false
      WHERE cr.is_active = true AND cr.is_archived = false
      GROUP BY cr.id, cr.event_id, e.title
      HAVING COUNT(cm.id) > 0
      ORDER BY MAX(cm.created_at) DESC NULLS LAST
      LIMIT 10`
    );

    return {
      totalActiveChats: parseInt(stats?.totalActiveChats || '0', 10),
      totalMessages: parseInt(stats?.totalMessages || '0', 10),
      totalParticipants: parseInt(stats?.totalParticipants || '0', 10),
      messagesLast24h: parseInt(stats?.messagesLast24h || '0', 10),
      pendingEscalations: 0, // TODO: Query escalations table
      moderationActionsToday: 0, // TODO: Query moderation log
      topActiveChats: topActiveChats.map((c) => ({
        ...c,
        messageCount: parseInt(String(c.messageCount), 10),
      })),
    };
  }

  /**
   * Get moderation log for a chat
   */
  async getModerationLog(
    eventId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<ModerationLogEntry[]> {
    const { limit = 50, offset = 0 } = options || {};

    return db.queryMany<ModerationLogEntry>(
      `SELECT 
        ml.id,
        ml.message_id as "messageId",
        ml.room_id as "roomId",
        ml.action,
        ml.admin_id as "adminId",
        ml.reason,
        ml.original_content as "originalContent",
        ml.new_content as "newContent",
        ml.created_at as "createdAt",
        a.first_name as "adminFirstName",
        a.last_name as "adminLastName"
      FROM chat_moderation_log ml
      JOIN chat_rooms cr ON cr.id = ml.room_id
      LEFT JOIN ambassadors a ON a.id::text = ml.admin_id::text
      WHERE cr.event_id = $1
      ORDER BY ml.created_at DESC
      LIMIT $2 OFFSET $3`,
      [eventId, limit, offset]
    ).catch(() => {
      // Table may not exist yet
      logger.debug('chat_moderation_log table not found');
      return [];
    });
  }

  /**
   * Log a moderation action
   */
  private async logModerationAction(entry: {
    messageId: string;
    roomId: string;
    action: ModerationAction;
    adminId: string;
    reason: string | null;
    originalContent: string | null;
    newContent: string | null;
  }): Promise<void> {
    await db.query(
      `INSERT INTO chat_moderation_log (
        message_id, room_id, action, admin_id, reason, original_content, new_content
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        entry.messageId,
        entry.roomId,
        entry.action,
        entry.adminId,
        entry.reason,
        entry.originalContent,
        entry.newContent,
      ]
    ).catch((err) => {
      // Table may not exist yet, log and continue
      logger.warn({ error: err.message }, 'Failed to log moderation action - table may not exist');
    });
  }
}

export const adminChatService = new AdminChatService();
