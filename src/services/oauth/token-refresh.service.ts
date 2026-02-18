import { pool } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { refreshProviderTokens, IntegrationType } from './oauth.service.js';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const REFRESH_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes before expiry

let refreshIntervalId: NodeJS.Timeout | null = null;

/**
 * Start the background token refresh service
 */
export function startTokenRefreshService(): void {
  if (refreshIntervalId) {
    logger.warn('Token refresh service already running');
    return;
  }

  logger.info('Starting token refresh service');
  
  // Run immediately, then on interval
  checkAndRefreshTokens();
  refreshIntervalId = setInterval(checkAndRefreshTokens, REFRESH_INTERVAL_MS);
}

/**
 * Stop the background token refresh service
 */
export function stopTokenRefreshService(): void {
  if (refreshIntervalId) {
    clearInterval(refreshIntervalId);
    refreshIntervalId = null;
    logger.info('Token refresh service stopped');
  }
}

/**
 * Check all integrations and refresh tokens that are expiring soon
 */
async function checkAndRefreshTokens(): Promise<void> {
  try {
    // Find integrations with tokens expiring within threshold
    const result = await pool.query(`
      SELECT id, provider, token_expires_at
      FROM integrations
      WHERE status = 'active'
        AND refresh_token_encrypted IS NOT NULL
        AND token_expires_at IS NOT NULL
        AND token_expires_at < NOW() + INTERVAL '30 minutes'
    `);

    if (result.rows.length === 0) {
      return;
    }

    logger.info({ count: result.rows.length }, 'Found integrations needing token refresh');

    for (const row of result.rows) {
      await refreshIntegrationToken(row.id, row.provider);
    }
  } catch (error) {
    logger.error({ error }, 'Error checking tokens for refresh');
  }
}

/**
 * Refresh token for a specific integration
 */
async function refreshIntegrationToken(
  integrationId: number,
  integrationType: IntegrationType
): Promise<void> {
  try {
    logger.info({ integrationId, integrationType }, 'Refreshing token');
    
    await refreshProviderTokens(integrationType);
    
    logger.info({ integrationId, integrationType }, 'Token refreshed successfully');
  } catch (error) {
    logger.error({ integrationId, integrationType, error }, 'Failed to refresh token');
    
    // Mark integration as error status
    await pool.query(`
      UPDATE integrations
      SET status = 'error',
          last_error = $1,
          updated_at = NOW()
      WHERE id = $2
    `, [error instanceof Error ? error.message : 'Unknown error', integrationId]);
  }
}

/**
 * Ensure valid token before making API calls
 * Call this before any external API request
 */
export async function ensureValidToken(integrationType: IntegrationType): Promise<string> {
  const result = await pool.query(`
    SELECT id, access_token_encrypted, token_expires_at, status
    FROM integrations
    WHERE provider = $1
  `, [integrationType]);

  if (result.rows.length === 0) {
    throw new Error(`No credentials found for ${integrationType}`);
  }

  const row = result.rows[0];

  if (row.status !== 'active') {
    throw new Error(`Integration ${integrationType} is not active (status: ${row.status})`);
  }

  // If token expires within threshold, refresh it
  const expiresAt = new Date(row.token_expires_at);
  const now = new Date();
  
  if (expiresAt.getTime() - now.getTime() < REFRESH_THRESHOLD_MS) {
    logger.info({ integrationType }, 'Token expiring soon, refreshing on-demand');
    const refreshed = await refreshProviderTokens(integrationType);
    return refreshed.accessToken;
  }

  // Token is valid, decrypt and return
  const { decrypt } = await import('./crypto.service.js');
  return decrypt(row.access_token_encrypted.toString());
}

/**
 * Get status of all integrations
 */
export async function getIntegrationStatuses(): Promise<Array<{
  integrationType: IntegrationType;
  status: string;
  expiresAt: Date | null;
  lastError: string | null;
}>> {
  const result = await pool.query(`
    SELECT provider, status, token_expires_at, last_error
    FROM integrations
    ORDER BY provider
  `);

  return result.rows.map(row => ({
    integrationType: row.provider,
    status: row.status,
    expiresAt: row.token_expires_at,
    lastError: row.last_error,
  }));
}
