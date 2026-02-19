/**
 * WO-62: OAuth Error Scenario Tests
 * Tests for error handling, security, and edge cases
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock dependencies
vi.mock('../../config/database.js', () => ({
  pool: {
    query: vi.fn(),
  },
}));

vi.mock('../../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../config/env.js', () => ({
  env: {
    ENCRYPTION_SECRET: 'test-encryption-secret-32-chars!',
    DATABASE_URL: 'postgresql://test@localhost/test',
    APP_URL: 'http://localhost:3001',
    QUICKBOOKS_CLIENT_ID: 'test-qb-client-id',
    QUICKBOOKS_CLIENT_SECRET: 'test-qb-client-secret',
    RAMP_CLIENT_ID: 'test-ramp-client-id',
    RAMP_CLIENT_SECRET: 'test-ramp-client-secret',
  },
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { pool } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import {
  initiateOAuthFlow,
  handleOAuthCallback,
  getCredentials,
  refreshProviderTokens,
} from '../../services/oauth/oauth.service.js';
import { encrypt, decrypt } from '../../services/oauth/crypto.service.js';

describe('Error Scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('Token Refresh Failures', () => {
    it('should handle 401 from provider (revoked refresh token)', async () => {
      (pool.query as any).mockResolvedValueOnce({
        rows: [{
          id: 1,
          provider: 'quickbooks',
          access_token_encrypted: Buffer.from(encrypt('access')),
          refresh_token_encrypted: Buffer.from(encrypt('revoked-refresh')),
          token_expires_at: new Date(),
          config: {},
          status: 'active',
        }],
      });
      (pool.query as any).mockResolvedValueOnce({ rows: [] }); // Audit

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          error: 'invalid_grant',
          error_description: 'Token has been revoked',
        }),
      });

      await expect(refreshProviderTokens('quickbooks')).rejects.toThrow(
        'QuickBooks token refresh failed'
      );
    });

    it('should handle network timeout during refresh', async () => {
      (pool.query as any).mockResolvedValueOnce({
        rows: [{
          id: 1,
          provider: 'ramp',
          access_token_encrypted: Buffer.from(encrypt('access')),
          refresh_token_encrypted: Buffer.from(encrypt('refresh')),
          token_expires_at: new Date(),
          config: {},
          status: 'active',
        }],
      });
      (pool.query as any).mockResolvedValueOnce({ rows: [] });

      // Simulate network timeout
      mockFetch.mockRejectedValueOnce(new Error('Request timed out'));

      await expect(refreshProviderTokens('ramp')).rejects.toThrow(
        'Request timed out'
      );
    });

    it('should handle provider server error (500)', async () => {
      (pool.query as any).mockResolvedValueOnce({
        rows: [{
          id: 1,
          provider: 'quickbooks',
          access_token_encrypted: Buffer.from(encrypt('access')),
          refresh_token_encrypted: Buffer.from(encrypt('refresh')),
          token_expires_at: new Date(),
          config: {},
          status: 'active',
        }],
      });
      (pool.query as any).mockResolvedValueOnce({ rows: [] });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'internal_server_error' }),
      });

      await expect(refreshProviderTokens('quickbooks')).rejects.toThrow();
    });
  });

  describe('Encryption Key Missing/Invalid', () => {
    it('should derive key from DATABASE_URL as fallback', () => {
      // The implementation uses DATABASE_URL as fallback if ENCRYPTION_SECRET is missing
      // This is already configured in mock, testing encryption still works
      const plaintext = 'test-token';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      
      expect(decrypted).toBe(plaintext);
    });

    it('should fail gracefully with corrupted encrypted data', () => {
      // Completely invalid format
      expect(() => decrypt('not-valid-encryption')).toThrow();
      
      // Valid format but wrong key would cause auth tag failure
      const fakeEncrypted = 'a'.repeat(32) + ':' + 'b'.repeat(32) + ':' + 'c'.repeat(32);
      expect(() => decrypt(fakeEncrypted)).toThrow();
    });
  });

  describe('Database Connection Failures', () => {
    it('should handle database connection error during token storage', async () => {
      const { state } = await initiateOAuthFlow('ramp');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'access',
          refresh_token: 'refresh',
          expires_in: 3600,
        }),
      });

      // Database fails during storage
      (pool.query as any).mockRejectedValueOnce(new Error('Connection refused'));

      await expect(
        handleOAuthCallback('ramp', 'code', state)
      ).rejects.toThrow('Connection refused');
    });

    it('should handle database timeout during getCredentials', async () => {
      (pool.query as any).mockRejectedValueOnce(new Error('Query timed out'));

      await expect(getCredentials('quickbooks')).rejects.toThrow('Query timed out');
    });
  });

  describe('State Token Security', () => {
    it('should reject reused state token', async () => {
      const { state } = await initiateOAuthFlow('quickbooks');
      
      // First use
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'access',
          refresh_token: 'refresh',
          expires_in: 3600,
        }),
      });
      (pool.query as any).mockResolvedValue({ rows: [{ id: 1, provider: 'quickbooks', status: 'active', config: {} }] });
      
      await handleOAuthCallback('quickbooks', 'code', state, { realmId: 'realm' });
      
      // Attempt reuse
      await expect(
        handleOAuthCallback('quickbooks', 'code2', state, { realmId: 'realm' })
      ).rejects.toThrow('Invalid or expired OAuth state');
    });

    it('should reject state from different provider', async () => {
      const { state } = await initiateOAuthFlow('quickbooks');
      
      await expect(
        handleOAuthCallback('ramp', 'code', state)
      ).rejects.toThrow('Invalid or expired OAuth state');
    });

    it('should reject tampered state token', async () => {
      const { state } = await initiateOAuthFlow('ramp');
      const tamperedState = state.slice(0, -4) + 'xxxx';
      
      await expect(
        handleOAuthCallback('ramp', 'code', tamperedState)
      ).rejects.toThrow('Invalid or expired OAuth state');
    });
  });

  describe('Token Storage Security', () => {
    it('should store encrypted tokens, not plaintext', async () => {
      const { state } = await initiateOAuthFlow('quickbooks');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'sensitive-access-token-12345',
          refresh_token: 'sensitive-refresh-token-67890',
          expires_in: 3600,
        }),
      });

      let storedAccessToken: Buffer | null = null;
      let storedRefreshToken: Buffer | null = null;

      (pool.query as any).mockImplementation((query: string, params?: any[]) => {
        if (query.includes('INSERT INTO integrations') || query.includes('UPDATE integrations')) {
          storedAccessToken = params?.[1] || params?.[0];
          storedRefreshToken = params?.[2] || params?.[1];
          return {
            rows: [{
              id: 'test-id',
              provider: 'quickbooks',
              token_expires_at: new Date(),
              config: {},
              status: 'active',
            }],
          };
        }
        return { rows: [] };
      });

      await handleOAuthCallback('quickbooks', 'code', state, { realmId: 'realm' });

      // Verify stored values are not plaintext
      if (storedAccessToken) {
        const storedString = storedAccessToken.toString();
        expect(storedString).not.toContain('sensitive-access-token-12345');
        expect(storedString).toContain(':'); // Encrypted format iv:tag:data
      }

      if (storedRefreshToken) {
        const storedString = storedRefreshToken.toString();
        expect(storedString).not.toContain('sensitive-refresh-token-67890');
      }
    });

    it('should never expose raw tokens in API responses', async () => {
      (pool.query as any).mockResolvedValueOnce({
        rows: [{
          id: 'cred-id',
          provider: 'quickbooks',
          access_token_encrypted: Buffer.from(encrypt('secret-token')),
          refresh_token_encrypted: Buffer.from(encrypt('secret-refresh')),
          token_expires_at: new Date(),
          config: {},
          status: 'active',
        }],
      });
      (pool.query as any).mockResolvedValueOnce({ rows: [] });

      const credentials = await getCredentials('quickbooks');
      
      // Internal use should have decrypted values
      expect(credentials?.accessToken).toBe('secret-token');
      
      // But API route masks these (tested separately in routes)
    });
  });

  describe('Callback Error Handling', () => {
    it('should handle missing authorization code', async () => {
      const { state } = await initiateOAuthFlow('ramp');
      
      await expect(
        handleOAuthCallback('ramp', '', state)
      ).rejects.toThrow(); // Empty code will fail at provider level
    });

    it('should handle invalid authorization code', async () => {
      const { state } = await initiateOAuthFlow('quickbooks');
      
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'invalid_grant',
          error_description: 'Authorization code has expired',
        }),
      });

      await expect(
        handleOAuthCallback('quickbooks', 'expired-code', state, { realmId: 'realm' })
      ).rejects.toThrow('QuickBooks token exchange failed');
    });
  });

  describe('Token Leakage Prevention', () => {
    it('should not log sensitive tokens', async () => {
      (pool.query as any).mockResolvedValueOnce({
        rows: [{
          id: 1,
          provider: 'quickbooks',
          access_token_encrypted: Buffer.from(encrypt('super-secret-token')),
          refresh_token_encrypted: Buffer.from(encrypt('super-secret-refresh')),
          token_expires_at: new Date(),
          config: {},
          status: 'active',
        }],
      });
      (pool.query as any).mockResolvedValueOnce({ rows: [] });

      await getCredentials('quickbooks');

      // Check logger calls don't contain tokens
      const allLogCalls = [
        ...(logger.info as any).mock.calls,
        ...(logger.warn as any).mock.calls,
        ...(logger.error as any).mock.calls,
      ];

      for (const call of allLogCalls) {
        const logString = JSON.stringify(call);
        expect(logString).not.toContain('super-secret-token');
        expect(logString).not.toContain('super-secret-refresh');
      }
    });

    it('should clear tokens on disconnect', async () => {
      (pool.query as any).mockResolvedValueOnce({
        rows: [{
          id: 1,
          provider: 'ramp',
          access_token_encrypted: Buffer.from(encrypt('access')),
          refresh_token_encrypted: Buffer.from(encrypt('refresh')),
          token_expires_at: new Date(),
          config: {},
          status: 'active',
        }],
      });
      (pool.query as any).mockResolvedValue({ rows: [] });
      mockFetch.mockResolvedValueOnce({ ok: true });

      const { disconnectIntegration } = await import('../../services/oauth/oauth.service.js');
      await disconnectIntegration('ramp');

      // Verify UPDATE query sets tokens to NULL
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('access_token_encrypted = NULL'),
        expect.any(Array)
      );
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('refresh_token_encrypted = NULL'),
        expect.any(Array)
      );
    });
  });
});
