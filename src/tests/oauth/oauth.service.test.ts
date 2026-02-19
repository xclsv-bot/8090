/**
 * WO-62: OAuth Service Tests
 * Tests for OAuth flow management, token storage, and credential handling
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock external dependencies
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
    QUICKBOOKS_ENVIRONMENT: 'sandbox',
    RAMP_CLIENT_ID: 'test-ramp-client-id',
    RAMP_CLIENT_SECRET: 'test-ramp-client-secret',
  },
}));

// Mock fetch for provider API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { pool } from '../../config/database.js';
import {
  initiateOAuthFlow,
  verifyStateToken,
  handleOAuthCallback,
  getCredentials,
  refreshProviderTokens,
  disconnectIntegration,
} from '../../services/oauth/oauth.service.js';
import { encrypt, decrypt } from '../../services/oauth/crypto.service.js';

describe('OAuth Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('initiateOAuthFlow', () => {
    it('should generate QuickBooks authorization URL with state', async () => {
      const result = await initiateOAuthFlow('quickbooks');
      
      expect(result.authUrl).toContain('https://appcenter.intuit.com/connect/oauth2');
      expect(result.authUrl).toContain('client_id=test-qb-client-id');
      expect(result.authUrl).toContain('response_type=code');
      expect(result.authUrl).toContain('scope=com.intuit.quickbooks.accounting');
      expect(result.authUrl).toContain('state=');
      expect(result.state).toBeTruthy();
      expect(result.state.length).toBe(64); // 32 bytes = 64 hex chars
    });

    it('should generate Ramp authorization URL with state', async () => {
      const result = await initiateOAuthFlow('ramp');
      
      expect(result.authUrl).toContain('https://app.ramp.com/v1/authorize');
      expect(result.authUrl).toContain('client_id=');
      expect(result.authUrl).toContain('response_type=code');
      // URL encodes : as %3A
      expect(result.authUrl).toContain('transactions%3Aread');
      expect(result.authUrl).toContain('state=');
      expect(result.state).toBeTruthy();
    });

    it('should throw error for unsupported provider', async () => {
      await expect(initiateOAuthFlow('unsupported' as any)).rejects.toThrow(
        'OAuth not supported for provider: unsupported'
      );
    });

    it('should store state token with expiration', async () => {
      const result = await initiateOAuthFlow('quickbooks');
      
      // State should be verifiable immediately
      const storedState = verifyStateToken(result.state);
      expect(storedState).toBeTruthy();
      expect(storedState?.provider).toBe('quickbooks');
    });
  });

  describe('verifyStateToken', () => {
    it('should return null for unknown state', () => {
      const result = verifyStateToken('unknown-state-token');
      expect(result).toBeNull();
    });

    it('should return state info for valid token', async () => {
      const { state } = await initiateOAuthFlow('quickbooks');
      const verified = verifyStateToken(state);
      
      expect(verified).toBeTruthy();
      expect(verified?.provider).toBe('quickbooks');
      expect(verified?.stateToken).toBe(state);
    });

    it('should invalidate state after single use', async () => {
      const { state } = await initiateOAuthFlow('ramp');
      
      // First verification should succeed
      const first = verifyStateToken(state);
      expect(first).toBeTruthy();
      
      // Second verification should fail (token consumed)
      const second = verifyStateToken(state);
      expect(second).toBeNull();
    });
  });

  describe('handleOAuthCallback - QuickBooks', () => {
    it('should exchange code for tokens and store encrypted', async () => {
      // Setup: initiate flow first
      const { state } = await initiateOAuthFlow('quickbooks');
      
      // Mock QuickBooks token response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'qb-access-token-123',
          refresh_token: 'qb-refresh-token-456',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      });

      // Mock database operations
      (pool.query as any).mockResolvedValueOnce({ rows: [] }); // Check existing
      (pool.query as any).mockResolvedValueOnce({
        rows: [{
          id: 'test-uuid',
          provider: 'quickbooks',
          token_expires_at: new Date(Date.now() + 3600 * 1000),
          config: { realmId: 'test-realm' },
          status: 'active',
        }],
      });
      (pool.query as any).mockResolvedValueOnce({ rows: [] }); // Audit log

      const result = await handleOAuthCallback('quickbooks', 'auth-code', state, {
        realmId: 'test-realm',
      });

      expect(result.integrationType).toBe('quickbooks');
      expect(result.status).toBe('active');
      expect(result.accessToken).toBe('qb-access-token-123');
      expect(result.refreshToken).toBe('qb-refresh-token-456');
      
      // Verify token endpoint was called
      expect(mockFetch).toHaveBeenCalledWith(
        'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded',
          }),
        })
      );
    });

    it('should throw on missing realmId for QuickBooks', async () => {
      const { state } = await initiateOAuthFlow('quickbooks');
      
      await expect(
        handleOAuthCallback('quickbooks', 'code', state, {})
      ).rejects.toThrow('QuickBooks requires realmId');
    });

    it('should throw on invalid/expired state', async () => {
      await expect(
        handleOAuthCallback('quickbooks', 'code', 'invalid-state', { realmId: 'test' })
      ).rejects.toThrow('Invalid or expired OAuth state');
    });

    it('should throw on state provider mismatch', async () => {
      const { state } = await initiateOAuthFlow('quickbooks');
      
      await expect(
        handleOAuthCallback('ramp', 'code', state)
      ).rejects.toThrow('Invalid or expired OAuth state');
    });
  });

  describe('handleOAuthCallback - Ramp', () => {
    it('should exchange code for tokens', async () => {
      const { state } = await initiateOAuthFlow('ramp');
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'ramp-access-token',
          refresh_token: 'ramp-refresh-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'transactions:read users:read',
        }),
      });

      (pool.query as any).mockResolvedValueOnce({ rows: [] });
      (pool.query as any).mockResolvedValueOnce({
        rows: [{
          id: 'test-uuid',
          provider: 'ramp',
          token_expires_at: new Date(Date.now() + 3600 * 1000),
          config: { scope: 'transactions:read users:read' },
          status: 'active',
        }],
      });
      (pool.query as any).mockResolvedValueOnce({ rows: [] });

      const result = await handleOAuthCallback('ramp', 'auth-code', state);

      expect(result.integrationType).toBe('ramp');
      expect(result.accessToken).toBe('ramp-access-token');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.ramp.com/v1/public/token',
        expect.any(Object)
      );
    });
  });

  describe('handleOAuthCallback - Error Handling', () => {
    it('should handle token exchange failure (invalid code)', async () => {
      const { state } = await initiateOAuthFlow('ramp');
      
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'invalid_grant',
          error_description: 'Authorization code expired',
        }),
      });

      await expect(
        handleOAuthCallback('ramp', 'invalid-code', state)
      ).rejects.toThrow('Ramp token exchange failed');
    });

    it('should handle network error during token exchange', async () => {
      const { state } = await initiateOAuthFlow('quickbooks');
      
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(
        handleOAuthCallback('quickbooks', 'code', state, { realmId: 'test' })
      ).rejects.toThrow('Network error');
    });
  });

  describe('getCredentials', () => {
    it('should return decrypted credentials', async () => {
      const encryptedAccess = encrypt('decrypted-access-token');
      const encryptedRefresh = encrypt('decrypted-refresh-token');
      
      (pool.query as any).mockResolvedValueOnce({
        rows: [{
          id: 'cred-id',
          provider: 'quickbooks',
          access_token_encrypted: Buffer.from(encryptedAccess),
          refresh_token_encrypted: Buffer.from(encryptedRefresh),
          token_expires_at: new Date('2025-01-01'),
          config: { realmId: 'test' },
          status: 'active',
        }],
      });
      (pool.query as any).mockResolvedValueOnce({ rows: [] }); // Audit log

      const result = await getCredentials('quickbooks');

      expect(result).toBeTruthy();
      expect(result?.accessToken).toBe('decrypted-access-token');
      expect(result?.refreshToken).toBe('decrypted-refresh-token');
      expect(result?.integrationType).toBe('quickbooks');
    });

    it('should return null for non-existent provider', async () => {
      (pool.query as any).mockResolvedValueOnce({ rows: [] });

      const result = await getCredentials('quickbooks');
      expect(result).toBeNull();
    });
  });

  describe('refreshProviderTokens', () => {
    it('should refresh QuickBooks tokens', async () => {
      const encryptedRefresh = encrypt('old-refresh-token');
      
      // Mock getCredentials
      (pool.query as any).mockResolvedValueOnce({
        rows: [{
          id: 'cred-id',
          provider: 'quickbooks',
          access_token_encrypted: Buffer.from(encrypt('old-access')),
          refresh_token_encrypted: Buffer.from(encryptedRefresh),
          token_expires_at: new Date(),
          config: { realmId: 'test' },
          status: 'active',
        }],
      });
      (pool.query as any).mockResolvedValueOnce({ rows: [] }); // Audit log for getCredentials

      // Mock refresh token API call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      });

      // Mock storeCredentials
      (pool.query as any).mockResolvedValueOnce({ rows: [{ id: 'cred-id' }] }); // Check existing
      (pool.query as any).mockResolvedValueOnce({
        rows: [{
          id: 'cred-id',
          provider: 'quickbooks',
          token_expires_at: new Date(Date.now() + 3600 * 1000),
          config: { realmId: 'test' },
          status: 'active',
        }],
      });
      (pool.query as any).mockResolvedValueOnce({ rows: [] }); // Audit log

      const result = await refreshProviderTokens('quickbooks');

      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
    });

    it('should throw when no refresh token available', async () => {
      (pool.query as any).mockResolvedValueOnce({
        rows: [{
          id: 'cred-id',
          provider: 'quickbooks',
          access_token_encrypted: Buffer.from(encrypt('access')),
          refresh_token_encrypted: null,
          token_expires_at: new Date(),
          config: {},
          status: 'active',
        }],
      });
      (pool.query as any).mockResolvedValueOnce({ rows: [] });

      await expect(refreshProviderTokens('quickbooks')).rejects.toThrow(
        'No refresh token available for quickbooks'
      );
    });

    it('should throw when credentials not found', async () => {
      (pool.query as any).mockResolvedValueOnce({ rows: [] });

      await expect(refreshProviderTokens('quickbooks')).rejects.toThrow(
        'No credentials found for quickbooks'
      );
    });

    it('should handle 401 from provider (refresh token expired)', async () => {
      const encryptedRefresh = encrypt('expired-refresh-token');
      
      (pool.query as any).mockResolvedValueOnce({
        rows: [{
          id: 'cred-id',
          provider: 'ramp',
          access_token_encrypted: Buffer.from(encrypt('access')),
          refresh_token_encrypted: Buffer.from(encryptedRefresh),
          token_expires_at: new Date(),
          config: {},
          status: 'active',
        }],
      });
      (pool.query as any).mockResolvedValueOnce({ rows: [] });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          error: 'invalid_grant',
          error_description: 'Refresh token expired',
        }),
      });

      await expect(refreshProviderTokens('ramp')).rejects.toThrow(
        'Ramp token refresh failed'
      );
    });
  });

  describe('disconnectIntegration', () => {
    it('should revoke tokens and update database', async () => {
      const encryptedAccess = encrypt('access-to-revoke');
      
      (pool.query as any).mockResolvedValueOnce({
        rows: [{
          id: 'cred-id',
          provider: 'quickbooks',
          access_token_encrypted: Buffer.from(encryptedAccess),
          refresh_token_encrypted: null,
          token_expires_at: new Date(),
          config: {},
          status: 'active',
        }],
      });
      (pool.query as any).mockResolvedValueOnce({ rows: [] }); // Audit log for getCredentials

      // Mock revoke API call
      mockFetch.mockResolvedValueOnce({ ok: true });

      // Mock database update
      (pool.query as any).mockResolvedValueOnce({ rows: [] }); // UPDATE
      (pool.query as any).mockResolvedValueOnce({ rows: [] }); // Audit log

      await disconnectIntegration('quickbooks');

      // Verify revoke endpoint was called
      expect(mockFetch).toHaveBeenCalledWith(
        'https://developer.api.intuit.com/v2/oauth2/tokens/revoke',
        expect.objectContaining({ method: 'POST' })
      );

      // Verify database update was called
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'disconnected'"),
        ['quickbooks']
      );
    });

    it('should handle missing credentials gracefully', async () => {
      (pool.query as any).mockResolvedValueOnce({ rows: [] });

      // Should not throw
      await expect(disconnectIntegration('quickbooks')).resolves.toBeUndefined();
    });

    it('should continue disconnect even if revoke fails', async () => {
      (pool.query as any).mockResolvedValueOnce({
        rows: [{
          id: 'cred-id',
          provider: 'ramp',
          access_token_encrypted: Buffer.from(encrypt('access')),
          refresh_token_encrypted: null,
          token_expires_at: new Date(),
          config: {},
          status: 'active',
        }],
      });
      (pool.query as any).mockResolvedValueOnce({ rows: [] });

      // Revoke fails
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      (pool.query as any).mockResolvedValueOnce({ rows: [] });
      (pool.query as any).mockResolvedValueOnce({ rows: [] });

      // Should still complete without throwing
      await expect(disconnectIntegration('ramp')).resolves.toBeUndefined();

      // Database should still be updated
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'disconnected'"),
        ['ramp']
      );
    });
  });
});
