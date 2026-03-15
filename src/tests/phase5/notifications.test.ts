import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = vi.hoisted(() => ({
  query: vi.fn(),
  queryOne: vi.fn(),
}));

vi.mock('../../services/database.js', () => ({ db: dbMock }));
vi.mock('../../utils/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

describe('Phase 5: Notification service (email/SMS workflow)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends event scheduled email notification and marks as sent', async () => {
    dbMock.queryOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'event-1',
        title: 'Spring Event',
        venue: 'Main Arena',
        city: 'New York',
        state: 'NY',
        eventDate: new Date('2026-03-20'),
        startTime: '10:00 AM',
        endTime: '2:00 PM',
        notes: 'Arrive 30 minutes early',
      })
      .mockResolvedValueOnce({
        id: 'amb-1',
        firstName: 'Jordan',
        lastName: 'Lee',
        email: 'jordan@example.com',
      })
      .mockResolvedValueOnce({
        id: 'notif-1',
        eventId: 'event-1',
        ambassadorId: 'amb-1',
        notificationType: 'event_scheduled',
        channel: 'email',
        recipientEmail: 'jordan@example.com',
        subject: 'subject',
        body: 'body',
        status: 'pending',
        attempts: 0,
        maxAttempts: 3,
        createdAt: new Date('2026-03-15'),
      })
      .mockResolvedValueOnce({
        id: 'notif-1',
        eventId: 'event-1',
        ambassadorId: 'amb-1',
        recipientEmail: 'jordan@example.com',
        subject: 'subject',
        body: 'body',
        status: 'pending',
        attempts: 0,
        maxAttempts: 3,
        createdAt: new Date('2026-03-15'),
      });

    dbMock.query.mockResolvedValue({ rows: [], rowCount: 1 });

    const { notificationService } = await import('../../services/notificationService.js');
    const result = await notificationService.sendEventScheduledNotification('event-1', 'amb-1');

    expect(result.success).toBe(true);
    expect(result.notificationId).toBe('notif-1');
    expect(dbMock.query).toHaveBeenCalledTimes(2);
  });

  it('schedules retry when send attempt fails before max attempts', async () => {
    dbMock.queryOne.mockResolvedValueOnce({
      id: 'notif-2',
      recipientEmail: '',
      subject: 'Missing recipient',
      body: 'test',
      status: 'pending',
      attempts: 1,
      maxAttempts: 3,
      createdAt: new Date('2026-03-15'),
    });
    dbMock.query.mockResolvedValue({ rows: [], rowCount: 1 });

    const { notificationService } = await import('../../services/notificationService.js');
    vi.spyOn(notificationService as any, 'sendEmail').mockRejectedValue(new Error('SMTP unavailable'));
    const result = await notificationService.attemptSend('notif-2');

    expect(result.success).toBe(false);
    expect(result.error).toContain('SMTP unavailable');
    expect(dbMock.query).toHaveBeenCalledTimes(2);
    expect((dbMock.query.mock.calls[1]?.[0] as string)).toContain("status = $1");
  });

  it('processes due retry queue in batches', async () => {
    dbMock.query.mockResolvedValueOnce({ rows: [{ id: 'n1' }, { id: 'n2' }], rowCount: 2 });
    dbMock.queryOne
      .mockResolvedValueOnce({ id: 'n1', recipientEmail: '', subject: 'x', body: 'x', status: 'retrying', attempts: 1, maxAttempts: 3, createdAt: new Date() })
      .mockResolvedValueOnce({ id: 'n2', recipientEmail: '', subject: 'x', body: 'x', status: 'retrying', attempts: 1, maxAttempts: 3, createdAt: new Date() });
    dbMock.query.mockResolvedValue({ rows: [], rowCount: 1 });

    const { notificationService } = await import('../../services/notificationService.js');
    const processed = await notificationService.processRetries();

    expect(processed).toBe(2);
    expect(dbMock.query).toHaveBeenCalled();
  });
});
