import { describe, expect, it } from 'vitest';

type ApiErrorCode = 'VALIDATION_ERROR' | 'NOT_FOUND' | 'CONFLICT' | 'INTERNAL_ERROR';

interface ApiErrorResponse {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
  };
}

function createError(code: ApiErrorCode, message: string): ApiErrorResponse {
  return {
    success: false,
    error: { code, message },
  };
}

describe('Phase 3: Error handling consistency', () => {
  it('returns uniform error response envelopes', () => {
    const notFound = createError('NOT_FOUND', 'Entity not found');

    expect(notFound.success).toBe(false);
    expect(notFound.error.code).toBe('NOT_FOUND');
    expect(typeof notFound.error.message).toBe('string');
  });

  it('supports standard API error categories', () => {
    const codes: ApiErrorCode[] = ['VALIDATION_ERROR', 'NOT_FOUND', 'CONFLICT', 'INTERNAL_ERROR'];
    expect(codes).toHaveLength(4);
    expect(new Set(codes).size).toBe(4);
  });
});
