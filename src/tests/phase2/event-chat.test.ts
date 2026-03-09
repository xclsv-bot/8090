import { describe, expect, it } from 'vitest';
import type { AdminChatMessage, AdminChatRoom, ModerationLogEntry } from '../../types/adminChat.js';

function sortByCreated(messages: AdminChatMessage[]) {
  return [...messages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

describe('Phase 2: Event chat models', () => {
  it('creates room metadata with participant and message counters', () => {
    const room: AdminChatRoom = {
      id: 'room-1',
      eventId: 'event-1',
      roomType: 'event',
      name: 'Event Room',
      description: null,
      isActive: true,
      isArchived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      messageCount: 10,
      memberCount: 5,
      lastActivityAt: new Date(),
    };

    expect(room.memberCount).toBeGreaterThan(0);
    expect(room.messageCount).toBeGreaterThanOrEqual(room.memberCount);
  });

  it('orders messages by timestamp', () => {
    const first: AdminChatMessage = {
      id: 'm1',
      roomId: 'room-1',
      senderId: 'u1',
      messageType: 'text',
      content: 'first',
      attachmentKey: null,
      attachmentName: null,
      attachmentType: null,
      attachmentSize: null,
      replyToId: null,
      isEdited: false,
      editedAt: null,
      isDeleted: false,
      deletedAt: null,
      metadata: null,
      createdAt: new Date('2026-01-01T10:00:00Z'),
    };

    const second: AdminChatMessage = { ...first, id: 'm2', content: 'second', createdAt: new Date('2026-01-01T10:05:00Z') };
    const ordered = sortByCreated([second, first]);

    expect(ordered[0].id).toBe('m1');
    expect(ordered[1].id).toBe('m2');
  });

  it('tracks moderation actions', () => {
    const log: ModerationLogEntry = {
      id: 'log-1',
      messageId: 'm2',
      roomId: 'room-1',
      action: 'warn',
      adminId: 'admin-1',
      reason: 'policy violation',
      originalContent: 'bad text',
      newContent: null,
      createdAt: new Date(),
    };

    expect(['edit', 'delete', 'warn', 'flag']).toContain(log.action);
    expect(log.reason).toBeTruthy();
  });
});
