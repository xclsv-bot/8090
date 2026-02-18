/**
 * Integration Routes
 * WO-42, WO-43: Integration management API
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { integrationService } from '../services/integrationService.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateBody, validateParams, commonSchemas } from '../middleware/validate.js';

const createCredentialsSchema = z.object({
  integrationType: z.enum(['customerio', 'quickbooks', 'ramp', 'vision', 'clerk', 'aws']),
  name: z.string().min(1),
  credentials: z.record(z.string(), z.string()),
});

const syncScheduleSchema = z.object({
  integrationId: z.string().uuid(),
  syncType: z.string(),
  cronExpression: z.string(),
});

const webhookSchema = z.object({
  integrationId: z.string().uuid(),
  endpointUrl: z.string().url(),
  events: z.array(z.string()),
});

export async function integrationRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticate);

  /**
   * GET /integrations - List all integrations
   */
  fastify.get('/', {
    preHandler: [requireRole('admin')],
  }, async () => {
    const integrations = await integrationService.listIntegrations();
    return { success: true, data: integrations };
  });

  /**
   * POST /integrations/credentials - Create credentials
   */
  fastify.post('/credentials', {
    preHandler: [requireRole('admin'), validateBody(createCredentialsSchema)],
  }, async (request, reply) => {
    const { integrationType, name, credentials } = request.body as z.infer<typeof createCredentialsSchema>;
    
    const result = await integrationService.createCredentials(
      integrationType,
      name,
      credentials,
      request.user?.id
    );

    return reply.status(201).send({ success: true, data: result });
  });

  /**
   * PATCH /integrations/:id/status - Update status
   */
  fastify.patch('/:id/status', {
    preHandler: [
      requireRole('admin'),
      validateParams(commonSchemas.id),
      validateBody(z.object({ isActive: z.boolean() })),
    ],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const { isActive } = request.body as { isActive: boolean };

    await integrationService.updateStatus(id, isActive);
    return { success: true, data: { updated: true } };
  });

  /**
   * POST /integrations/schedules - Create sync schedule
   */
  fastify.post('/schedules', {
    preHandler: [requireRole('admin'), validateBody(syncScheduleSchema)],
  }, async (request, reply) => {
    const input = request.body as z.infer<typeof syncScheduleSchema>;
    const schedule = await integrationService.createSyncSchedule(
      input.integrationId,
      input.syncType,
      input.cronExpression
    );

    return reply.status(201).send({ success: true, data: schedule });
  });

  /**
   * GET /integrations/schedules/pending - Get pending syncs
   */
  fastify.get('/schedules/pending', {
    preHandler: [requireRole('admin')],
  }, async () => {
    const pending = await integrationService.getPendingSyncs();
    return { success: true, data: pending };
  });

  /**
   * POST /integrations/schedules/:id/execute - Execute sync
   */
  fastify.post('/schedules/:id/execute', {
    preHandler: [requireRole('admin'), validateParams(commonSchemas.id)],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const result = await integrationService.executeSync(id);
    return { success: true, data: result };
  });

  /**
   * POST /integrations/webhooks - Create webhook
   */
  fastify.post('/webhooks', {
    preHandler: [requireRole('admin'), validateBody(webhookSchema)],
  }, async (request, reply) => {
    const input = request.body as z.infer<typeof webhookSchema>;
    const webhook = await integrationService.createWebhook(
      input.integrationId,
      input.endpointUrl,
      input.events
    );

    return reply.status(201).send({ success: true, data: webhook });
  });

  /**
   * POST /integrations/webhooks/verify - Verify webhook signature
   */
  fastify.post('/webhooks/verify', {
    preHandler: [validateBody(z.object({
      payload: z.string(),
      signature: z.string(),
      secret: z.string(),
    }))],
  }, async (request) => {
    const { payload, signature, secret } = request.body as { 
      payload: string; 
      signature: string; 
      secret: string 
    };
    
    const valid = integrationService.verifyWebhookSignature(payload, signature, secret);
    return { success: true, data: { valid } };
  });
}
