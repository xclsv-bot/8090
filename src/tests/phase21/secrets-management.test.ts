import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SecretKey, validateSecrets } from '../../config/secrets.js';
import { SecretsService, type SecretProvider } from '../../services/secretsService.js';

class InMemoryProvider implements SecretProvider {
  private readonly store = new Map<SecretKey, string>();
  public readonly getSecret = vi.fn(async (key: SecretKey) => this.store.get(key) ?? null);
  public readonly setSecret = vi.fn(async (key: SecretKey, value: string) => {
    this.store.set(key, value);
  });
  public readonly listSecretKeys = vi.fn(async () => [...this.store.keys()]);
}

describe('Phase 21: Secrets management', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('supports getSecret and setSecret with audit tracking', async () => {
    const provider = new InMemoryProvider();
    const audit = { logEvent: vi.fn().mockResolvedValue(undefined) };
    const service = new SecretsService({
      provider,
      cacheTtlMs: 60_000,
      auditService: audit,
    });

    await service.setSecret(SecretKey.ENCRYPTION_SECRET, 'encrypted-value', {
      accessor: 'user:admin',
      isAdmin: true,
      ip: '127.0.0.1',
    });

    const value = await service.getSecret(SecretKey.ENCRYPTION_SECRET, {
      accessor: 'svc:api',
      ip: '127.0.0.2',
    });

    expect(value).toBe('encrypted-value');
    expect(provider.setSecret).toHaveBeenCalledTimes(1);
    expect(audit.logEvent).toHaveBeenCalledTimes(2);
  });

  it('caches secrets with TTL and refreshes after expiration', async () => {
    const provider = new InMemoryProvider();
    await provider.setSecret(SecretKey.DATABASE_URL, 'postgres://v1');
    const service = new SecretsService({
      provider,
      cacheTtlMs: 1_000,
      auditService: { logEvent: vi.fn().mockResolvedValue(undefined) },
    });

    const first = await service.getSecret(SecretKey.DATABASE_URL, { accessor: 'svc:test' });
    await provider.setSecret(SecretKey.DATABASE_URL, 'postgres://v2');
    const second = await service.getSecret(SecretKey.DATABASE_URL, { accessor: 'svc:test' });
    await vi.advanceTimersByTimeAsync(1_001);
    const third = await service.getSecret(SecretKey.DATABASE_URL, { accessor: 'svc:test' });

    expect(first).toBe('postgres://v1');
    expect(second).toBe('postgres://v1');
    expect(third).toBe('postgres://v2');
    expect(provider.getSecret).toHaveBeenCalledTimes(2);
  });

  it('enforces admin-only mutation for setSecret', async () => {
    const service = new SecretsService({
      provider: new InMemoryProvider(),
      auditService: { logEvent: vi.fn().mockResolvedValue(undefined) },
    });

    await expect(
      service.setSecret(SecretKey.CUSTOMERIO_API_KEY, 'new-key', {
        accessor: 'user:readonly',
        isAdmin: false,
      })
    ).rejects.toThrow('Admin privileges required');
  });

  it('validates required startup secrets', () => {
    const result = validateSecrets({
      provider: 'render',
      nodeEnv: 'development',
      source: {
        DATABASE_URL: 'postgresql://phase21:test@localhost:5432/db',
      },
      throwOnError: false,
    });

    expect(result.valid).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it('reports missing required secrets with clear provider guidance', () => {
    expect(() =>
      validateSecrets({
        provider: 'aws',
        nodeEnv: 'production',
        source: {},
        throwOnError: true,
      })
    ).toThrow('Missing required secrets');
  });

  it('supports provider abstraction for local, render, and aws modes', async () => {
    process.env[SecretKey.CLERK_SECRET_KEY] = 'clerk-local-secret';

    const localService = new SecretsService({
      providerType: 'local',
      auditService: { logEvent: vi.fn().mockResolvedValue(undefined) },
    });
    const renderService = new SecretsService({
      providerType: 'render',
      auditService: { logEvent: vi.fn().mockResolvedValue(undefined) },
    });
    const awsService = new SecretsService({
      providerType: 'aws',
      auditService: { logEvent: vi.fn().mockResolvedValue(undefined) },
    });

    await expect(
      localService.getSecret(SecretKey.CLERK_SECRET_KEY, { accessor: 'svc:local' })
    ).resolves.toBe('clerk-local-secret');
    await expect(
      renderService.getSecret(SecretKey.CLERK_SECRET_KEY, { accessor: 'svc:render' })
    ).resolves.toBe('clerk-local-secret');
    await expect(
      awsService.getSecret(SecretKey.CLERK_SECRET_KEY, { accessor: 'svc:aws' })
    ).rejects.toThrow('not yet implemented');
    await expect(
      awsService.setSecret(SecretKey.CLERK_SECRET_KEY, 'value', {
        accessor: 'svc:aws',
        isAdmin: true,
      })
    ).rejects.toThrow('not yet implemented');
    await expect(
      awsService.listSecretKeys({ accessor: 'svc:aws' })
    ).resolves.toEqual([]);

    delete process.env[SecretKey.CLERK_SECRET_KEY];
  });

  it('lists secret keys and supports cache invalidation paths', async () => {
    const provider = new InMemoryProvider();
    const service = new SecretsService({
      provider,
      cacheTtlMs: 60_000,
      auditService: { logEvent: vi.fn().mockResolvedValue(undefined) },
    });

    await service.setSecret(SecretKey.AI_VISION_API_KEY, 'vision', {
      accessor: 'admin:root',
      isAdmin: true,
    });
    await service.setSecret(SecretKey.CUSTOMERIO_API_KEY, 'customerio', {
      accessor: 'admin:root',
      isAdmin: true,
    });

    const beforeInvalidation = await service.getSecret(SecretKey.AI_VISION_API_KEY, {
      accessor: 'svc:reader',
    });
    service.invalidateCache(SecretKey.AI_VISION_API_KEY);
    service.invalidateCache();

    const listed = await service.listSecretKeys({ accessor: 'svc:reader' });
    expect(beforeInvalidation).toBe('vision');
    expect(listed).toContain(SecretKey.AI_VISION_API_KEY);
    expect(listed).toContain(SecretKey.CUSTOMERIO_API_KEY);
  });

  it('enforces admin checks for rotateSecret', async () => {
    const service = new SecretsService({
      provider: new InMemoryProvider(),
      cacheTtlMs: 60_000,
      auditService: { logEvent: vi.fn().mockResolvedValue(undefined) },
    });

    await expect(
      service.rotateSecret(SecretKey.AWS_SECRET_ACCESS_KEY, {
        accessor: 'user:readonly',
        isAdmin: false,
      })
    ).rejects.toThrow('Admin privileges required');
  });

  it('validates production encryption fallback when ENCRYPTION_KEY exists', () => {
    const result = validateSecrets({
      provider: 'render',
      nodeEnv: 'production',
      source: {
        DATABASE_URL: 'postgresql://phase21:test@localhost:5432/db',
        CLERK_SECRET_KEY: 'clerk-secret',
        ENCRYPTION_KEY: 'legacy-encryption',
      },
      throwOnError: false,
    });

    expect(result.valid).toBe(true);
    expect(result.missing).not.toContain(SecretKey.ENCRYPTION_SECRET);
  });
});
