/**
 * Chat Service
 * WO-26: Event Chat API and sign-up integration
 */

import { db } from './database.js';
import { logger } from '../utils/logger.js';
import { eventPublisher } from './eventPublisher.js';

interface CreateMessageInput {
  roomId: string;
  senderId: string;
  content: string;
  messageType?: string;
  attachmentKey?: string;
  attachmentName?: string;
  attachmentType?: string;
  attachmentSize?: number;
  replyToId?: string;
}

interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  messageType: string;
  content: string;
  attachmentKey?: string;
  attachmentName?: string;
  replyToId?: string;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: Date;
}

interface ChatRoom {
  id: string;
  eventId?: string;
  roomType: string;
  name?: string;
  isActive: boolean;
  createdAt: Date;
}

class ChatService {
  /**
   * Get or create event chat room
   */
  async getOrCreateEventRoom(eventId: string): Promise<ChatRoom> {
    let room = await db.queryOne<ChatRoom>(
      "SELECT * FROM chat_rooms WHERE event_id = $1 AND room_type = 'event'",
      [eventId]
    );

    if (!room) {
      room = await db.queryOne<ChatRoom>(
        `INSERT INTO chat_rooms (event_id, room_type, name)
         SELECT $1, 'event', title FROM events WHERE id = $1
         RETURNING *`,
        [eventId]
      );
    }

    return room!;
  }

  /**
   * Send message
   */
  async sendMessage(input: CreateMessageInput): Promise<ChatMessage> {
    const result = await db.queryOne<ChatMessage>(
      `INSERT INTO chat_messages (
        room_id, sender_id, message_type, content,
        attachment_key, attachment_name, attachment_type, attachment_size,
        reply_to_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        input.roomId,
        input.senderId,
        input.messageType || 'text',
        input.content,
        input.attachmentKey,
        input.attachmentName,
        input.attachmentType,
        input.attachmentSize,
        input.replyToId,
      ]
    );

    // Broadcast to connected clients
    const room = await db.queryOne<{ event_id: string }>(
      'SELECT event_id FROM chat_rooms WHERE id = $1',
      [input.roomId]
    );

    if (room?.event_id) {
      await eventPublisher.publish({
        type: 'event.updated',
        payload: {
          eventId: room.event_id,
          title: 'New chat message',
          status: 'active',
        },
      } as any);
    }

    logger.info({ messageId: result?.id, roomId: input.roomId }, 'Chat message sent');
    return result!;
  }

  /**
   * Get messages for room
   */
  async getMessages(
    roomId: string, 
    limit = 50, 
    before?: string
  ): Promise<ChatMessage[]> {
    const beforeCondition = before ? 'AND id < $3' : '';
    const params = before ? [roomId, limit, before] : [roomId, limit];

    return db.queryMany<ChatMessage>(
      `SELECT * FROM chat_messages
       WHERE room_id = $1 AND is_deleted = false ${beforeCondition}
       ORDER BY created_at DESC
       LIMIT $2`,
      params
    );
  }

  /**
   * Edit message
   */
  async editMessage(messageId: string, content: string, userId: string): Promise<ChatMessage | null> {
    return db.queryOne<ChatMessage>(
      `UPDATE chat_messages
       SET content = $1, is_edited = true, edited_at = NOW()
       WHERE id = $2 AND sender_id = $3
       RETURNING *`,
      [content, messageId, userId]
    );
  }

  /**
   * Delete message (soft delete)
   */
  async deleteMessage(messageId: string, userId: string): Promise<boolean> {
    const result = await db.query(
      `UPDATE chat_messages
       SET is_deleted = true, deleted_at = NOW()
       WHERE id = $1 AND sender_id = $2`,
      [messageId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Add reaction
   */
  async addReaction(messageId: string, userId: string, reaction: string): Promise<void> {
    await db.query(
      `INSERT INTO chat_message_reactions (message_id, user_id, reaction)
       VALUES ($1, $2, $3)
       ON CONFLICT (message_id, user_id, reaction) DO NOTHING`,
      [messageId, userId, reaction]
    );
  }

  /**
   * Remove reaction
   */
  async removeReaction(messageId: string, userId: string, reaction: string): Promise<void> {
    await db.query(
      'DELETE FROM chat_message_reactions WHERE message_id = $1 AND user_id = $2 AND reaction = $3',
      [messageId, userId, reaction]
    );
  }

  /**
   * Mark messages as read
   */
  async markAsRead(roomId: string, userId: string, lastMessageId: string): Promise<void> {
    await db.query(
      `UPDATE chat_room_members
       SET last_read_at = NOW()
       WHERE room_id = $1 AND user_id = $2`,
      [roomId, userId]
    );

    // Add read receipt for last message
    await db.query(
      `INSERT INTO chat_read_receipts (message_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (message_id, user_id) DO NOTHING`,
      [lastMessageId, userId]
    );
  }

  /**
   * Pin message
   */
  async pinMessage(roomId: string, messageId: string, userId: string): Promise<void> {
    await db.query(
      `INSERT INTO chat_pinned_messages (room_id, message_id, pinned_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (room_id, message_id) DO NOTHING`,
      [roomId, messageId, userId]
    );
  }

  /**
   * Get pinned messages
   */
  async getPinnedMessages(roomId: string): Promise<ChatMessage[]> {
    return db.queryMany<ChatMessage>(
      `SELECT cm.* FROM chat_messages cm
       JOIN chat_pinned_messages cpm ON cpm.message_id = cm.id
       WHERE cpm.room_id = $1
       ORDER BY cpm.pinned_at DESC`,
      [roomId]
    );
  }

  /**
   * Join room
   */
  async joinRoom(roomId: string, userId: string): Promise<void> {
    await db.query(
      `INSERT INTO chat_room_members (room_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (room_id, user_id) DO UPDATE SET left_at = NULL`,
      [roomId, userId]
    );
  }

  /**
   * Leave room
   */
  async leaveRoom(roomId: string, userId: string): Promise<void> {
    await db.query(
      'UPDATE chat_room_members SET left_at = NOW() WHERE room_id = $1 AND user_id = $2',
      [roomId, userId]
    );
  }

  /**
   * Get rooms for user
   */
  async getUserRooms(userId: string): Promise<ChatRoom[]> {
    return db.queryMany<ChatRoom>(
      `SELECT cr.* FROM chat_rooms cr
       JOIN chat_room_members crm ON crm.room_id = cr.id
       WHERE crm.user_id = $1 AND crm.left_at IS NULL AND cr.is_active = true
       ORDER BY cr.updated_at DESC`,
      [userId]
    );
  }
}

export const chatService = new ChatService();
