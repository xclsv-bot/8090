import { Pool, type PoolClient, type PoolConfig, type QueryResult, type QueryResultRow } from 'pg';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const DEFAULT_MAX_POOL_SIZE = 20;
const DEFAULT_IDLE_TIMEOUT_MS = 30_000;
const DEFAULT_CONNECTION_TIMEOUT_MS = 10_000;
const DEFAULT_QUERY_TIMEOUT_MS = 15_000;
const DEFAULT_RETRY_ATTEMPTS = 3;
const DEFAULT_RETRY_BACKOFF_MS = 200;

const poolConfig: PoolConfig = {
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX ?? DEFAULT_MAX_POOL_SIZE,
  min: env.DB_POOL_MIN,
  idleTimeoutMillis: env.DB_POOL_IDLE_TIMEOUT_MS ?? DEFAULT_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: env.DB_POOL_CONNECTION_TIMEOUT_MS ?? DEFAULT_CONNECTION_TIMEOUT_MS,
  statement_timeout: env.DB_POOL_QUERY_TIMEOUT_MS ?? DEFAULT_QUERY_TIMEOUT_MS,
  ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
};

export const connectionPool = new Pool(poolConfig);

let totalConnectionsCreated = 0;
let totalConnectionsRemoved = 0;
let totalPoolErrors = 0;

connectionPool.on('connect', () => {
  totalConnectionsCreated += 1;
});

connectionPool.on('remove', () => {
  totalConnectionsRemoved += 1;
});

connectionPool.on('error', (error) => {
  totalPoolErrors += 1;
  logger.error({ error }, 'Unexpected PostgreSQL pool error');
});

export interface PoolStats {
  max: number;
  totalCount: number;
  idleCount: number;
  waitingCount: number;
  totalConnectionsCreated: number;
  totalConnectionsRemoved: number;
  totalPoolErrors: number;
}

export function getPoolStats(): PoolStats {
  return {
    max: connectionPool.options.max ?? DEFAULT_MAX_POOL_SIZE,
    totalCount: connectionPool.totalCount,
    idleCount: connectionPool.idleCount,
    waitingCount: connectionPool.waitingCount,
    totalConnectionsCreated,
    totalConnectionsRemoved,
    totalPoolErrors,
  };
}

function getRetryableCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  const possibleCode = (error as { code?: unknown }).code;
  return typeof possibleCode === 'string' ? possibleCode : undefined;
}

function shouldRetry(error: unknown): boolean {
  const retryableCodes = new Set(['ECONNRESET', 'ETIMEDOUT', '57P01', '57P02', '08000', '08003', '08006']);
  const code = getRetryableCode(error);

  return code !== undefined && retryableCodes.has(code);
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function queryWithRetry<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
  attempts = env.DB_QUERY_RETRY_ATTEMPTS ?? DEFAULT_RETRY_ATTEMPTS
): Promise<QueryResult<T>> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await connectionPool.query<T>(text, params);
    } catch (error) {
      lastError = error;

      if (attempt >= attempts || !shouldRetry(error)) {
        break;
      }

      const backoffMs = (env.DB_QUERY_RETRY_BACKOFF_MS ?? DEFAULT_RETRY_BACKOFF_MS) * attempt;
      logger.warn(
        {
          attempt,
          attempts,
          backoffMs,
          code: getRetryableCode(error),
        },
        'Retrying database query after transient failure'
      );

      await wait(backoffMs);
    }
  }

  throw lastError;
}

export async function withPoolClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await connectionPool.connect();

  try {
    return await callback(client);
  } finally {
    client.release();
  }
}

export async function verifyDatabaseConnection(): Promise<void> {
  await queryWithRetry('SELECT 1');
}

export async function checkDatabaseHealth(timeoutMs = 3_000): Promise<boolean> {
  try {
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error('Database health check timed out')), timeoutMs);
    });

    await Promise.race([queryWithRetry('SELECT 1'), timeoutPromise]);
    return true;
  } catch {
    return false;
  }
}

export async function shutdownPool(): Promise<void> {
  await connectionPool.end();
}
