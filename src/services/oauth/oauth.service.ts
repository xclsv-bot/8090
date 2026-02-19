import { pool } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { encrypt, decrypt, generateStateToken, secureCompare } from './crypto.service.js';
import * as quickbooks from './providers/quickbooks.provider.js';
import * as ramp from './providers/ramp.provider.js';

export type IntegrationType = 'quickbooks' | 'ramp' | 'customerio' | 'vision';

export interface OAuthState {
  provider: IntegrationType;
  stateToken: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface IntegrationCredentials {
  id: string; // UUID
  integrationType: IntegrationType;
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date | null;
  metadata: Record<string, unknown>;
  status: 'active' | 'error' | 'expired' | 'disconnected';
}

// In-memory state storage (in production, use Redis)
const oauthStates = new Map<string, OAuthState>();

/**
 * Start OAuth flow for a provider
 */
export async function initiateOAuthFlow(provider: IntegrationType): Promise<{
  authUrl: string;
  state: string;
}> {
  const stateToken = generateStateToken();
  
  // Store state for verification
  oauthStates.set(stateToken, {
    provider,
    stateToken,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
  });

  let authUrl: string;
  
  switch (provider) {
    case 'quickbooks':
      authUrl = quickbooks.getAuthorizationUrl(stateToken);
      break;
    case 'ramp':
      authUrl = ramp.getAuthorizationUrl(stateToken);
      break;
    default:
      throw new Error(`OAuth not supported for provider: ${provider}`);
  }

  logger.info({ provider }, 'OAuth flow initiated');
  
  return { authUrl, state: stateToken };
}

/**
 * Verify OAuth state token
 */
export function verifyStateToken(state: string): OAuthState | null {
  const storedState = oauthStates.get(state);
  
  if (!storedState) {
    return null;
  }

  // Check expiration
  if (new Date() > storedState.expiresAt) {
    oauthStates.delete(state);
    return null;
  }

  // Remove state after verification (single use)
  oauthStates.delete(state);
  
  return storedState;
}

/**
 * Handle OAuth callback and store tokens
 */
export async function handleOAuthCallback(
  provider: IntegrationType,
  code: string,
  state: string,
  additionalData?: Record<string, string>
): Promise<IntegrationCredentials> {
  // Verify state
  const storedState = verifyStateToken(state);
  if (!storedState || storedState.provider !== provider) {
    throw new Error('Invalid or expired OAuth state');
  }

  let tokens: {
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
    metadata?: Record<string, unknown>;
  };

  switch (provider) {
    case 'quickbooks': {
      const realmId = additionalData?.realmId;
      if (!realmId) {
        throw new Error('QuickBooks requires realmId');
      }
      const qbTokens = await quickbooks.exchangeCodeForTokens(code, realmId);
      tokens = {
        accessToken: qbTokens.accessToken,
        refreshToken: qbTokens.refreshToken,
        expiresAt: qbTokens.expiresAt,
        metadata: { realmId },
      };
      break;
    }
    case 'ramp': {
      const rampTokens = await ramp.exchangeCodeForTokens(code);
      tokens = {
        accessToken: rampTokens.accessToken,
        refreshToken: rampTokens.refreshToken,
        expiresAt: rampTokens.expiresAt,
        metadata: { scope: rampTokens.scope },
      };
      break;
    }
    default:
      throw new Error(`OAuth not supported for provider: ${provider}`);
  }

  // Store encrypted tokens
  const credentials = await storeCredentials(provider, tokens);
  
  // Log audit event
  await logAuditEvent(credentials.id, 'token_created', { provider });

  logger.info({ provider, integrationId: credentials.id }, 'OAuth tokens stored');
  
  return credentials;
}

/**
 * Store encrypted credentials in database
 * Uses existing integrations table schema with 'provider' column
 */
async function storeCredentials(
  provider: IntegrationType,
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
    metadata?: Record<string, unknown>;
  }
): Promise<IntegrationCredentials> {
  const encryptedAccess = Buffer.from(encrypt(tokens.accessToken));
  const encryptedRefresh = tokens.refreshToken ? Buffer.from(encrypt(tokens.refreshToken)) : null;

  // Check if integration exists
  const existing = await pool.query(`SELECT id FROM integrations WHERE provider = $1`, [provider]);
  
  let result;
  if (existing.rows.length > 0) {
    result = await pool.query(`
      UPDATE integrations SET
        access_token_encrypted = $1,
        refresh_token_encrypted = $2,
        token_expires_at = $3,
        config = config || $4,
        status = 'active',
        updated_at = NOW()
      WHERE provider = $5
      RETURNING id, provider, token_expires_at, config, status
    `, [encryptedAccess, encryptedRefresh, tokens.expiresAt, JSON.stringify(tokens.metadata || {}), provider]);
  } else {
    result = await pool.query(`
      INSERT INTO integrations (
        id, name, provider, 
        access_token_encrypted, refresh_token_encrypted, 
        token_expires_at, config, status, created_at, updated_at
      )
      VALUES (gen_random_uuid(), $1, $1, $2, $3, $4, $5, 'active', NOW(), NOW())
      RETURNING id, provider, token_expires_at, config, status
    `, [provider, encryptedAccess, encryptedRefresh, tokens.expiresAt, JSON.stringify(tokens.metadata || {})]);
  }

  return {
    id: result.rows[0].id,
    integrationType: result.rows[0].provider,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: result.rows[0].token_expires_at,
    metadata: result.rows[0].config,
    status: result.rows[0].status,
  };
}

/**
 * Get decrypted credentials for a provider
 */
export async function getCredentials(provider: IntegrationType): Promise<IntegrationCredentials | null> {
  const result = await pool.query(`
    SELECT id, provider, access_token_encrypted, refresh_token_encrypted, 
           token_expires_at, config, status
    FROM integrations
    WHERE provider = $1
  `, [provider]);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  
  // Log access for audit (if audit table exists)
  try {
    await logAuditEvent(row.id, 'token_accessed', { provider });
  } catch (e) {
    // Audit table might not exist yet
  }

  return {
    id: row.id,
    integrationType: row.provider,
    accessToken: row.access_token_encrypted ? decrypt(row.access_token_encrypted.toString()) : '',
    refreshToken: row.refresh_token_encrypted ? decrypt(row.refresh_token_encrypted.toString()) : null,
    expiresAt: row.token_expires_at,
    metadata: row.config || {},
    status: row.status,
  };
}

/**
 * Refresh tokens for a provider
 */
export async function refreshProviderTokens(provider: IntegrationType): Promise<IntegrationCredentials> {
  const credentials = await getCredentials(provider);
  
  if (!credentials) {
    throw new Error(`No credentials found for ${provider}`);
  }

  if (!credentials.refreshToken) {
    throw new Error(`No refresh token available for ${provider}`);
  }

  let newTokens: {
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
  };

  switch (provider) {
    case 'quickbooks': {
      const qbTokens = await quickbooks.refreshTokens(credentials.refreshToken);
      newTokens = {
        accessToken: qbTokens.accessToken,
        refreshToken: qbTokens.refreshToken,
        expiresAt: qbTokens.expiresAt,
      };
      break;
    }
    case 'ramp': {
      const rampTokens = await ramp.refreshTokens(credentials.refreshToken);
      newTokens = {
        accessToken: rampTokens.accessToken,
        refreshToken: rampTokens.refreshToken,
        expiresAt: rampTokens.expiresAt,
      };
      break;
    }
    default:
      throw new Error(`Token refresh not supported for ${provider}`);
  }

  // Update stored tokens
  const updated = await storeCredentials(provider, {
    ...newTokens,
    metadata: credentials.metadata,
  });

  // Log audit event
  await logAuditEvent(updated.id, 'token_refreshed', { provider });

  logger.info({ provider, integrationId: updated.id }, 'Tokens refreshed');

  return updated;
}

/**
 * Disconnect integration and revoke tokens
 */
export async function disconnectIntegration(provider: IntegrationType): Promise<void> {
  const credentials = await getCredentials(provider);
  
  if (!credentials) {
    return;
  }

  // Revoke tokens with provider
  try {
    switch (provider) {
      case 'quickbooks':
        await quickbooks.revokeTokens(credentials.accessToken);
        break;
      case 'ramp':
        await ramp.revokeTokens(credentials.accessToken);
        break;
    }
  } catch (error) {
    logger.warn({ provider, error }, 'Token revocation failed');
  }

  // Update status in database
  await pool.query(`
    UPDATE integrations
    SET status = 'disconnected', 
        access_token_encrypted = NULL,
        refresh_token_encrypted = NULL,
        updated_at = NOW()
    WHERE provider = $1
  `, [provider]);

  // Log audit event
  await logAuditEvent(credentials.id, 'integration_disconnected', { provider });

  logger.info({ provider }, 'Integration disconnected');
}

/**
 * Log audit event for token operations
 */
async function logAuditEvent(
  integrationId: string | number,
  action: string,
  details: Record<string, unknown>
): Promise<void> {
  try {
    await pool.query(`
      INSERT INTO integration_audit_logs (integration_id, action, details, created_at)
      VALUES ($1, $2, $3, NOW())
    `, [integrationId, action, JSON.stringify(details)]);
  } catch (error) {
    logger.warn({ error }, 'Failed to log audit event');
  }
}
