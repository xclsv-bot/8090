import { env } from '../../../config/env.js';

export interface QuickBooksTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  expiresAt: Date;
  realmId: string;
}

export interface QuickBooksConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  environment: 'sandbox' | 'production';
}

const QB_AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
const QB_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

export function getQuickBooksConfig(): QuickBooksConfig {
  return {
    clientId: env.QUICKBOOKS_CLIENT_ID || '',
    clientSecret: env.QUICKBOOKS_CLIENT_SECRET || '',
    redirectUri: `${env.APP_URL || 'http://localhost:3001'}/api/v1/oauth/quickbooks/callback`,
    environment: (env.QUICKBOOKS_ENVIRONMENT as 'sandbox' | 'production') || 'sandbox',
  };
}

/**
 * Generate QuickBooks OAuth authorization URL
 */
export function getAuthorizationUrl(state: string): string {
  const config = getQuickBooksConfig();
  
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    scope: 'com.intuit.quickbooks.accounting',
    redirect_uri: config.redirectUri,
    state,
  });

  return `${QB_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  code: string,
  realmId: string
): Promise<QuickBooksTokens> {
  const config = getQuickBooksConfig();
  
  const credentials = Buffer.from(
    `${config.clientId}:${config.clientSecret}`
  ).toString('base64');

  const response = await fetch(QB_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
      'Accept': 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
    }).toString(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`QuickBooks token exchange failed: ${JSON.stringify(error)}`);
  }

  const data = await response.json();
  
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    tokenType: data.token_type,
    expiresIn: data.expires_in,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    realmId,
  };
}

/**
 * Refresh QuickBooks tokens
 */
export async function refreshTokens(refreshToken: string): Promise<QuickBooksTokens> {
  const config = getQuickBooksConfig();
  
  const credentials = Buffer.from(
    `${config.clientId}:${config.clientSecret}`
  ).toString('base64');

  const response = await fetch(QB_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
      'Accept': 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`QuickBooks token refresh failed: ${JSON.stringify(error)}`);
  }

  const data = await response.json();
  
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    tokenType: data.token_type,
    expiresIn: data.expires_in,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    realmId: '', // Preserved from original
  };
}

/**
 * Revoke QuickBooks tokens
 */
export async function revokeTokens(token: string): Promise<void> {
  const config = getQuickBooksConfig();
  
  const credentials = Buffer.from(
    `${config.clientId}:${config.clientSecret}`
  ).toString('base64');

  const response = await fetch('https://developer.api.intuit.com/v2/oauth2/tokens/revoke', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: new URLSearchParams({ token }).toString(),
  });

  if (!response.ok) {
    throw new Error('QuickBooks token revocation failed');
  }
}
