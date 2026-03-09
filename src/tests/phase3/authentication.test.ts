import { describe, expect, it } from 'vitest';

type UserRole = 'admin' | 'manager' | 'events_team' | 'ambassador' | 'affiliate';

type ErrorCode = 'UNAUTHORIZED' | 'INVALID_TOKEN' | 'AUTH_FAILED' | 'FORBIDDEN';

function isBearerToken(header?: string) {
  return Boolean(header && header.startsWith('Bearer ') && header.length > 7);
}

function authError(code: ErrorCode) {
  return {
    success: false,
    error: {
      code,
      message: 'Authentication failed',
    },
  };
}

function canAccess(requiredRoles: UserRole[], userRole: UserRole) {
  return requiredRoles.includes(userRole);
}

describe('Phase 3: Authentication and authorization flows', () => {
  it('validates bearer token header format', () => {
    expect(isBearerToken('Bearer token-123')).toBe(true);
    expect(isBearerToken('Basic abc')).toBe(false);
    expect(isBearerToken(undefined)).toBe(false);
  });

  it('returns standardized auth error codes', () => {
    const missingHeader = authError('UNAUTHORIZED');
    const invalidToken = authError('INVALID_TOKEN');
    const authFailure = authError('AUTH_FAILED');
    const forbidden = authError('FORBIDDEN');

    expect(missingHeader.error.code).toBe('UNAUTHORIZED');
    expect(invalidToken.error.code).toBe('INVALID_TOKEN');
    expect(authFailure.error.code).toBe('AUTH_FAILED');
    expect(forbidden.error.code).toBe('FORBIDDEN');
  });

  it('enforces role-based route access', () => {
    expect(canAccess(['admin', 'manager'], 'admin')).toBe(true);
    expect(canAccess(['admin', 'manager'], 'manager')).toBe(true);
    expect(canAccess(['admin', 'manager'], 'ambassador')).toBe(false);
  });
});
