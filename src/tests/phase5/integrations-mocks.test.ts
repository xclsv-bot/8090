import { describe, expect, it, vi } from 'vitest';

describe('Phase 5: External integration mock patterns', () => {
  it('uses deterministic fetch mocks for OAuth token flows', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'access-1',
        refresh_token: 'refresh-1',
        token_type: 'Bearer',
        expires_in: 1800,
        scope: 'transactions:read',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const rampProvider = await import('../../services/oauth/providers/ramp.provider.js');
    const tokens = await rampProvider.exchangeCodeForTokens('oauth-code');

    expect(tokens.accessToken).toBe('access-1');
    expect(tokens.refreshToken).toBe('refresh-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('mocks API client dependencies to isolate external HTTP behavior', async () => {
    const ensureValidToken = vi.fn().mockResolvedValue('integration-token');
    const withRetry = vi.fn(async (operation: () => Promise<unknown>) => {
      const data = await operation();
      return { success: true, data, attempts: 1, totalDelayMs: 0 };
    });

    vi.doMock('../../services/oauth/token-refresh.service.js', () => ({ ensureValidToken }));
    vi.doMock('../../services/integration/retry.service.js', () => ({ withRetry }));
    vi.doMock('../../services/integration/error-handler.service.js', () => ({
      handleIntegrationError: vi.fn().mockResolvedValue({ handled: false, shouldRetry: false }),
      classifyError: vi.fn().mockReturnValue({ category: 'unknown', message: 'unknown' }),
      ErrorCategory: { UNKNOWN: 'unknown' },
    }));
    vi.doMock('../../utils/logger.js', () => ({ logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'resource-1' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { createApiClient } = await import('../../services/integration/api-client.service.js');
    const client = createApiClient({ integration: 'ramp', baseUrl: 'https://api.example.com' });
    const response = await client.get('/transactions', 'list_transactions');

    expect(response.success).toBe(true);
    expect(response.data).toEqual({ id: 'resource-1' });
    expect(ensureValidToken).toHaveBeenCalledWith('ramp');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/transactions',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer integration-token' }),
      })
    );
  });

  it('models role-aware auth mocks for Clerk-protected routes', async () => {
    const verifyToken = vi.fn().mockResolvedValue({ sub: 'u-1', role: 'events_team', email: 'ops@xclsv.com' });
    vi.doMock('@clerk/backend', () => ({ verifyToken }));
    vi.doMock('../../config/env.js', () => ({ env: { CLERK_SECRET_KEY: 'secret' } }));
    vi.doMock('../../utils/logger.js', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

    const { authenticate, requireRole } = await import('../../middleware/auth.js');

    const request = { headers: { authorization: 'Bearer clerk-token' } } as any;
    const reply = { status: vi.fn().mockReturnThis(), send: vi.fn() } as any;
    await authenticate(request, reply);

    const gate = requireRole('admin', 'events_team');
    await gate(request, reply);

    expect(request.user?.role).toBe('events_team');
    expect(verifyToken).toHaveBeenCalledWith('clerk-token', { secretKey: 'secret' });
    expect(reply.status).not.toHaveBeenCalled();
  });
});
