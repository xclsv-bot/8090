import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocket } from 'ws';

const dbHealthMock = vi.fn().mockResolvedValue(true);
const storageHealthMock = vi.fn().mockResolvedValue(true);
const dbQueryMock = vi.fn().mockResolvedValue({});

vi.mock('../../services/database.js', () => ({
  db: {
    healthCheck: dbHealthMock,
    query: dbQueryMock,
    queryMany: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../../services/storage.js', () => ({
  storage: {
    healthCheck: storageHealthMock,
  },
}));

function socket() {
  return {
    readyState: WebSocket.OPEN,
    send: vi.fn(),
    close: vi.fn(),
  } as unknown as WebSocket;
}

describe('Phase 1: Acceptance criteria validation (WO-19, WO-20, WO-21)', () => {
  it('validates WO-19 core infrastructure health check endpoints', async () => {
    const Fastify = (await import('fastify')).default;
    const { healthRoutes } = await import('../../routes/health.js');

    const app = Fastify({ logger: false });
    await app.register(healthRoutes);

    const [health, detailed, ready, live] = await Promise.all([
      app.inject({ method: 'GET', url: '/health' }),
      app.inject({ method: 'GET', url: '/health/detailed' }),
      app.inject({ method: 'GET', url: '/ready' }),
      app.inject({ method: 'GET', url: '/live' }),
    ]);

    expect(health.statusCode).toBe(200);
    expect(detailed.statusCode).toBe(200);
    expect(ready.statusCode).toBe(200);
    expect(live.statusCode).toBe(200);

    await app.close();
  });

  it('validates WO-20 shared data model CRUD semantics in service SQL', () => {
    const eventService = fs.readFileSync(path.join(process.cwd(), 'src/services/eventService.ts'), 'utf-8').toLowerCase();
    const assignmentService = fs.readFileSync(path.join(process.cwd(), 'src/services/assignmentService.ts'), 'utf-8').toLowerCase();

    expect(eventService).toContain('insert into events');
    expect(eventService).toContain('select * from events where id = $1');
    expect(eventService).toContain('update events set');
    expect(eventService).toContain('delete from events');

    expect(assignmentService).toContain('insert into event_assignments');
    expect(assignmentService).toContain('update event_assignments');
    expect(assignmentService).toContain('select ea.*');
  });

  it('validates WO-21 websocket connection lifecycle and ping/pong flow', async () => {
    const { eventPublisher } = await import('../../services/eventPublisher.js');

    const ws = socket();
    const clientId = eventPublisher.registerClient(ws, 'admin-1', 'admin');

    eventPublisher.handlePing(clientId);
    expect((ws as any).send).toHaveBeenCalledWith(expect.stringContaining('"type":"pong"'));

    const before = eventPublisher.getStats();
    expect(before.totalClients).toBe(1);

    eventPublisher.unregisterClient(clientId);

    const after = eventPublisher.getStats();
    expect(after.totalClients).toBe(0);
  });

  it('builds an automated acceptance report with pass/fail status per work order', () => {
    const checks = {
      'WO-19': {
        healthRoutesExist: fs.existsSync(path.join(process.cwd(), 'src/routes/health.ts')),
        appBootstrapExists: fs.existsSync(path.join(process.cwd(), 'src/app.ts')),
      },
      'WO-20': {
        schemaExists: fs.existsSync(path.join(process.cwd(), 'src/db/schema.sql')),
        sharedModelsExist: fs.existsSync(path.join(process.cwd(), 'src/types/models.ts')),
      },
      'WO-21': {
        websocketRouteExists: fs.existsSync(path.join(process.cwd(), 'src/routes/websocket.ts')),
        eventPublisherExists: fs.existsSync(path.join(process.cwd(), 'src/services/eventPublisher.ts')),
        eventTypesExist: fs.existsSync(path.join(process.cwd(), 'src/types/events.ts')),
      },
    };

    const report = Object.entries(checks).map(([workOrder, criteria]) => {
      const pass = Object.values(criteria).every(Boolean);
      return { workOrder, pass, criteria };
    });

    expect(report.every((row) => row.pass)).toBe(true);
  });
});
