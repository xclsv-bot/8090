import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

const verifyTokenMock = vi.fn();

vi.mock('@clerk/backend', () => ({
  verifyToken: verifyTokenMock,
}));

async function connectBufferedClient(url: string): Promise<{
  ws: WebSocket;
  nextMessage: (timeoutMs?: number) => Promise<any>;
}> {
  const ws = new WebSocket(url);
  const queue: any[] = [];
  const waiters: Array<(message: any) => void> = [];

  ws.on('message', (msg) => {
    const parsed = JSON.parse(msg.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
      return;
    }
    queue.push(parsed);
  });

  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });

  return {
    ws,
    nextMessage(timeoutMs = 3000) {
      return new Promise((resolve, reject) => {
        if (queue.length > 0) {
          resolve(queue.shift());
          return;
        }

        const timer = setTimeout(() => reject(new Error('Timed out waiting for message')), timeoutMs);
        waiters.push((message) => {
          clearTimeout(timer);
          resolve(message);
        });
      });
    },
  };
}

describe('Phase 1: WebSocket gateway', () => {
  let app: ReturnType<typeof Fastify>;
  let baseUrl: string;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    app = Fastify({ logger: false });
    const { websocketRoutes } = await import('../../routes/websocket.js');
    await app.register(websocketRoutes);
    await app.listen({ port: 0, host: '127.0.0.1' });

    const addr = app.server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    baseUrl = `ws://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await app.close();
  });

  it('accepts valid tokens and rejects invalid tokens', async () => {
    verifyTokenMock.mockImplementation(async (token: string) => {
      if (token === 'valid-token') {
        return { sub: 'user-1', role: 'admin' };
      }
      throw new Error('bad token');
    });

    const validClient = await connectBufferedClient(`${baseUrl}/ws?token=valid-token`);
    const connected = await validClient.nextMessage();
    expect(connected.type).toBe('connected');
    validClient.ws.close();

    const invalidClient = await connectBufferedClient(`${baseUrl}/ws?token=invalid-token`);
    const errorMessage = await invalidClient.nextMessage();
    expect(errorMessage.type).toBe('error');
    expect(errorMessage.message).toContain('Invalid authentication token');
    invalidClient.ws.close();
  });

  it('handles subscriptions, multi-client broadcast, and role filtering', async () => {
    verifyTokenMock.mockImplementation(async (token: string) => {
      if (token === 'admin') return { sub: 'admin-1', role: 'admin' };
      if (token === 'ambassador') return { sub: 'amb-1', role: 'ambassador' };
      if (token === 'affiliate') return { sub: 'aff-1', role: 'affiliate' };
      throw new Error('invalid');
    });

    const { eventPublisher } = await import('../../services/eventPublisher.js');

    const admin = await connectBufferedClient(`${baseUrl}/ws?token=admin`);
    const ambassador = await connectBufferedClient(`${baseUrl}/ws?token=ambassador`);
    const affiliate = await connectBufferedClient(`${baseUrl}/ws?token=affiliate`);

    await admin.nextMessage();
    await ambassador.nextMessage();
    await affiliate.nextMessage();

    ambassador.ws.send(JSON.stringify({
      action: 'subscribe',
      payload: { eventTypes: ['event.updated'], eventIds: ['event-2'] },
    }));

    await eventPublisher.publish({
      type: 'event.updated',
      payload: { eventId: 'event-2', title: 'Event 2', status: 'confirmed' },
      userId: 'admin-1',
    } as any);

    const adminEvent = await admin.nextMessage();
    const ambassadorEvent = await ambassador.nextMessage();
    expect(adminEvent.type).toBe('event');
    expect(ambassadorEvent.type).toBe('event');

    await eventPublisher.publish({
      type: 'external_sync.completed',
      payload: { syncType: 'customerio', source: 'api', recordsProcessed: 10 },
      userId: 'admin-1',
    } as any);

    const affiliateEvent = await affiliate.nextMessage();
    expect(affiliateEvent.type).toBe('event');
    expect(affiliateEvent.data.type).toBe('external_sync.completed');

    admin.ws.close();
    ambassador.ws.close();
    affiliate.ws.close();
  });

  it('supports ping/pong and connection lifecycle cleanup', async () => {
    verifyTokenMock.mockResolvedValue({ sub: 'user-22', role: 'manager' });

    const { eventPublisher } = await import('../../services/eventPublisher.js');

    const ws = await connectBufferedClient(`${baseUrl}/ws?token=life-token`);
    const connected = await ws.nextMessage();
    expect(connected.type).toBe('connected');

    ws.ws.send(JSON.stringify({ action: 'ping' }));
    const pong = await ws.nextMessage();
    expect(pong.type).toBe('pong');

    const statsBefore = eventPublisher.getStats();
    expect(statsBefore.totalClients).toBeGreaterThanOrEqual(1);

    ws.ws.close();
    await new Promise((resolve) => setTimeout(resolve, 30));

    const statsAfter = eventPublisher.getStats();
    expect(statsAfter.totalClients).toBe(0);

    const reconnect = await connectBufferedClient(`${baseUrl}/ws?token=life-token`);
    const reconnectMsg = await reconnect.nextMessage();
    expect(reconnectMsg.type).toBe('connected');
    reconnect.ws.close();
  });
});
