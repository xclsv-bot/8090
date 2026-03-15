import { Client } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { SecretKey } from '../../config/secrets.js';
import type { SecretProvider } from '../../services/secretsService.js';
import { checkDatabaseHealth } from '../../db/connection-pool.js';

class ProviderWithSeed implements SecretProvider {
  private readonly map = new Map<SecretKey, string>();

  constructor(seed: Array<[SecretKey, string]> = []) {
    for (const [key, value] of seed) {
      this.map.set(key, value);
    }
  }

  getSecret = vi.fn(async (key: SecretKey) => this.map.get(key) ?? null);
  setSecret = vi.fn(async (key: SecretKey, value: string) => {
    this.map.set(key, value);
  });
  listSecretKeys = vi.fn(async () => [...this.map.keys()]);
}

async function canConnect(databaseUrl: string): Promise<boolean> {
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 1_000,
  });

  try {
    await client.connect();
    await client.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

describe('Phase 21: Infrastructure integration flows', () => {
  it('validates startup dependency flow (env -> secrets -> database)', async () => {
    vi.resetModules();
    const callOrder: string[] = [];

    const validateSecretsMock = vi.fn(() => {
      callOrder.push('secrets');
      return { valid: true, provider: 'render', missing: [] };
    });
    const verifyDatabaseConnectionMock = vi.fn(async () => {
      callOrder.push('database');
    });

    vi.doMock('../../config/secrets.js', async () => {
      const actual = await vi.importActual<typeof import('../../config/secrets.js')>('../../config/secrets.js');
      return {
        ...actual,
        validateSecrets: validateSecretsMock,
      };
    });
    vi.doMock('../../db/connection-pool.js', () => ({
      verifyDatabaseConnection: verifyDatabaseConnectionMock,
      shutdownPool: vi.fn(),
      connectionPool: {},
    }));
    vi.doMock('../../utils/logger.js', () => ({
      logger: { info: vi.fn() },
    }));

    const { validateCriticalSecrets } = await import('../../config/env.js');
    const { connectDatabase, closeDatabase } = await import('../../config/database.js');

    validateCriticalSecrets();
    await connectDatabase();
    await closeDatabase();

    expect(validateSecretsMock).toHaveBeenCalledTimes(1);
    expect(verifyDatabaseConnectionMock).toHaveBeenCalledTimes(1);
    expect(callOrder).toContain('database');
    expect(callOrder).toEqual(['secrets', 'database']);
  });

  it('checks health with a real database connection when one is reachable', async () => {
    const databaseUrl = process.env.PHASE21_TEST_DATABASE_URL || process.env.DATABASE_URL || '';

    if (!databaseUrl || !(await canConnect(databaseUrl))) {
      const healthy = await checkDatabaseHealth(50);
      expect(healthy).toBe(false);
      return;
    }

    const healthy = await checkDatabaseHealth(1_500);
    expect(healthy).toBe(true);
  });

  it('integrates SecretsService with database-backed audit logging', async () => {
    vi.resetModules();
    const auditWrites: unknown[] = [];

    vi.doMock('../../services/database.js', () => ({
      db: {
        query: vi.fn(async (_sql: string, params: unknown[]) => {
          auditWrites.push(params);
          return { rowCount: 1, rows: [] };
        }),
      },
    }));
    vi.doMock('../../utils/logger.js', () => ({
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
      },
    }));
    vi.doMock('../../config/env.js', () => ({
      env: {
        SECRET_PROVIDER: 'local',
        SECRETS_CACHE_TTL_MS: 60_000,
      },
    }));

    const { SecretsService: Service } = await import('../../services/secretsService.js');
    const provider = new ProviderWithSeed([[SecretKey.DATABASE_URL, 'postgres://seed']]);
    const service = new Service({ provider, cacheTtlMs: 60_000 });

    await service.getSecret(SecretKey.DATABASE_URL, {
      accessor: 'svc:integration',
      ip: '192.168.1.10',
    });

    expect(auditWrites.length).toBe(1);
    expect(auditWrites[0]).toEqual([
      SecretKey.DATABASE_URL,
      'get',
      'svc:integration',
      '192.168.1.10',
    ]);
  });

  it('executes end-to-end secret retrieval -> audit log -> database insert flow', async () => {
    vi.resetModules();
    const insertedRows: Array<{ operation: string; secretKey: string }> = [];

    vi.doMock('../../services/database.js', () => ({
      db: {
        query: vi.fn(async (_sql: string, params: unknown[]) => {
          insertedRows.push({
            secretKey: String(params[0]),
            operation: String(params[1]),
          });
          return { rowCount: 1, rows: [] };
        }),
      },
    }));
    vi.doMock('../../utils/logger.js', () => ({
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
      },
    }));
    vi.doMock('../../config/env.js', () => ({
      env: {
        SECRET_PROVIDER: 'local',
        SECRETS_CACHE_TTL_MS: 60_000,
      },
    }));

    const { SecretsService: Service } = await import('../../services/secretsService.js');
    const provider = new ProviderWithSeed([[SecretKey.CLERK_SECRET_KEY, 'secret-v1']]);
    const service = new Service({ provider, cacheTtlMs: 60_000 });

    const secretValue = await service.getSecret(SecretKey.CLERK_SECRET_KEY, {
      accessor: 'svc:e2e',
      ip: '203.0.113.10',
    });

    expect(secretValue).toBe('secret-v1');
    expect(insertedRows).toContainEqual({
      secretKey: SecretKey.CLERK_SECRET_KEY,
      operation: 'get',
    });
  });
});
