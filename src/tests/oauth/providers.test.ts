/**
 * WO-62: OAuth Provider Tests
 * Tests for QuickBooks and Ramp OAuth providers
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock environment
vi.mock('../../../config/env.js', () => ({
  env: {
    APP_URL: 'https://api.xclsv.com',
    QUICKBOOKS_CLIENT_ID: 'qb-client-id-12345',
    QUICKBOOKS_CLIENT_SECRET: 'qb-client-secret-67890',
    QUICKBOOKS_ENVIRONMENT: 'sandbox',
    RAMP_CLIENT_ID: 'ramp-client-id-abcde',
    RAMP_CLIENT_SECRET: 'ramp-client-secret-fghij',
  },
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import * as quickbooks from '../../services/oauth/providers/quickbooks.provider.js';
import * as ramp from '../../services/oauth/providers/ramp.provider.js';

describe('QuickBooks Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('getAuthorizationUrl', () => {
    it('should generate correct authorization URL', () => {
      const state = 'test-state-token-123';
      const url = quickbooks.getAuthorizationUrl(state);
      
      expect(url).toContain('https://appcenter.intuit.com/connect/oauth2');
      expect(url).toContain('client_id=');
      expect(url).toContain('response_type=code');
      expect(url).toContain('scope=com.intuit.quickbooks.accounting');
      expect(url).toContain(`state=${state}`);
      expect(url).toContain('redirect_uri=');
      expect(url).toContain('%2Fapi%2Fv1%2Foauth%2Fquickbooks%2Fcallback');
    });

    it('should include proper scopes for accounting access', () => {
      const url = quickbooks.getAuthorizationUrl('state');
      expect(url).toContain('scope=com.intuit.quickbooks.accounting');
    });
  });

  describe('exchangeCodeForTokens', () => {
    it('should exchange authorization code for tokens', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'qb-access-token-xxx',
          refresh_token: 'qb-refresh-token-yyy',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      });

      const tokens = await quickbooks.exchangeCodeForTokens('auth-code', 'realm-123');

      expect(tokens.accessToken).toBe('qb-access-token-xxx');
      expect(tokens.refreshToken).toBe('qb-refresh-token-yyy');
      expect(tokens.tokenType).toBe('Bearer');
      expect(tokens.realmId).toBe('realm-123');
      expect(tokens.expiresAt.getTime()).toBeGreaterThan(Date.now());
      
      // Verify correct endpoint called
      expect(mockFetch).toHaveBeenCalledWith(
        'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
          }),
        })
      );
      
      // Verify Basic auth header
      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers.Authorization).toMatch(/^Basic /);
    });

    it('should handle token exchange error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'invalid_grant',
          error_description: 'The authorization code is invalid',
        }),
      });

      await expect(
        quickbooks.exchangeCodeForTokens('bad-code', 'realm')
      ).rejects.toThrow('QuickBooks token exchange failed');
    });
  });

  describe('refreshTokens', () => {
    it('should refresh expired tokens', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      });

      const tokens = await quickbooks.refreshTokens('old-refresh-token');

      expect(tokens.accessToken).toBe('new-access-token');
      expect(tokens.refreshToken).toBe('new-refresh-token');
      
      // Verify correct grant_type
      const [, options] = mockFetch.mock.calls[0];
      expect(options.body).toContain('grant_type=refresh_token');
      expect(options.body).toContain('refresh_token=old-refresh-token');
    });

    it('should handle refresh failure (401)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          error: 'invalid_grant',
        }),
      });

      await expect(
        quickbooks.refreshTokens('expired-refresh-token')
      ).rejects.toThrow('QuickBooks token refresh failed');
    });
  });

  describe('revokeTokens', () => {
    it('should revoke access token', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await quickbooks.revokeTokens('token-to-revoke');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://developer.api.intuit.com/v2/oauth2/tokens/revoke',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('token=token-to-revoke'),
        })
      );
    });

    it('should throw on revocation failure', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      await expect(
        quickbooks.revokeTokens('token')
      ).rejects.toThrow('QuickBooks token revocation failed');
    });
  });
});

describe('Ramp Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('getAuthorizationUrl', () => {
    it('should generate correct authorization URL', () => {
      const state = 'ramp-state-xyz';
      const url = ramp.getAuthorizationUrl(state);
      
      expect(url).toContain('https://app.ramp.com/v1/authorize');
      expect(url).toContain('client_id=');
      expect(url).toContain('response_type=code');
      expect(url).toContain(`state=${state}`);
    });

    it('should include all required scopes', () => {
      const url = ramp.getAuthorizationUrl('state');
      
      // URL encodes : as %3A and spaces as +
      expect(url).toContain('transactions%3Aread');
      expect(url).toContain('users%3Aread');
      expect(url).toContain('business%3Aread');
      expect(url).toContain('accounting%3Aread');
      expect(url).toContain('accounting%3Awrite');
    });

    it('should include correct redirect URI', () => {
      const url = ramp.getAuthorizationUrl('state');
      expect(url).toContain('redirect_uri=');
      expect(url).toContain('%2Fapi%2Fv1%2Foauth%2Framp%2Fcallback');
    });
  });

  describe('exchangeCodeForTokens', () => {
    it('should exchange authorization code for tokens', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'ramp-access-xxx',
          refresh_token: 'ramp-refresh-yyy',
          token_type: 'Bearer',
          expires_in: 7200,
          scope: 'transactions:read users:read',
        }),
      });

      const tokens = await ramp.exchangeCodeForTokens('ramp-auth-code');

      expect(tokens.accessToken).toBe('ramp-access-xxx');
      expect(tokens.refreshToken).toBe('ramp-refresh-yyy');
      expect(tokens.scope).toBe('transactions:read users:read');
      expect(tokens.expiresIn).toBe(7200);
      
      // Verify correct endpoint
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.ramp.com/v1/public/token',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should use default values for missing response fields', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'access',
          refresh_token: 'refresh',
          // Missing token_type, expires_in, scope
        }),
      });

      const tokens = await ramp.exchangeCodeForTokens('code');

      expect(tokens.tokenType).toBe('Bearer');
      expect(tokens.expiresIn).toBe(3600);
      expect(tokens.scope).toBe('');
    });

    it('should handle exchange error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: 'invalid_request',
        }),
      });

      await expect(
        ramp.exchangeCodeForTokens('bad-code')
      ).rejects.toThrow('Ramp token exchange failed');
    });
  });

  describe('refreshTokens', () => {
    it('should refresh tokens', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-ramp-access',
          refresh_token: 'new-ramp-refresh',
          token_type: 'Bearer',
          expires_in: 7200,
          scope: 'transactions:read',
        }),
      });

      const tokens = await ramp.refreshTokens('old-refresh');

      expect(tokens.accessToken).toBe('new-ramp-access');
      expect(tokens.refreshToken).toBe('new-ramp-refresh');
    });

    it('should preserve old refresh token if new one not provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access',
          // No refresh_token in response (some providers don't rotate)
        }),
      });

      const tokens = await ramp.refreshTokens('original-refresh');

      expect(tokens.refreshToken).toBe('original-refresh');
    });

    it('should handle refresh failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'invalid_grant' }),
      });

      await expect(
        ramp.refreshTokens('bad-refresh')
      ).rejects.toThrow('Ramp token refresh failed');
    });
  });

  describe('revokeTokens', () => {
    it('should revoke token', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await ramp.revokeTokens('ramp-token');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.ramp.com/v1/public/token/revoke',
        expect.objectContaining({
          method: 'POST',
        })
      );
      
      // Verify body contains required fields
      const [, options] = mockFetch.mock.calls[0];
      expect(options.body).toContain('token=ramp-token');
      expect(options.body).toContain('client_id=');
      expect(options.body).toContain('client_secret=');
    });

    it('should throw on revocation failure', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      await expect(
        ramp.revokeTokens('token')
      ).rejects.toThrow('Ramp token revocation failed');
    });
  });
});
