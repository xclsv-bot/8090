import { beforeEach, describe, expect, it, vi } from 'vitest';

const envMock = vi.hoisted(() => ({
  CLERK_SECRET_KEY: 'test-secret',
}));

const verifyTokenMock = vi.hoisted(() => vi.fn());

vi.mock('@clerk/backend', () => ({
  verifyToken: verifyTokenMock,
}));

vi.mock('../../config/env.js', () => ({
  env: envMock,
}));

vi.mock('../../utils/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

function createReplyMock() {
  const reply = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  return reply;
}

describe('Phase 5: Clerk authentication and roles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    envMock.CLERK_SECRET_KEY = 'test-secret';
  });

  it('validates bearer tokens and maps Clerk claims to request user', async () => {
    verifyTokenMock.mockResolvedValue({
      sub: 'user-123',
      email: 'admin@xclsv.com',
      first_name: 'Admin',
      last_name: 'User',
      role: 'admin',
      org_id: 'org-1',
    });

    const { authenticate } = await import('../../middleware/auth.js');
    const request = { headers: { authorization: 'Bearer token-123' } } as any;
    const reply = createReplyMock() as any;

    await authenticate(request, reply);

    expect(verifyTokenMock).toHaveBeenCalledWith('token-123', { secretKey: 'test-secret' });
    expect(request.user).toMatchObject({
      id: 'user-123',
      email: 'admin@xclsv.com',
      role: 'admin',
      organizationId: 'org-1',
    });
    expect(reply.status).not.toHaveBeenCalled();
  });

  it('allows dev-mode fallback when Clerk secret is missing', async () => {
    envMock.CLERK_SECRET_KEY = '';

    const { authenticate } = await import('../../middleware/auth.js');
    const request = { headers: {} } as any;
    const reply = createReplyMock() as any;

    await authenticate(request, reply);

    expect(request.user?.email).toBe('dev@xclsv.com');
    expect(request.user?.role).toBe('admin');
    expect(verifyTokenMock).not.toHaveBeenCalled();
  });

  it('enforces role-based access control for protected routes', async () => {
    const { requireRole } = await import('../../middleware/auth.js');
    const middleware = requireRole('admin', 'events_team');

    const deniedRequest = { user: { id: 'u-1', role: 'ambassador' } } as any;
    const deniedReply = createReplyMock() as any;
    await middleware(deniedRequest, deniedReply);

    expect(deniedReply.status).toHaveBeenCalledWith(403);
    expect(deniedReply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: 'FORBIDDEN' }),
      })
    );

    const allowedRequest = { user: { id: 'u-2', role: 'admin' } } as any;
    const allowedReply = createReplyMock() as any;
    await middleware(allowedRequest, allowedReply);

    expect(allowedReply.status).not.toHaveBeenCalled();
  });
});
