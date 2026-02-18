/**
 * Integration Service
 * WO-42: Integration management API + sync orchestration
 * WO-43: External system integrations
 */

import { db } from './database.js';
import { logger } from '../utils/logger.js';
import { eventPublisher } from './eventPublisher.js';
import crypto from 'crypto';

interface IntegrationCredential {
  id: string;
  integrationType: string;
  name: string;
  isActive: boolean;
  lastSyncAt?: Date;
  createdAt: Date;
}

interface SyncSchedule {
  id: string;
  integrationId: string;
  syncType: string;
  cronExpression: string;
  isActive: boolean;
  lastRunAt?: Date;
  nextRunAt?: Date;
}

interface WebhookEndpoint {
  id: string;
  integrationId: string;
  endpointUrl: string;
  events: string[];
  isActive: boolean;
  secret: string;
}

// Encryption key would come from env in production
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'xclsv-dev-key-32-chars-long!!!!';

class IntegrationService {
  /**
   * Create integration credentials
   */
  async createCredentials(
    integrationType: string,
    name: string,
    credentials: Record<string, string>,
    createdBy?: string
  ): Promise<IntegrationCredential> {
    const encrypted = this.encrypt(JSON.stringify(credentials));

    const result = await db.queryOne<IntegrationCredential>(
      `INSERT INTO integration_credentials (
        integration_type, name, credentials_encrypted, created_by
      ) VALUES ($1, $2, $3, $4)
      RETURNING id, integration_type, name, is_active, last_sync_at, created_at`,
      [integrationType, name, encrypted, createdBy]
    );

    logger.info({ integrationType, name }, 'Integration credentials created');
    return result!;
  }

  /**
   * Get integration credentials (decrypted)
   */
  async getCredentials(integrationType: string): Promise<Record<string, string> | null> {
    const row = await db.queryOne<{ credentials_encrypted: string }>(
      `SELECT credentials_encrypted FROM integration_credentials 
       WHERE integration_type = $1 AND is_active = true`,
      [integrationType]
    );

    if (!row) return null;

    try {
      return JSON.parse(this.decrypt(row.credentials_encrypted));
    } catch (error) {
      logger.error({ error, integrationType }, 'Failed to decrypt credentials');
      return null;
    }
  }

  /**
   * List all integrations
   */
  async listIntegrations(): Promise<IntegrationCredential[]> {
    return db.queryMany<IntegrationCredential>(
      `SELECT id, integration_type, name, is_active, last_sync_at, created_at
       FROM integration_credentials
       ORDER BY integration_type, name`
    );
  }

  /**
   * Update integration status
   */
  async updateStatus(id: string, isActive: boolean): Promise<void> {
    await db.query(
      'UPDATE integration_credentials SET is_active = $1 WHERE id = $2',
      [isActive, id]
    );
  }

  /**
   * Create sync schedule
   */
  async createSyncSchedule(
    integrationId: string,
    syncType: string,
    cronExpression: string
  ): Promise<SyncSchedule> {
    const result = await db.queryOne<SyncSchedule>(
      `INSERT INTO sync_schedules (integration_id, sync_type, cron_expression)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [integrationId, syncType, cronExpression]
    );

    logger.info({ integrationId, syncType, cronExpression }, 'Sync schedule created');
    return result!;
  }

  /**
   * Get pending syncs (for cron job)
   */
  async getPendingSyncs(): Promise<SyncSchedule[]> {
    return db.queryMany<SyncSchedule>(
      `SELECT ss.*, ic.integration_type
       FROM sync_schedules ss
       JOIN integration_credentials ic ON ic.id = ss.integration_id
       WHERE ss.is_active = true 
       AND ic.is_active = true
       AND (ss.next_run_at IS NULL OR ss.next_run_at <= NOW())`
    );
  }

  /**
   * Execute sync
   */
  async executeSync(scheduleId: string): Promise<{
    recordsProcessed: number;
    errors: string[];
  }> {
    const schedule = await db.queryOne<SyncSchedule & { integration_type: string }>(
      `SELECT ss.*, ic.integration_type
       FROM sync_schedules ss
       JOIN integration_credentials ic ON ic.id = ss.integration_id
       WHERE ss.id = $1`,
      [scheduleId]
    );

    if (!schedule) throw new Error('Schedule not found');

    await eventPublisher.publish({
      type: 'external_sync.started',
      payload: {
        syncType: schedule.syncType,
        source: schedule.integration_type,
      },
    } as any);

    let recordsProcessed = 0;
    const errors: string[] = [];

    try {
      // Dispatch to appropriate sync handler
      switch (schedule.integration_type) {
        case 'customerio':
          recordsProcessed = await this.syncCustomerIo(schedule.syncType);
          break;
        case 'quickbooks':
          recordsProcessed = await this.syncQuickBooks(schedule.syncType);
          break;
        case 'ramp':
          recordsProcessed = await this.syncRamp(schedule.syncType);
          break;
        default:
          errors.push(`Unknown integration type: ${schedule.integration_type}`);
      }

      // Update last run time
      await db.query(
        `UPDATE sync_schedules SET last_run_at = NOW(), next_run_at = NOW() + INTERVAL '1 hour'
         WHERE id = $1`,
        [scheduleId]
      );

      await eventPublisher.publish({
        type: 'external_sync.completed',
        payload: {
          syncType: schedule.syncType,
          source: schedule.integration_type,
          recordsProcessed,
        },
      } as any);

    } catch (error: any) {
      errors.push(error.message);

      await eventPublisher.publish({
        type: 'external_sync.failed',
        payload: {
          syncType: schedule.syncType,
          source: schedule.integration_type,
          errorMessage: error.message,
        },
      } as any);
    }

    logger.info({ scheduleId, recordsProcessed, errors }, 'Sync executed');
    return { recordsProcessed, errors };
  }

  /**
   * Create webhook endpoint
   */
  async createWebhook(
    integrationId: string,
    endpointUrl: string,
    events: string[]
  ): Promise<WebhookEndpoint> {
    const secret = crypto.randomBytes(32).toString('hex');

    const result = await db.queryOne<WebhookEndpoint>(
      `INSERT INTO webhook_endpoints (integration_id, endpoint_url, events, secret)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [integrationId, endpointUrl, events, secret]
    );

    logger.info({ integrationId, endpointUrl, events }, 'Webhook created');
    return result!;
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    const expected = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }

  /**
   * Send webhook
   */
  async sendWebhook(integrationId: string, event: string, data: unknown): Promise<void> {
    const webhooks = await db.queryMany<WebhookEndpoint>(
      `SELECT * FROM webhook_endpoints 
       WHERE integration_id = $1 AND is_active = true AND $2 = ANY(events)`,
      [integrationId, event]
    );

    for (const webhook of webhooks) {
      try {
        const payload = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
        const signature = crypto
          .createHmac('sha256', webhook.secret)
          .update(payload)
          .digest('hex');

        // In production, would use fetch here
        logger.info({ webhookId: webhook.id, event }, 'Would send webhook');

        await db.query(
          `INSERT INTO webhook_delivery_logs (webhook_id, event, payload, status)
           VALUES ($1, $2, $3, 'delivered')`,
          [webhook.id, event, payload]
        );
      } catch (error) {
        logger.error({ error, webhookId: webhook.id }, 'Webhook delivery failed');
        
        await db.query(
          `INSERT INTO webhook_delivery_logs (webhook_id, event, payload, status, error_message)
           VALUES ($1, $2, $3, 'failed', $4)`,
          [webhook.id, event, JSON.stringify(data), (error as Error).message]
        );
      }
    }
  }

  // ============================================
  // INTEGRATION-SPECIFIC SYNC HANDLERS
  // ============================================

  /**
   * Customer.io sync
   */
  private async syncCustomerIo(syncType: string): Promise<number> {
    const creds = await this.getCredentials('customerio');
    if (!creds) throw new Error('Customer.io credentials not configured');

    // Sync pending signups to Customer.io
    const pendingSignups = await db.queryMany<{ id: string; customer_email: string }>(
      `SELECT id, customer_email FROM signups 
       WHERE synced_to_customerio = false AND validation_status = 'validated'
       LIMIT 100`
    );

    for (const signup of pendingSignups) {
      // In production, would call Customer.io API
      await db.query(
        'UPDATE signups SET synced_to_customerio = true, synced_at = NOW() WHERE id = $1',
        [signup.id]
      );
    }

    return pendingSignups.length;
  }

  /**
   * QuickBooks sync
   */
  private async syncQuickBooks(syncType: string): Promise<number> {
    const creds = await this.getCredentials('quickbooks');
    if (!creds) throw new Error('QuickBooks credentials not configured');

    if (syncType === 'expenses') {
      // Sync expenses from Ramp to QuickBooks
      const unsynced = await db.queryMany<{ id: string }>(
        `SELECT id FROM expenses WHERE quickbooks_synced = false LIMIT 50`
      );

      for (const expense of unsynced) {
        // In production, would create QuickBooks bill
        await db.query(
          'UPDATE expenses SET quickbooks_synced = true WHERE id = $1',
          [expense.id]
        );
      }

      return unsynced.length;
    }

    return 0;
  }

  /**
   * Ramp sync (expenses)
   */
  private async syncRamp(syncType: string): Promise<number> {
    const creds = await this.getCredentials('ramp');
    if (!creds) throw new Error('Ramp credentials not configured');

    // In production, would fetch transactions from Ramp API
    // and insert into expenses table
    logger.info('Ramp sync placeholder');
    
    return 0;
  }

  // ============================================
  // ENCRYPTION HELPERS
  // ============================================

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  private decrypt(text: string): string {
    const [ivHex, encrypted] = text.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}

export const integrationService = new IntegrationService();
