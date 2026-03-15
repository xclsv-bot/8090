import { db } from './database.js';
import { logger } from '../utils/logger.js';
import type { SecretKey } from '../config/secrets.js';

export type SecretsAuditOperation = 'get' | 'set' | 'list' | 'rotate' | 'validate';

export interface SecretsAuditContext {
  accessor: string;
  ip?: string;
}

export interface SecretsAuditEntry {
  secretKey: SecretKey | '*';
  operation: SecretsAuditOperation;
  accessor: string;
  ip?: string;
}

class SecretsAuditService {
  async logEvent(entry: SecretsAuditEntry): Promise<void> {
    try {
      await db.query(
        `INSERT INTO secrets_audit_log (secret_key, operation, accessor, ip)
         VALUES ($1, $2, $3, $4)`,
        [entry.secretKey, entry.operation, entry.accessor, entry.ip || null]
      );

      logger.info(
        {
          secretKey: entry.secretKey,
          operation: entry.operation,
          accessor: entry.accessor,
          ip: entry.ip,
        },
        'Secret access audited'
      );
    } catch (error) {
      logger.warn(
        {
          error,
          secretKey: entry.secretKey,
          operation: entry.operation,
          accessor: entry.accessor,
        },
        'Failed to persist secret audit log'
      );
    }
  }
}

export const secretsAuditService = new SecretsAuditService();
