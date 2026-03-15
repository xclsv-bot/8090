import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

const dbQueryMock = vi.fn().mockResolvedValue({});
const verifyTokenMock = vi.fn();

vi.mock('../../services/database.js', () => ({
  db: {
    query: dbQueryMock,
    queryMany: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@clerk/backend', () => ({
  verifyToken: verifyTokenMock,
}));

function createMockSocket() {
  return {
    readyState: WebSocket.OPEN,
    send: vi.fn(),
    close: vi.fn(),
  } as unknown as WebSocket;
}

describe('Phase 1: Core platform services', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it('publishes events to subscribed clients and updates stats', async () => {
    const { eventPublisher } = await import('../../services/eventPublisher.js');

    const adminSocket = createMockSocket();
    const ambassadorSocket = createMockSocket();

    const adminClient = eventPublisher.registerClient(adminSocket, 'admin-1', 'admin');
    const ambassadorClient = eventPublisher.registerClient(ambassadorSocket, 'amb-1', 'ambassador');

    eventPublisher.updateSubscription(ambassadorClient, {
      eventTypes: ['event.updated'],
      eventIds: ['event-1'],
    });

    await eventPublisher.publish({
      type: 'event.updated',
      userId: 'admin-1',
      payload: {
        eventId: 'event-1',
        title: 'Updated Event',
        status: 'active',
      },
    } as any);

    expect(adminSocket.send).toHaveBeenCalled();
    expect(ambassadorSocket.send).toHaveBeenCalled();

    const stats = eventPublisher.getStats();
    expect(stats.totalClients).toBe(2);
    expect(stats.byRole.admin).toBe(1);
    expect(stats.byRole.ambassador).toBe(1);

    eventPublisher.unregisterClient(adminClient);
    eventPublisher.unregisterClient(ambassadorClient);
  });

  it('handles ping/pong heartbeat and removes stale connections', async () => {
    const { eventPublisher } = await import('../../services/eventPublisher.js');

    const staleSocket = createMockSocket();
    const activeSocket = createMockSocket();

    const staleClient = eventPublisher.registerClient(staleSocket, 'stale', 'manager');
    const activeClient = eventPublisher.registerClient(activeSocket, 'active', 'manager');

    eventPublisher.handlePing(activeClient);
    expect(activeSocket.send).toHaveBeenCalledWith(expect.stringContaining('"type":"pong"'));

    const clients = (eventPublisher as any).clients as Map<string, { lastPing: Date }>;
    clients.get(staleClient)!.lastPing = new Date(Date.now() - 120000);

    eventPublisher.cleanupStaleConnections();

    expect(staleSocket.close).toHaveBeenCalled();
    expect(eventPublisher.getStats().totalClients).toBe(1);

    eventPublisher.unregisterClient(activeClient);
  });

  it('validates Clerk authentication flow in middleware', async () => {
    vi.doMock('../../config/env.js', () => ({
      env: {
        CLERK_SECRET_KEY: 'sk_test',
        LOG_LEVEL: 'info',
        NODE_ENV: 'development',
      },
    }));

    const { authenticate } = await import('../../middleware/auth.js');

    verifyTokenMock.mockResolvedValue({
      sub: 'user-1',
      email: 'user@example.com',
      role: 'manager',
    });

    const request = {
      headers: { authorization: 'Bearer test-token' },
      user: undefined,
    } as any;

    const reply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
    } as any;

    await authenticate(request, reply);

    expect(verifyTokenMock).toHaveBeenCalledWith('test-token', expect.any(Object));
    expect(request.user).toMatchObject({
      id: 'user-1',
      role: 'manager',
      email: 'user@example.com',
    });
    expect(reply.status).not.toHaveBeenCalled();
  });
});
