import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

const ROOT = process.cwd();
const DOCKERFILE_PATH = path.join(ROOT, 'Dockerfile');
const COMPOSE_PATH = path.join(ROOT, 'docker-compose.yml');

type RedisMode = 'healthy' | 'error' | 'timeout';

function commandExists(command: string): boolean {
  const result = spawnSync(command, ['--version'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return result.status === 0;
}

function dockerDaemonAvailable(): boolean {
  const result = spawnSync('docker', ['info'], {
    cwd: ROOT,
    stdio: 'ignore',
  });
  return result.status === 0;
}

async function buildHealthApp(options: {
  dbHealthy?: boolean;
  dbHangs?: boolean;
  redisMode?: RedisMode;
  redisUrl?: string;
} = {}): Promise<FastifyInstance> {
  const {
    dbHealthy = true,
    dbHangs = false,
    redisMode = 'healthy',
    redisUrl = 'redis://localhost:6379',
  } = options;

  vi.resetModules();

  vi.doMock('../../config/env.js', () => ({
    env: {
      NODE_ENV: 'development',
      REDIS_URL: redisUrl,
    },
  }));

  vi.doMock('../../db/connection-pool.js', () => ({
    checkDatabaseHealth: vi.fn(async () => {
      if (dbHangs) {
        await new Promise(() => undefined);
      }
      return dbHealthy;
    }),
    getPoolStats: vi.fn(() => ({
      max: 25,
      totalCount: 5,
      idleCount: 2,
      waitingCount: 0,
      totalConnectionsCreated: 8,
      totalConnectionsRemoved: 3,
      totalPoolErrors: 1,
    })),
  }));

  vi.doMock('node:net', () => {
    class MockSocket extends EventEmitter {
      setNoDelay(): this {
        return this;
      }

      connect(_port: number, _host: string, onConnect?: () => void): this {
        setTimeout(() => {
          onConnect?.();
        }, 0);
        return this;
      }

      write(payload: string): boolean {
        if (redisMode === 'timeout') {
          return true;
        }

        if (redisMode === 'error') {
          if (payload.includes('PING')) {
            setTimeout(() => {
              this.emit('data', '-ERR fail\r\n');
            }, 0);
          }
          return true;
        }

        if (payload.includes('AUTH')) {
          setTimeout(() => {
            this.emit('data', '+OK\r\n');
          }, 0);
          return true;
        }

        if (payload.includes('PING')) {
          setTimeout(() => {
            this.emit('data', '+PONG\r\n');
          }, 0);
        }

        return true;
      }

      destroy(): this {
        return this;
      }
    }

    return { Socket: MockSocket };
  });

  const { healthRoutes } = await import('../../routes/health.js');
  const app = Fastify();
  await healthRoutes(app);
  return app;
}

describe('Phase 21: Backend deployment infrastructure', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it('validates Dockerfile includes production-ready build stages', () => {
    const dockerfile = fs.readFileSync(DOCKERFILE_PATH, 'utf8');

    expect(dockerfile).toContain('FROM node:20-alpine AS base');
    expect(dockerfile).toContain('FROM deps AS build');
    expect(dockerfile).toContain('FROM node:20-alpine AS runtime');
    expect(dockerfile).toContain('CMD ["node", "dist/index.js"]');
  });

  it('builds Dockerfile successfully when Docker daemon is available', () => {
    if (!commandExists('docker') || !dockerDaemonAvailable()) {
      expect(fs.existsSync(DOCKERFILE_PATH)).toBe(true);
      return;
    }

    const build = spawnSync(
      'docker',
      ['build', '--target', 'runtime', '-f', 'Dockerfile', '.'],
      {
        cwd: ROOT,
        encoding: 'utf8',
        timeout: 180_000,
      }
    );

    expect(build.status).toBe(0);
  });

  it('validates docker-compose services and health dependencies', () => {
    const compose = fs.readFileSync(COMPOSE_PATH, 'utf8');

    expect(compose).toContain('services:');
    expect(compose).toContain('backend:');
    expect(compose).toContain('postgres:');
    expect(compose).toContain('redis:');
    expect(compose).toContain("condition: service_healthy");
    expect(compose).toContain('/health/live');
  });

  it('exposes /health, /health/ready, and /health/live endpoints', async () => {
    const app = await buildHealthApp({ dbHealthy: true, redisMode: 'healthy' });

    const health = await app.inject({ method: 'GET', url: '/health' });
    const ready = await app.inject({ method: 'GET', url: '/health/ready' });
    const live = await app.inject({ method: 'GET', url: '/health/live' });

    expect(health.statusCode).toBe(200);
    expect(ready.statusCode).toBe(200);
    expect(live.statusCode).toBe(200);

    await app.close();
  });

  it('handles health timeout behavior gracefully', async () => {
    const app = await buildHealthApp({ dbHangs: true, redisMode: 'healthy' });

    const response = await app.inject({ method: 'GET', url: '/health' });
    const payload = response.json();

    expect(response.statusCode).toBe(503);
    expect(payload.data.status).toBe('degraded');
    expect(payload.data.services.database.message).toContain('timeout');

    await app.close();
  });

  it('includes required health response fields and pool stats', async () => {
    const app = await buildHealthApp({ dbHealthy: true, redisMode: 'healthy' });

    const response = await app.inject({ method: 'GET', url: '/health' });
    const payload = response.json();

    expect(response.statusCode).toBe(200);
    expect(payload.data.version).toBeDefined();
    expect(payload.data.services).toBeDefined();
    expect(payload.data.services.database.status).toBe('up');
    expect(payload.data.services.redis.status).toBe('up');
    expect(payload.data.databasePool.max).toBeTypeOf('number');
    expect(payload.data.databasePool.totalConnectionsCreated).toBeTypeOf('number');
    expect(payload.data.databasePool.totalPoolErrors).toBeTypeOf('number');

    await app.close();
  });

  it('returns service unavailable for readiness when a dependency is down', async () => {
    const app = await buildHealthApp({ dbHealthy: false, redisMode: 'healthy' });
    const response = await app.inject({ method: 'GET', url: '/health/ready' });
    const payload = response.json();

    expect(response.statusCode).toBe(503);
    expect(payload.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(payload.error.details.database.status).toBe('down');

    await app.close();
  });

  it('supports backward-compatible /ready and /live aliases', async () => {
    const app = await buildHealthApp({ dbHealthy: true, redisMode: 'healthy' });

    const ready = await app.inject({ method: 'GET', url: '/ready' });
    const live = await app.inject({ method: 'GET', url: '/live' });

    expect(ready.statusCode).toBe(200);
    expect(ready.json().data.ready).toBe(true);
    expect(live.statusCode).toBe(200);
    expect(live.json().data.alive).toBe(true);

    await app.close();
  });

  it('supports redis health checks with authentication', async () => {
    const app = await buildHealthApp({
      dbHealthy: true,
      redisMode: 'healthy',
      redisUrl: 'redis://:supersecret@localhost:6379',
    });
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.services.redis.status).toBe('up');

    await app.close();
  });
});
