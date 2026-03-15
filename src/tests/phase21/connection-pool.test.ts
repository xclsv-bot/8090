import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface MockPoolClient {
  release: ReturnType<typeof vi.fn>;
}

async function loadConnectionPoolModule(options: {
  envOverrides?: Record<string, unknown>;
  queryPlan?: Array<unknown>;
} = {}) {
  const { envOverrides = {}, queryPlan = [] } = options;
  vi.resetModules();

  const releaseMock = vi.fn();
  const queryMock = vi.fn(async () => {
    if (queryPlan.length > 0) {
      const next = queryPlan.shift();
      if (next instanceof Error) {
        throw next;
      }
      return next;
    }

    return { rows: [{ ok: true }], rowCount: 1 };
  });
  const endMock = vi.fn(async () => undefined);
  const connectMock = vi.fn(async () => ({ release: releaseMock } as MockPoolClient));

  class MockPool extends EventEmitter {
    public options: Record<string, unknown>;
    public totalCount = 0;
    public idleCount = 0;
    public waitingCount = 0;

    constructor(config: Record<string, unknown>) {
      super();
      this.options = config;
    }

    query = queryMock;
    connect = connectMock;
    end = endMock;
  }

  vi.doMock('../../config/env.js', () => ({
    env: {
      DATABASE_URL: 'postgresql://phase21:test@localhost:5432/phase21',
      NODE_ENV: 'development',
      DB_POOL_MAX: 30,
      DB_POOL_MIN: 4,
      DB_POOL_IDLE_TIMEOUT_MS: 45_000,
      DB_POOL_CONNECTION_TIMEOUT_MS: 9_000,
      DB_POOL_QUERY_TIMEOUT_MS: 8_000,
      DB_QUERY_RETRY_ATTEMPTS: 3,
      DB_QUERY_RETRY_BACKOFF_MS: 50,
      ...envOverrides,
    },
  }));

  vi.doMock('../../utils/logger.js', () => ({
    logger: {
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  }));

  vi.doMock('pg', () => ({
    Pool: MockPool,
  }));

  const module = await import('../../db/connection-pool.js');
  return {
    ...module,
    mocks: {
      queryMock,
      connectMock,
      endMock,
      releaseMock,
    },
  };
}

describe('Phase 21: Connection pool behavior', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('loads pool configuration from environment variables', async () => {
    const { connectionPool } = await loadConnectionPoolModule();

    expect(connectionPool.options.max).toBe(30);
    expect(connectionPool.options.min).toBe(4);
    expect(connectionPool.options.idleTimeoutMillis).toBe(45_000);
    expect(connectionPool.options.connectionTimeoutMillis).toBe(9_000);
    expect(connectionPool.options.statement_timeout).toBe(8_000);
  });

  it('retries transient query failures with incremental backoff', async () => {
    const retryableError = Object.assign(new Error('temporary outage'), { code: 'ETIMEDOUT' });
    const { queryWithRetry, mocks } = await loadConnectionPoolModule({
      queryPlan: [retryableError, retryableError, { rows: [{ id: 1 }], rowCount: 1 }],
      envOverrides: {
        DB_QUERY_RETRY_BACKOFF_MS: 100,
      },
    });

    const resultPromise = queryWithRetry('SELECT 1', []);
    await vi.advanceTimersByTimeAsync(100 + 200 + 5);
    const result = await resultPromise;

    expect(result.rowCount).toBe(1);
    expect(mocks.queryMock).toHaveBeenCalledTimes(3);
  });

  it('tracks pool event statistics', async () => {
    const { connectionPool, getPoolStats } = await loadConnectionPoolModule();
    connectionPool.totalCount = 6;
    connectionPool.idleCount = 3;
    connectionPool.waitingCount = 1;

    connectionPool.emit('connect');
    connectionPool.emit('connect');
    connectionPool.emit('remove');
    connectionPool.emit('error', new Error('pool error'));

    const stats = getPoolStats();
    expect(stats.totalCount).toBe(6);
    expect(stats.idleCount).toBe(3);
    expect(stats.waitingCount).toBe(1);
    expect(stats.totalConnectionsCreated).toBe(2);
    expect(stats.totalConnectionsRemoved).toBe(1);
    expect(stats.totalPoolErrors).toBe(1);
  });

  it('supports graceful shutdown via pool.end()', async () => {
    const { shutdownPool, mocks } = await loadConnectionPoolModule();

    await shutdownPool();
    expect(mocks.endMock).toHaveBeenCalledTimes(1);
  });

  it('verifies database connectivity using SELECT 1', async () => {
    const { verifyDatabaseConnection, mocks } = await loadConnectionPoolModule();
    await verifyDatabaseConnection();
    expect(mocks.queryMock).toHaveBeenCalledWith('SELECT 1', undefined);
  });

  it('reports health true on success and false on timeout/failure', async () => {
    const success = await loadConnectionPoolModule();
    await expect(success.checkDatabaseHealth(10)).resolves.toBe(true);

    const failure = await loadConnectionPoolModule({
      queryPlan: [Object.assign(new Error('network'), { code: '08006' })],
      envOverrides: { DB_QUERY_RETRY_ATTEMPTS: 1 },
    });
    await expect(failure.checkDatabaseHealth(10)).resolves.toBe(false);
  });

  it('applies statement timeout for query timeout protection', async () => {
    const { connectionPool } = await loadConnectionPoolModule({
      envOverrides: {
        DB_POOL_QUERY_TIMEOUT_MS: 1_234,
      },
    });

    expect(connectionPool.options.statement_timeout).toBe(1_234);
  });

  it('handles concurrent client usage and releases all clients', async () => {
    const { withPoolClient, mocks } = await loadConnectionPoolModule();

    await Promise.all([
      withPoolClient(async () => 'a'),
      withPoolClient(async () => 'b'),
      withPoolClient(async () => 'c'),
    ]);

    expect(mocks.connectMock).toHaveBeenCalledTimes(3);
    expect(mocks.releaseMock).toHaveBeenCalledTimes(3);
  });
});
