import { env } from '../../../config/env.js';

export interface RampTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  expiresAt: Date;
  scope: string;
}

export interface RampConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

const RAMP_AUTH_URL = 'https://app.ramp.com/v1/authorize';
const RAMP_TOKEN_URL = 'https://api.ramp.com/v1/public/token';

export function getRampConfig(): RampConfig {
  return {
    clientId: process.env.RAMP_CLIENT_ID || '',
    clientSecret: process.env.RAMP_CLIENT_SECRET || '',
    redirectUri: `${process.env.APP_URL || 'http://localhost:3001'}/api/v1/oauth/ramp/callback`,
  };
}

/**
 * Generate Ramp OAuth authorization URL
 */
export function getAuthorizationUrl(state: string): string {
  const config = getRampConfig();
  
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: 'code',
    scope: 'transactions:read users:read business:read accounting:read accounting:write',
    redirect_uri: config.redirectUri,
    state,
  });

  return `${RAMP_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(code: string): Promise<RampTokens> {
  const config = getRampConfig();

  const response = await fetch(RAMP_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
    }).toString(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Ramp token exchange failed: ${JSON.stringify(error)}`);
  }

  const data = await response.json() as {
    access_token: string;
    refresh_token: string;
    token_type?: string;
    expires_in?: number;
    scope?: string;
  };
  
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    tokenType: data.token_type || 'Bearer',
    expiresIn: data.expires_in || 3600,
    expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
    scope: data.scope || '',
  };
}

/**
 * Refresh Ramp tokens
 */
export async function refreshTokens(refreshToken: string): Promise<RampTokens> {
  const config = getRampConfig();

  const response = await fetch(RAMP_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }).toString(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Ramp token refresh failed: ${JSON.stringify(error)}`);
  }

  const data = await response.json() as {
    access_token: string;
    refresh_token?: string;
    token_type?: string;
    expires_in?: number;
    scope?: string;
  };
  
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken, // Some providers don't rotate refresh tokens
    tokenType: data.token_type || 'Bearer',
    expiresIn: data.expires_in || 3600,
    expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
    scope: data.scope || '',
  };
}

/**
 * Revoke Ramp tokens
 */
export async function revokeTokens(token: string): Promise<void> {
  const config = getRampConfig();

  const response = await fetch(`${RAMP_TOKEN_URL}/revoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      token,
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }).toString(),
  });

  if (!response.ok) {
    throw new Error('Ramp token revocation failed');
  }
}
