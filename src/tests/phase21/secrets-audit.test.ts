import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SecretKey } from '../../config/secrets.js';
import { SecretsService, type SecretProvider } from '../../services/secretsService.js';

const ROOT = process.cwd();
const MIGRATION_PATH = path.join(ROOT, 'src/db/migrations/124_secrets_audit_log.sql');

class MemoryProvider implements SecretProvider {
  private readonly values = new Map<SecretKey, string>();
  getSecret = vi.fn(async (key: SecretKey) => this.values.get(key) ?? null);
  setSecret = vi.fn(async (key: SecretKey, value: string) => {
    this.values.set(key, value);
  });
  listSecretKeys = vi.fn(async () => [...this.values.keys()]);
}

describe('Phase 21: Secrets audit logging', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('records audit entries on getSecret, setSecret, and rotateSecret operations', async () => {
    const audit = { logEvent: vi.fn().mockResolvedValue(undefined) };
    const service = new SecretsService({
      provider: new MemoryProvider(),
      cacheTtlMs: 60_000,
      auditService: audit,
    });

    await service.setSecret(SecretKey.CUSTOMERIO_API_KEY, 'api-key-v1', {
      accessor: 'admin:ops',
      isAdmin: true,
      ip: '10.0.0.1',
    });
    await service.getSecret(SecretKey.CUSTOMERIO_API_KEY, {
      accessor: 'service:backend',
      ip: '10.0.0.2',
    });
    await service.rotateSecret(
      SecretKey.CUSTOMERIO_API_KEY,
      {
        accessor: 'admin:rotation',
        isAdmin: true,
        ip: '10.0.0.3',
      },
      () => 'api-key-v2'
    );

    expect(audit.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'set',
        accessor: 'admin:ops',
        ip: '10.0.0.1',
      })
    );
    expect(audit.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'get',
        accessor: 'service:backend',
        ip: '10.0.0.2',
      })
    );
    expect(audit.logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'rotate',
        accessor: 'admin:rotation',
        ip: '10.0.0.3',
      })
    );
    expect(audit.logEvent).toHaveBeenCalledTimes(3);
  });

  it('persists audit records through SecretsAuditService with accessor and IP fields', async () => {
    vi.resetModules();
    const queryMock = vi.fn().mockResolvedValue({ rowCount: 1, rows: [] });

    vi.doMock('../../services/database.js', () => ({
      db: { query: queryMock },
    }));
    vi.doMock('../../utils/logger.js', () => ({
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
      },
    }));

    const { secretsAuditService } = await import('../../services/secretsAuditService.js');

    await secretsAuditService.logEvent({
      secretKey: SecretKey.DATABASE_URL,
      operation: 'get',
      accessor: 'svc:api',
      ip: '172.16.1.4',
    });

    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO secrets_audit_log'),
      [SecretKey.DATABASE_URL, 'get', 'svc:api', '172.16.1.4']
    );
  });

  it('defines the expected secrets_audit_log table structure in migrations', () => {
    const migration = fs.readFileSync(MIGRATION_PATH, 'utf8');

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS secrets_audit_log');
    expect(migration).toMatch(/secret_key\s+VARCHAR/);
    expect(migration).toMatch(/operation\s+VARCHAR/);
    expect(migration).toMatch(/accessor\s+VARCHAR/);
    expect(migration).toMatch(/ip\s+INET/);
    expect(migration).toMatch(/timestamp\s+TIMESTAMPTZ/);
  });
});
