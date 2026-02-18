import { FastifyPluginAsync } from 'fastify';
import {
  processWebhook,
  verifyWebhookSignature,
  getWebhookSecret,
} from '../services/integration/webhook.service.js';
import { IntegrationType } from '../services/oauth/oauth.service.js';
import { logger } from '../utils/logger.js';

const webhookRoutes: FastifyPluginAsync = async (fastify) => {
  // QuickBooks webhook endpoint
  fastify.post('/quickbooks', {
    config: {
      rawBody: true,
    },
  }, async (request, reply) => {
    return handleWebhook('quickbooks', request, reply, 'intuit-signature');
  });

  // Ramp webhook endpoint
  fastify.post('/ramp', {
    config: {
      rawBody: true,
    },
  }, async (request, reply) => {
    return handleWebhook('ramp', request, reply, 'ramp-signature');
  });

  // Customer.io webhook endpoint
  fastify.post('/customerio', {
    config: {
      rawBody: true,
    },
  }, async (request, reply) => {
    return handleWebhook('customerio', request, reply, 'x-cio-signature');
  });

  // Generic webhook handler
  async function handleWebhook(
    integration: IntegrationType,
    request: any,
    reply: any,
    signatureHeader: string
  ) {
    const signature = request.headers[signatureHeader] as string;
    const rawBody = request.rawBody as string;

    // Get webhook secret
    const secret = await getWebhookSecret(integration);

    // Verify signature if secret is configured
    if (secret && signature) {
      const isValid = verifyWebhookSignature(integration, rawBody, signature, secret);
      if (!isValid) {
        logger.warn({ integration }, 'Webhook signature verification failed');
        return reply.code(401).send({ error: 'Invalid signature' });
      }
    }

    // Parse payload
    const payload = request.body as Record<string, unknown>;
    const eventType = extractEventType(integration, payload, request.headers);

    if (!eventType) {
      logger.warn({ integration, payload }, 'Could not determine event type');
      return reply.code(400).send({ error: 'Missing event type' });
    }

    try {
      const result = await processWebhook(integration, eventType, payload);
      
      return {
        success: true,
        processed: result.processed,
        action: result.action,
      };
    } catch (error) {
      logger.error({ integration, eventType, error }, 'Webhook processing error');
      
      // Return 200 to prevent retries for permanent failures
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Processing failed',
      };
    }
  }

  /**
   * Extract event type from payload based on integration
   */
  function extractEventType(
    integration: IntegrationType,
    payload: Record<string, unknown>,
    headers: Record<string, unknown>
  ): string | null {
    switch (integration) {
      case 'quickbooks':
        // QuickBooks uses eventNotifications array
        const notifications = payload.eventNotifications as Array<{
          realmId: string;
          dataChangeEvent: { entities: Array<{ name: string; operation: string }> };
        }>;
        if (notifications?.[0]?.dataChangeEvent?.entities?.[0]) {
          const entity = notifications[0].dataChangeEvent.entities[0];
          return `${entity.name}.${entity.operation}`;
        }
        return null;

      case 'ramp':
        // Ramp uses 'type' field
        return payload.type as string || null;

      case 'customerio':
        // Customer.io uses 'event_type' field
        return payload.event_type as string || payload.type as string || null;

      default:
        return payload.event || payload.type || payload.event_type as string || null;
    }
  }

  // Webhook verification endpoint (for initial setup)
  fastify.get('/:integration/verify', async (request, reply) => {
    const { integration } = request.params as { integration: string };
    const challenge = (request.query as Record<string, string>).challenge;

    // Some providers send a verification challenge
    if (challenge) {
      return { challenge };
    }

    return { status: 'ok', integration };
  });
};

export default webhookRoutes;
