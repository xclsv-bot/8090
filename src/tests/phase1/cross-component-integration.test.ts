import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

const verifyTokenMock = vi.fn();
const dbQueryMock = vi.fn().mockResolvedValue({});

vi.mock('@clerk/backend', () => ({
  verifyToken: verifyTokenMock,
}));

vi.mock('../../services/database.js', () => ({
  db: {
    query: dbQueryMock,
    queryMany: vi.fn().mockResolvedValue([]),
  },
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

describe('Phase 1: Cross-component integration', () => {
  let app: ReturnType<typeof Fastify>;
  let httpBase: string;
  let wsBase: string;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    const { websocketRoutes } = await import('../../routes/websocket.js');
    const { eventPublisher } = await import('../../services/eventPublisher.js');

    verifyTokenMock.mockImplementation(async (token: string) => {
      if (token === 'admin') return { sub: 'admin-1', role: 'admin' };
      if (token === 'amb') return { sub: 'amb-1', role: 'ambassador' };
      throw new Error('invalid token');
    });

    app = Fastify({ logger: false });
    await app.register(websocketRoutes);

    app.post('/api/test/events', async (_request, reply) => {
      await eventPublisher.publish({
        type: 'event.updated',
        userId: 'admin-1',
        payload: { eventId: 'event-int-1', title: 'Integration Event', status: 'active' },
      } as any);

      return reply.status(201).send({ success: true });
    });

    app.post('/api/test/assignments/check-in', async (_request, reply) => {
      await eventPublisher.publish({
        type: 'ambassador.checked_in',
        userId: 'admin-1',
        payload: { ambassadorId: 'amb-1', eventId: 'event-int-1', checkTime: new Date().toISOString() },
      } as any);

      return reply.status(201).send({ success: true });
    });

    await app.listen({ port: 0, host: '127.0.0.1' });
    const addr = app.server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    httpBase = `http://127.0.0.1:${port}`;
    wsBase = `ws://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await app.close();
  });

  it('validates API endpoint -> event publisher -> WebSocket client flow', async () => {
    const wsClient = await connectBufferedClient(`${wsBase}/ws?token=admin`);
    await wsClient.nextMessage();

    const response = await fetch(`${httpBase}/api/test/events`, { method: 'POST' });
    expect(response.status).toBe(201);

    const eventMessage = await wsClient.nextMessage();
    expect(eventMessage.type).toBe('event');
    expect(eventMessage.data.type).toBe('event.updated');

    wsClient.ws.close();
  });

  it('validates auth flow from Clerk token to WebSocket subscription filtering', async () => {
    const wsClient = await connectBufferedClient(`${wsBase}/ws?token=amb`);
    await wsClient.nextMessage();

    wsClient.ws.send(JSON.stringify({
      action: 'subscribe',
      payload: {
        eventTypes: ['ambassador.checked_in'],
        eventIds: ['event-int-1'],
      },
    }));

    const response = await fetch(`${httpBase}/api/test/assignments/check-in`, { method: 'POST' });
    expect(response.status).toBe(201);

    const eventMessage = await wsClient.nextMessage();
    expect(eventMessage.type).toBe('event');
    expect(eventMessage.data.type).toBe('ambassador.checked_in');

    wsClient.ws.close();
  });

  it('covers create-event then assign-ambassador end-to-end event stream', async () => {
    const wsClient = await connectBufferedClient(`${wsBase}/ws?token=admin`);
    await wsClient.nextMessage();

    await fetch(`${httpBase}/api/test/events`, { method: 'POST' });
    const createdEvent = await wsClient.nextMessage();

    await fetch(`${httpBase}/api/test/assignments/check-in`, { method: 'POST' });
    const assignmentEvent = await wsClient.nextMessage();

    expect(createdEvent.data.type).toBe('event.updated');
    expect(assignmentEvent.data.type).toBe('ambassador.checked_in');

    wsClient.ws.close();
  });
});
