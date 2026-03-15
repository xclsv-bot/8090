import crypto from 'node:crypto';
import { db } from '../services/database.js';
import { refreshProviderTokens, type IntegrationType } from '../services/oauth/oauth.service.js';
import { SecretKey, SECRET_METADATA } from '../config/secrets.js';
import { SecretsService, secretsService, type SetSecretContext } from '../services/secretsService.js';
import { logger } from './logger.js';

interface IntegrationForRotation {
  provider: IntegrationType;
}

export async function rotateApiKey(
  keyName: SecretKey,
  options: {
    service?: Pick<SecretsService, 'rotateSecret'>;
    context?: SetSecretContext;
  } = {}
): Promise<string> {
  const service = options.service ?? secretsService;
  const context: SetSecretContext = options.context ?? {
    accessor: 'system:rotation-job',
    isAdmin: true,
  };

  return service.rotateSecret(
    keyName,
    context,
    () => crypto.randomBytes(32).toString('hex')
  );
}

export async function rotateOAuthTokens(refreshThresholdMinutes = 30): Promise<number> {
  const integrations = await db.queryMany<IntegrationForRotation>(
    `SELECT provider
     FROM integrations
     WHERE status = 'active'
       AND refresh_token_encrypted IS NOT NULL
       AND token_expires_at IS NOT NULL
       AND token_expires_at < NOW() + ($1 || ' minutes')::interval`,
    [String(refreshThresholdMinutes)]
  );

  for (const integration of integrations) {
    await refreshProviderTokens(integration.provider);
  }

  logger.info({ refreshedCount: integrations.length }, 'OAuth token rotation check complete');
  return integrations.length;
}

export async function runScheduledRotationCheck(options: {
  now?: Date;
  service?: Pick<SecretsService, 'rotateSecret'>;
} = {}): Promise<{ rotatedApiKeys: SecretKey[]; refreshedOAuthIntegrations: number }> {
  const now = options.now ?? new Date();
  const rotatedApiKeys: SecretKey[] = [];

  for (const metadata of Object.values(SECRET_METADATA)) {
    if (!metadata.rotationIntervalDays) {
      continue;
    }

    const markerKey = `${metadata.key}_LAST_ROTATED_AT`;
    const marker = process.env[markerKey];
    if (!marker) {
      continue;
    }

    const lastRotated = new Date(marker);
    if (Number.isNaN(lastRotated.getTime())) {
      continue;
    }

    const elapsedMs = now.getTime() - lastRotated.getTime();
    const rotationWindowMs = metadata.rotationIntervalDays * 24 * 60 * 60 * 1000;

    if (elapsedMs >= rotationWindowMs) {
      await rotateApiKey(metadata.key, {
        service: options.service,
        context: {
          accessor: 'system:scheduled-rotation',
          isAdmin: true,
        },
      });
      process.env[markerKey] = now.toISOString();
      rotatedApiKeys.push(metadata.key);
    }
  }

  const refreshedOAuthIntegrations = await rotateOAuthTokens();
  return {
    rotatedApiKeys,
    refreshedOAuthIntegrations,
  };
}
