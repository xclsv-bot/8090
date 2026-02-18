import crypto from 'crypto';
import { pool } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { IntegrationType } from '../oauth/oauth.service.js';

export interface WebhookPayload {
  integration: IntegrationType;
  eventType: string;
  timestamp: string;
  data: unknown;
  signature?: string;
}

export interface WebhookConfig {
  integration: IntegrationType;
  secret: string;
  signatureHeader: string;
  signatureAlgorithm: 'sha256' | 'sha1';
  eventTypes: string[];
}

// Webhook configurations per integration
const WEBHOOK_CONFIGS: Record<IntegrationType, Partial<WebhookConfig>> = {
  quickbooks: {
    signatureHeader: 'intuit-signature',
    signatureAlgorithm: 'sha256',
    eventTypes: [
      'Invoice.Create', 'Invoice.Update', 'Invoice.Delete',
      'Payment.Create', 'Payment.Update', 'Payment.Delete',
      'Customer.Create', 'Customer.Update', 'Customer.Delete',
    ],
  },
  ramp: {
    signatureHeader: 'ramp-signature',
    signatureAlgorithm: 'sha256',
    eventTypes: [
      'transaction.created', 'transaction.updated',
      'receipt.created', 'receipt.matched',
      'card.created', 'card.suspended',
    ],
  },
  customerio: {
    signatureHeader: 'x-cio-signature',
    signatureAlgorithm: 'sha256',
    eventTypes: ['email.delivered', 'email.opened', 'email.clicked', 'email.bounced'],
  },
  vision: {
    signatureHeader: 'x-vision-signature',
    signatureAlgorithm: 'sha256',
    eventTypes: ['scan.completed', 'scan.failed'],
  },
};

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(
  integration: IntegrationType,
  payload: string,
  signature: string,
  secret: string
): boolean {
  const config = WEBHOOK_CONFIGS[integration];
  if (!config) {
    logger.warn({ integration }, 'No webhook config for integration');
    return false;
  }

  const algorithm = config.signatureAlgorithm || 'sha256';
  const expectedSignature = crypto
    .createHmac(algorithm, secret)
    .update(payload, 'utf8')
    .digest('hex');

  // Handle different signature formats
  const normalizedSignature = signature.startsWith('sha256=') 
    ? signature.slice(7) 
    : signature;

  return crypto.timingSafeEqual(
    Buffer.from(normalizedSignature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Process incoming webhook
 */
export async function processWebhook(
  integration: IntegrationType,
  eventType: string,
  payload: unknown
): Promise<{ processed: boolean; action?: string }> {
  const webhookId = generateWebhookId();

  logger.info({
    webhookId,
    integration,
    eventType,
  }, 'Processing webhook');

  // Store webhook event
  await storeWebhookEvent(webhookId, integration, eventType, payload);

  try {
    // Route to appropriate handler
    const handler = getWebhookHandler(integration, eventType);
    if (handler) {
      const result = await handler(payload);
      
      // Update webhook status
      await updateWebhookStatus(webhookId, 'processed', result);
      
      return { processed: true, action: result };
    }

    // No handler found
    await updateWebhookStatus(webhookId, 'unhandled');
    return { processed: false };

  } catch (error) {
    logger.error({
      webhookId,
      integration,
      eventType,
      error,
    }, 'Webhook processing failed');

    await updateWebhookStatus(
      webhookId, 
      'failed', 
      undefined,
      error instanceof Error ? error.message : 'Unknown error'
    );

    throw error;
  }
}

/**
 * Get webhook handler for integration and event type
 */
function getWebhookHandler(
  integration: IntegrationType,
  eventType: string
): ((payload: unknown) => Promise<string>) | null {
  const handlers: Record<string, Record<string, (payload: unknown) => Promise<string>>> = {
    quickbooks: {
      'Invoice.Create': handleQuickBooksInvoiceCreate,
      'Invoice.Update': handleQuickBooksInvoiceUpdate,
      'Payment.Create': handleQuickBooksPaymentCreate,
    },
    ramp: {
      'transaction.created': handleRampTransactionCreated,
      'transaction.updated': handleRampTransactionUpdated,
    },
  };

  return handlers[integration]?.[eventType] || null;
}

// QuickBooks webhook handlers
async function handleQuickBooksInvoiceCreate(payload: unknown): Promise<string> {
  logger.info({ payload }, 'QuickBooks invoice created');
  // TODO: Map to internal invoice record
  return 'invoice_created';
}

async function handleQuickBooksInvoiceUpdate(payload: unknown): Promise<string> {
  logger.info({ payload }, 'QuickBooks invoice updated');
  return 'invoice_updated';
}

async function handleQuickBooksPaymentCreate(payload: unknown): Promise<string> {
  logger.info({ payload }, 'QuickBooks payment created');
  return 'payment_created';
}

// Ramp webhook handlers
async function handleRampTransactionCreated(payload: unknown): Promise<string> {
  logger.info({ payload }, 'Ramp transaction created');
  return 'transaction_created';
}

async function handleRampTransactionUpdated(payload: unknown): Promise<string> {
  logger.info({ payload }, 'Ramp transaction updated');
  return 'transaction_updated';
}

/**
 * Store webhook event in database
 */
async function storeWebhookEvent(
  webhookId: string,
  integration: IntegrationType,
  eventType: string,
  payload: unknown
): Promise<void> {
  await pool.query(`
    INSERT INTO webhook_events (
      id, provider, event_type, payload, status, created_at
    )
    VALUES ($1, $2, $3, $4, 'received', NOW())
  `, [webhookId, integration, eventType, JSON.stringify(payload)]);
}

/**
 * Update webhook event status
 */
async function updateWebhookStatus(
  webhookId: string,
  status: 'processed' | 'unhandled' | 'failed',
  action?: string,
  error?: string
): Promise<void> {
  await pool.query(`
    UPDATE webhook_events
    SET status = $1, action_taken = $2, error_message = $3, processed_at = NOW()
    WHERE id = $4
  `, [status, action, error, webhookId]);
}

/**
 * Generate unique webhook ID
 */
function generateWebhookId(): string {
  return `wh_${Date.now().toString(36)}_${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * Get webhook secret for integration
 */
export async function getWebhookSecret(integration: IntegrationType): Promise<string | null> {
  const result = await pool.query(`
    SELECT webhook_secret_encrypted FROM integrations WHERE provider = $1
  `, [integration]);

  if (result.rows.length === 0 || !result.rows[0].webhook_secret_encrypted) {
    return null;
  }

  const { decrypt } = await import('../oauth/crypto.service.js');
  return decrypt(result.rows[0].webhook_secret_encrypted.toString());
}
