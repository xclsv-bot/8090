/**
 * WO-62: Token Refresh Service Tests
 * Tests for background token refresh service and expiration checks
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
    RAMP_CLIENT_ID: 'test-ramp-client-id',
    RAMP_CLIENT_SECRET: 'test-ramp-client-secret',
  },
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

import { pool } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import {
  startTokenRefreshService,
  stopTokenRefreshService,
  ensureValidToken,
  getIntegrationStatuses,
} from '../../services/oauth/token-refresh.service.js';
import { encrypt } from '../../services/oauth/crypto.service.js';

describe('Token Refresh Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockFetch.mockReset();
    stopTokenRefreshService(); // Ensure clean state
  });

  afterEach(() => {
    stopTokenRefreshService();
    vi.useRealTimers();
  });

  describe('Background Service Lifecycle', () => {
    it('should start refresh service and log startup', () => {
      (pool.query as any).mockResolvedValue({ rows: [] });
      
      startTokenRefreshService();
      
      expect(logger.info).toHaveBeenCalledWith('Starting token refresh service');
    });

    it('should warn if service already running', () => {
      (pool.query as any).mockResolvedValue({ rows: [] });
      
      startTokenRefreshService();
      startTokenRefreshService();
      
      expect(logger.warn).toHaveBeenCalledWith('Token refresh service already running');
    });

    it('should stop refresh service', () => {
      (pool.query as any).mockResolvedValue({ rows: [] });
      
      startTokenRefreshService();
      stopTokenRefreshService();
      
      expect(logger.info).toHaveBeenCalledWith('Token refresh service stopped');
    });

    it('should run check on 5-minute interval', async () => {
      (pool.query as any).mockResolvedValue({ rows: [] });
      
      startTokenRefreshService();
      
      // Fast-forward 5 minutes
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      
      // Should have queried for expiring tokens (check the SQL pattern)
      const calls = (pool.query as any).mock.calls;
      const hasTokenExpiryCheck = calls.some((call: any[]) => 
        typeof call[0] === 'string' && call[0].includes("INTERVAL '30 minutes'")
      );
      expect(hasTokenExpiryCheck).toBe(true);
    });
  });

  describe('Token Expiration Checks', () => {
    it('should find and refresh tokens expiring within 30 minutes', async () => {
      // Return integration needing refresh
      (pool.query as any)
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            provider: 'quickbooks',
            token_expires_at: new Date(Date.now() + 25 * 60 * 1000), // Expires in 25 min
          }],
        })
        // getCredentials for refresh
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            provider: 'quickbooks',
            access_token_encrypted: Buffer.from(encrypt('old-access')),
            refresh_token_encrypted: Buffer.from(encrypt('refresh-token')),
            token_expires_at: new Date(),
            config: { realmId: 'test' },
            status: 'active',
          }],
        })
        .mockResolvedValue({ rows: [] }); // Subsequent calls

      // Mock successful token refresh
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      });

      startTokenRefreshService();
      
      // Wait for initial check
      await vi.advanceTimersByTimeAsync(100);
      
      expect(logger.info).toHaveBeenCalledWith(
        { count: 1 },
        'Found integrations needing token refresh'
      );
    });

    it('should skip check when no tokens expiring soon', async () => {
      (pool.query as any).mockResolvedValue({ rows: [] });
      
      startTokenRefreshService();
      await vi.advanceTimersByTimeAsync(100);
      
      // Should not log "Found integrations needing..."
      expect(logger.info).not.toHaveBeenCalledWith(
        expect.objectContaining({ count: expect.any(Number) }),
        'Found integrations needing token refresh'
      );
    });

    it('should mark integration as error on refresh failure', async () => {
      (pool.query as any)
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            provider: 'ramp',
            token_expires_at: new Date(Date.now() + 20 * 60 * 1000),
          }],
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            provider: 'ramp',
            access_token_encrypted: Buffer.from(encrypt('access')),
            refresh_token_encrypted: Buffer.from(encrypt('refresh')),
            token_expires_at: new Date(),
            config: {},
            status: 'active',
          }],
        })
        .mockResolvedValue({ rows: [] });

      // Mock failed refresh
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'invalid_grant' }),
      });

      startTokenRefreshService();
      await vi.advanceTimersByTimeAsync(100);

      // Should update status to error
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'error'"),
        expect.any(Array)
      );
    });

    it('should handle database error during check gracefully', async () => {
      (pool.query as any).mockRejectedValueOnce(new Error('DB connection failed'));
      
      startTokenRefreshService();
      await vi.advanceTimersByTimeAsync(100);
      
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(Error) }),
        'Error checking tokens for refresh'
      );
    });
  });

  describe('ensureValidToken', () => {
    it('should return existing token if not expiring soon', async () => {
      const encryptedToken = encrypt('valid-access-token');
      
      (pool.query as any).mockResolvedValueOnce({
        rows: [{
          id: 1,
          access_token_encrypted: Buffer.from(encryptedToken),
          token_expires_at: new Date(Date.now() + 60 * 60 * 1000), // Expires in 1 hour
          status: 'active',
        }],
      });

      const token = await ensureValidToken('quickbooks');
      
      expect(token).toBe('valid-access-token');
      expect(mockFetch).not.toHaveBeenCalled(); // No refresh needed
    });

    it('should refresh token if expiring within 30 minutes', async () => {
      const encryptedAccess = encrypt('old-access');
      const encryptedRefresh = encrypt('refresh-token');
      
      (pool.query as any)
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            access_token_encrypted: Buffer.from(encryptedAccess),
            token_expires_at: new Date(Date.now() + 20 * 60 * 1000), // Expires in 20 min
            status: 'active',
          }],
        })
        // getCredentials for refresh
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            provider: 'quickbooks',
            access_token_encrypted: Buffer.from(encryptedAccess),
            refresh_token_encrypted: Buffer.from(encryptedRefresh),
            token_expires_at: new Date(),
            config: { realmId: 'test' },
            status: 'active',
          }],
        })
        .mockResolvedValueOnce({ rows: [] }) // audit log
        // storeCredentials check existing
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        // storeCredentials update
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            provider: 'quickbooks',
            token_expires_at: new Date(Date.now() + 3600 * 1000),
            config: { realmId: 'test' },
            status: 'active',
          }],
        })
        .mockResolvedValue({ rows: [] });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'refreshed-access-token',
          refresh_token: 'new-refresh',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      });

      const token = await ensureValidToken('quickbooks');
      
      expect(token).toBe('refreshed-access-token');
      expect(logger.info).toHaveBeenCalledWith(
        { integrationType: 'quickbooks' },
        'Token expiring soon, refreshing on-demand'
      );
    });

    it('should throw when credentials not found', async () => {
      (pool.query as any).mockResolvedValueOnce({ rows: [] });

      await expect(ensureValidToken('quickbooks')).rejects.toThrow(
        'No credentials found for quickbooks'
      );
    });

    it('should throw when integration not active', async () => {
      (pool.query as any).mockResolvedValueOnce({
        rows: [{
          id: 1,
          access_token_encrypted: Buffer.from('encrypted'),
          token_expires_at: new Date(),
          status: 'error',
        }],
      });

      await expect(ensureValidToken('ramp')).rejects.toThrow(
        'Integration ramp is not active (status: error)'
      );
    });
  });

  describe('getIntegrationStatuses', () => {
    it('should return status of all integrations', async () => {
      (pool.query as any).mockResolvedValueOnce({
        rows: [
          {
            provider: 'quickbooks',
            status: 'active',
            token_expires_at: new Date('2025-06-01'),
            last_error: null,
          },
          {
            provider: 'ramp',
            status: 'error',
            token_expires_at: new Date('2025-05-15'),
            last_error: 'Token refresh failed',
          },
        ],
      });

      const statuses = await getIntegrationStatuses();

      expect(statuses).toHaveLength(2);
      expect(statuses[0]).toEqual({
        integrationType: 'quickbooks',
        status: 'active',
        expiresAt: new Date('2025-06-01'),
        lastError: null,
      });
      expect(statuses[1]).toEqual({
        integrationType: 'ramp',
        status: 'error',
        expiresAt: new Date('2025-05-15'),
        lastError: 'Token refresh failed',
      });
    });

    it('should return empty array when no integrations', async () => {
      (pool.query as any).mockResolvedValueOnce({ rows: [] });

      const statuses = await getIntegrationStatuses();
      expect(statuses).toEqual([]);
    });
  });

  describe('Audit Logging', () => {
    it('should log token refresh events', async () => {
      (pool.query as any)
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            provider: 'quickbooks',
            token_expires_at: new Date(Date.now() + 20 * 60 * 1000),
          }],
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            provider: 'quickbooks',
            access_token_encrypted: Buffer.from(encrypt('access')),
            refresh_token_encrypted: Buffer.from(encrypt('refresh')),
            token_expires_at: new Date(),
            config: { realmId: 'test' },
            status: 'active',
          }],
        })
        .mockResolvedValue({ rows: [] });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          token_type: 'Bearer',
          expires_in: 3600,
        }),
      });

      startTokenRefreshService();
      await vi.advanceTimersByTimeAsync(100);

      // Verify audit log was called
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO integration_audit_logs'),
        expect.any(Array)
      );
    });
  });
});
