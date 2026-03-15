import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SecretKey } from '../../config/secrets.js';

const { queryManyMock, refreshProviderTokensMock } = vi.hoisted(() => ({
  queryManyMock: vi.fn(),
  refreshProviderTokensMock: vi.fn(),
}));

vi.mock('../../services/database.js', () => ({
  db: {
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
  },
}));

import { rotateApiKey, rotateOAuthTokens, runScheduledRotationCheck } from '../../utils/secretsRotation.js';

describe('Phase 21: Secrets rotation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryManyMock.mockResolvedValue([]);
    refreshProviderTokensMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env[`${SecretKey.AWS_ACCESS_KEY_ID}_LAST_ROTATED_AT`];
    delete process.env[`${SecretKey.RAMP_CLIENT_SECRET}_LAST_ROTATED_AT`];
  });

  it('rotateApiKey generates a new key', async () => {
    const rotateSecret = vi.fn(async (_key, _context, rotateFn) => rotateFn('old-key'));

    const rotated = await rotateApiKey(SecretKey.AWS_ACCESS_KEY_ID, {
      service: { rotateSecret } as never,
      context: { accessor: 'svc:rotation', isAdmin: true },
    });

    expect(rotated).toMatch(/^[a-f0-9]{64}$/);
    expect(rotated).not.toBe('old-key');
    expect(rotateSecret).toHaveBeenCalledTimes(1);
  });

  it('rotateOAuthTokens refreshes expiring provider tokens', async () => {
    queryManyMock.mockResolvedValueOnce([
      { provider: 'quickbooks' },
      { provider: 'ramp' },
    ]);

    const refreshed = await rotateOAuthTokens(45);

    expect(refreshed).toBe(2);
    expect(queryManyMock).toHaveBeenCalledTimes(1);
    expect(refreshProviderTokensMock).toHaveBeenCalledTimes(2);
  });

  it('runScheduledRotationCheck rotates expired secrets and updates markers', async () => {
    const markerKey = `${SecretKey.AWS_ACCESS_KEY_ID}_LAST_ROTATED_AT`;
    process.env[markerKey] = '2024-01-01T00:00:00.000Z';

    const rotateSecret = vi.fn().mockResolvedValue('rotated-value');

    const result = await runScheduledRotationCheck({
      now: new Date('2026-03-15T00:00:00.000Z'),
      service: { rotateSecret } as never,
    });

    expect(result.rotatedApiKeys).toContain(SecretKey.AWS_ACCESS_KEY_ID);
    expect(result.refreshedOAuthIntegrations).toBe(0);
    expect(process.env[markerKey]).toBe('2026-03-15T00:00:00.000Z');
  });

  it('ignores invalid rotation markers and does not rotate those keys', async () => {
    process.env[`${SecretKey.RAMP_CLIENT_SECRET}_LAST_ROTATED_AT`] = 'invalid-date';
    const rotateSecret = vi.fn().mockResolvedValue('rotated-value');

    const result = await runScheduledRotationCheck({
      now: new Date('2026-03-15T00:00:00.000Z'),
      service: { rotateSecret } as never,
    });

    expect(result.rotatedApiKeys).not.toContain(SecretKey.RAMP_CLIENT_SECRET);
    expect(rotateSecret).not.toHaveBeenCalled();
  });
});
