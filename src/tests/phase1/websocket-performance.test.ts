import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

const dbQueryMock = vi.fn().mockResolvedValue({});

vi.mock('../../services/database.js', () => ({
  db: {
    query: dbQueryMock,
    queryMany: vi.fn().mockResolvedValue([]),
  },
}));

function clientSocket() {
  return {
    readyState: WebSocket.OPEN,
    send: vi.fn(),
    close: vi.fn(),
  } as unknown as WebSocket;
}

describe('Phase 1: WebSocket performance baselines', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it('keeps publish latency under 100ms with 100+ connections', async () => {
    const { eventPublisher } = await import('../../services/eventPublisher.js');

    const clients: string[] = [];
    for (let i = 0; i < 120; i++) {
      const role = i % 2 === 0 ? 'manager' : 'ambassador';
      clients.push(eventPublisher.registerClient(clientSocket(), `user-${i}`, role as any));
    }

    const start = performance.now();
    await eventPublisher.publish({
      type: 'event.updated',
      payload: { eventId: 'event-100', title: 'Perf Event', status: 'active' },
      userId: 'admin-1',
    } as any);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
    expect(eventPublisher.getStats().totalClients).toBe(120);

    for (const clientId of clients) {
      eventPublisher.unregisterClient(clientId);
    }
  });

  it('keeps memory overhead bounded for connection management', async () => {
    const { eventPublisher } = await import('../../services/eventPublisher.js');

    const before = process.memoryUsage().heapUsed;

    const clients: string[] = [];
    for (let i = 0; i < 150; i++) {
      clients.push(eventPublisher.registerClient(clientSocket(), `mem-${i}`, 'manager'));
    }

    await eventPublisher.publish({
      type: 'event.updated',
      payload: { eventId: 'event-200', title: 'Mem Event', status: 'confirmed' },
      userId: 'admin-1',
    } as any);

    const after = process.memoryUsage().heapUsed;
    const deltaMb = (after - before) / (1024 * 1024);
    expect(deltaMb).toBeLessThan(30);

    for (const clientId of clients) {
      eventPublisher.unregisterClient(clientId);
    }
  });

  it('keeps heartbeat and event buffering overhead manageable', async () => {
    const { eventPublisher } = await import('../../services/eventPublisher.js');

    const clients: string[] = [];
    for (let i = 0; i < 20; i++) {
      clients.push(eventPublisher.registerClient(clientSocket(), `hb-${i}`, 'manager'));
    }

    const hbStart = performance.now();
    for (const clientId of clients) {
      eventPublisher.handlePing(clientId);
    }
    const hbElapsed = performance.now() - hbStart;
    expect(hbElapsed).toBeLessThan(50);

    const eventStart = performance.now();
    for (let i = 0; i < 1100; i++) {
      await eventPublisher.publish({
        type: 'event.updated',
        payload: { eventId: `event-${i}`, title: `Event ${i}`, status: 'active' },
        userId: 'admin-1',
      } as any);
    }
    const eventElapsed = performance.now() - eventStart;

    expect(eventElapsed).toBeLessThan(5000);

    for (const clientId of clients) {
      eventPublisher.unregisterClient(clientId);
    }
  });
});
