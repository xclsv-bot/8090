import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { SecretKey, type SecretProviderType } from '../config/secrets.js';
import {
  secretsAuditService,
  type SecretsAuditContext,
  type SecretsAuditOperation,
} from './secretsAuditService.js';

interface CachedSecret {
  value: string;
  expiresAt: number;
}

export interface SecretProvider {
  getSecret(key: SecretKey): Promise<string | null>;
  setSecret(key: SecretKey, value: string): Promise<void>;
  listSecretKeys(): Promise<SecretKey[]>;
}

class ProcessEnvSecretProvider implements SecretProvider {
  async getSecret(key: SecretKey): Promise<string | null> {
    return process.env[key] || null;
  }

  async setSecret(key: SecretKey, value: string): Promise<void> {
    process.env[key] = value;
  }

  async listSecretKeys(): Promise<SecretKey[]> {
    return Object.values(SecretKey).filter((key) => Boolean(process.env[key]));
  }
}

class AwsSecretsManagerProvider implements SecretProvider {
  async getSecret(_key: SecretKey): Promise<string | null> {
    throw new Error('AWS Secrets Manager provider is configured but not yet implemented.');
  }

  async setSecret(_key: SecretKey, _value: string): Promise<void> {
    throw new Error('AWS Secrets Manager provider is configured but not yet implemented.');
  }

  async listSecretKeys(): Promise<SecretKey[]> {
    return [];
  }
}

export interface SecretsServiceOptions {
  providerType?: SecretProviderType;
  provider?: SecretProvider;
  cacheTtlMs?: number;
  auditService?: {
    logEvent: (entry: {
      secretKey: SecretKey | '*';
      operation: SecretsAuditOperation;
      accessor: string;
      ip?: string;
    }) => Promise<void>;
  };
}

export interface SetSecretContext extends SecretsAuditContext {
  isAdmin: boolean;
}

export class SecretsService {
  private readonly provider: SecretProvider;
  private readonly cacheTtlMs: number;
  private readonly cache = new Map<SecretKey, CachedSecret>();
  private readonly audit;

  constructor(options: SecretsServiceOptions = {}) {
    const providerType = options.providerType ?? env.SECRET_PROVIDER;

    if (options.provider) {
      this.provider = options.provider;
    } else if (providerType === 'aws') {
      this.provider = new AwsSecretsManagerProvider();
    } else {
      this.provider = new ProcessEnvSecretProvider();
    }

    this.cacheTtlMs = options.cacheTtlMs ?? env.SECRETS_CACHE_TTL_MS;
    this.audit = options.auditService ?? secretsAuditService;
  }

  async getSecret(key: SecretKey, context: SecretsAuditContext): Promise<string | null> {
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      await this.auditAccess('get', key, context);
      return cached.value;
    }

    const value = await this.provider.getSecret(key);
    if (value !== null) {
      this.cache.set(key, {
        value,
        expiresAt: Date.now() + this.cacheTtlMs,
      });
    }

    await this.auditAccess('get', key, context);
    return value;
  }

  async setSecret(key: SecretKey, value: string, context: SetSecretContext): Promise<void> {
    this.assertAdmin(context, 'set');

    await this.provider.setSecret(key, value);
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.cacheTtlMs,
    });

    await this.auditAccess('set', key, context);
  }

  async listSecretKeys(context: SecretsAuditContext): Promise<SecretKey[]> {
    const keys = await this.provider.listSecretKeys();
    await this.auditAccess('list', '*', context);
    return keys;
  }

  async rotateSecret(
    key: SecretKey,
    context: SetSecretContext,
    rotateFn: (previous: string | null) => string = () => crypto.randomBytes(24).toString('base64url')
  ): Promise<string> {
    this.assertAdmin(context, 'rotate');

    const previous = await this.provider.getSecret(key);
    const next = rotateFn(previous);

    await this.provider.setSecret(key, next);
    this.cache.set(key, {
      value: next,
      expiresAt: Date.now() + this.cacheTtlMs,
    });

    await this.auditAccess('rotate', key, context);
    return next;
  }

  invalidateCache(key?: SecretKey): void {
    if (!key) {
      this.cache.clear();
      return;
    }

    this.cache.delete(key);
  }

  private assertAdmin(context: SetSecretContext, operation: string): void {
    if (!context.isAdmin) {
      throw new Error(`Admin privileges required for ${operation}Secret.`);
    }
  }

  private async auditAccess(
    operation: SecretsAuditOperation,
    secretKey: SecretKey | '*',
    context: SecretsAuditContext
  ): Promise<void> {
    await this.audit.logEvent({
      operation,
      secretKey,
      accessor: context.accessor,
      ip: context.ip,
    });
  }
}

export const secretsService = new SecretsService();
