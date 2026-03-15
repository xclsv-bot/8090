import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock, queryManyMock, refreshProviderTokensMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  queryManyMock: vi.fn(),
  refreshProviderTokensMock: vi.fn(),
}));

vi.mock('../../config/env.js', () => ({
  env: {
    SECRET_PROVIDER: 'local',
    SECRETS_CACHE_TTL_MS: 60000,
  },
}));

vi.mock('../../services/database.js', () => ({
  db: {
    query: queryMock,
    queryMany: queryManyMock,
  },
}));

vi.mock('../../services/oauth/oauth.service.js', () => ({
  refreshProviderTokens: refreshProviderTokensMock,
}));

vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { SecretKey, validateSecrets } from '../../config/secrets.js';
import { secretsAuditService } from '../../services/secretsAuditService.js';
import { SecretsService } from '../../services/secretsService.js';
import { rotateApiKey, rotateOAuthTokens, runScheduledRotationCheck } from '../../utils/secretsRotation.js';

class MockProvider {
  private readonly store = new Map<SecretKey, string>();
  getSecret = vi.fn(async (key: SecretKey) => this.store.get(key) ?? null);
  setSecret = vi.fn(async (key: SecretKey, value: string) => {
    this.store.set(key, value);
  });
  listSecretKeys = vi.fn(async () => [...this.store.keys()]);
}

describe('SecretsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryMock.mockResolvedValue({ rows: [], rowCount: 1 });
    queryManyMock.mockResolvedValue([]);
    refreshProviderTokensMock.mockResolvedValue({});
  });

  it('retrieves secrets with cache and logs each access', async () => {
    const provider = new MockProvider();
    await provider.setSecret(SecretKey.DATABASE_URL, 'postgres://cached-secret');
    const audit = { logEvent: vi.fn().mockResolvedValue(undefined) };

    const service = new SecretsService({
      provider,
      providerType: 'local',
      cacheTtlMs: 60_000,
      auditService: audit,
    });

    const first = await service.getSecret(SecretKey.DATABASE_URL, { accessor: 'svc:test' });
    const second = await service.getSecret(SecretKey.DATABASE_URL, { accessor: 'svc:test' });

    expect(first).toBe('postgres://cached-secret');
    expect(second).toBe('postgres://cached-secret');
    expect(provider.getSecret).toHaveBeenCalledTimes(1);
    expect(audit.logEvent).toHaveBeenCalledTimes(2);
  });

  it('enforces admin-only mutation for setSecret', async () => {
    const provider = new MockProvider();
    const service = new SecretsService({ provider, providerType: 'local' });

    await expect(
      service.setSecret(SecretKey.ENCRYPTION_SECRET, 'new-secret', {
        accessor: 'user:reader',
        isAdmin: false,
      })
    ).rejects.toThrow('Admin privileges required');

    await service.setSecret(SecretKey.ENCRYPTION_SECRET, 'new-secret', {
      accessor: 'user:admin',
      isAdmin: true,
    });

    const stored = await provider.getSecret(SecretKey.ENCRYPTION_SECRET);
    expect(stored).toBe('new-secret');
  });

  it('writes audit rows through secretsAuditService', async () => {
    await secretsAuditService.logEvent({
      secretKey: SecretKey.DATABASE_URL,
      operation: 'get',
      accessor: 'svc:api',
      ip: '127.0.0.1',
    });

    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(queryMock.mock.calls[0]?.[0]).toContain('INSERT INTO secrets_audit_log');
  });

  it('validates required secrets with clear errors', () => {
    const ok = validateSecrets({
      provider: 'local',
      nodeEnv: 'development',
      source: { DATABASE_URL: 'postgres://localhost/test' },
      throwOnError: false,
    });

    expect(ok.valid).toBe(true);
    expect(ok.missing).toHaveLength(0);

    expect(() =>
      validateSecrets({
        provider: 'render',
        nodeEnv: 'development',
        source: {},
        throwOnError: true,
      })
    ).toThrow('Missing required secrets');
  });

  it('executes rotation utilities for API keys and OAuth tokens', async () => {
    const rotateSecret = vi.fn().mockResolvedValue('rotated-key');

    const rotated = await rotateApiKey(SecretKey.RAMP_CLIENT_SECRET, {
      service: { rotateSecret } as any,
      context: { accessor: 'svc:rotation', isAdmin: true },
    });

    expect(rotated).toBe('rotated-key');
    expect(rotateSecret).toHaveBeenCalledTimes(1);

    queryManyMock.mockResolvedValueOnce([
      { provider: 'quickbooks' },
      { provider: 'ramp' },
    ]);

    const refreshedCount = await rotateOAuthTokens();

    expect(refreshedCount).toBe(2);
    expect(refreshProviderTokensMock).toHaveBeenCalledTimes(2);
  });

  it('runs cron-compatible scheduled rotation checks', async () => {
    const markerKey = `${SecretKey.AWS_ACCESS_KEY_ID}_LAST_ROTATED_AT`;
    process.env[markerKey] = '2024-01-01T00:00:00.000Z';

    const rotateSecret = vi.fn().mockResolvedValue('rotated');
    queryManyMock.mockResolvedValueOnce([]);

    const result = await runScheduledRotationCheck({
      now: new Date('2026-03-15T00:00:00.000Z'),
      service: { rotateSecret } as any,
    });

    expect(result.rotatedApiKeys).toContain(SecretKey.AWS_ACCESS_KEY_ID);
    expect(result.refreshedOAuthIntegrations).toBe(0);

    delete process.env[markerKey];
  });
});
