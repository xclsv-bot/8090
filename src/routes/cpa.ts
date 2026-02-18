/**
 * CPA Routes
 * WO-23: CPA rate management API
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { cpaService } from '../services/cpaService.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery, commonSchemas } from '../middleware/validate.js';

const createRateSchema = z.object({
  operatorId: z.number().int().positive(),
  stateCode: z.string().length(2),
  rateType: z.enum(['cpa', 'rev_share', 'hybrid']),
  cpaAmount: z.number().positive().optional(),
  revSharePercentage: z.number().min(0).max(100).optional(),
  minDeposit: z.number().positive().optional(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  tier: z.string().optional(),
});

const updateRateSchema = createRateSchema.partial().omit({ operatorId: true, stateCode: true });

export async function cpaRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticate);

  /**
   * GET /cpa/rates - Get rate summary
   */
  fastify.get('/rates', async () => {
    const summary = await cpaService.getRateSummary();
    return { success: true, data: summary };
  });

  /**
   * GET /cpa/rates/operator/:operatorId - Get rates by operator
   */
  fastify.get('/rates/operator/:operatorId', {
    preHandler: [validateParams(z.object({ operatorId: z.string().transform(Number) }))],
  }, async (request) => {
    const { operatorId } = request.params as { operatorId: number };
    const { activeOnly } = request.query as { activeOnly?: string };
    const rates = await cpaService.getRatesByOperator(operatorId, activeOnly !== 'false');
    return { success: true, data: rates };
  });

  /**
   * GET /cpa/rates/state/:stateCode - Get rates by state
   */
  fastify.get('/rates/state/:stateCode', {
    preHandler: [validateParams(z.object({ stateCode: z.string().length(2) }))],
  }, async (request) => {
    const { stateCode } = request.params as { stateCode: string };
    const { date } = request.query as { date?: string };
    const rates = await cpaService.getRatesByState(stateCode, date);
    return { success: true, data: rates };
  });

  /**
   * GET /cpa/rates/:id - Get rate by ID
   */
  fastify.get('/rates/:id', {
    preHandler: [validateParams(commonSchemas.id)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const rate = await cpaService.getRateById(id);
    
    if (!rate) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Rate not found' },
      });
    }

    return { success: true, data: rate };
  });

  /**
   * GET /cpa/lookup - Look up current rate
   */
  fastify.get('/lookup', {
    preHandler: [validateQuery(z.object({
      operatorId: z.string().transform(Number),
      stateCode: z.string().length(2),
      date: z.string().optional(),
    }))],
  }, async (request) => {
    const { operatorId, stateCode, date } = request.query as { 
      operatorId: number; 
      stateCode: string; 
      date?: string 
    };
    const rate = await cpaService.getRate(operatorId, stateCode, date);
    return { success: true, data: rate };
  });

  /**
   * POST /cpa/rates - Create rate
   */
  fastify.post('/rates', {
    preHandler: [requireRole('admin', 'manager'), validateBody(createRateSchema)],
  }, async (request, reply) => {
    const input = request.body as z.infer<typeof createRateSchema>;
    const rate = await cpaService.createRate(input);
    return reply.status(201).send({ success: true, data: rate });
  });

  /**
   * PUT /cpa/rates/:id - Update rate
   */
  fastify.put('/rates/:id', {
    preHandler: [
      requireRole('admin', 'manager'),
      validateParams(commonSchemas.id),
      validateBody(updateRateSchema),
    ],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const updates = request.body as z.infer<typeof updateRateSchema>;

    const rate = await cpaService.updateRate(id, updates);
    
    if (!rate) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Rate not found' },
      });
    }

    return { success: true, data: rate };
  });

  /**
   * DELETE /cpa/rates/:id - Deactivate rate
   */
  fastify.delete('/rates/:id', {
    preHandler: [requireRole('admin'), validateParams(commonSchemas.id)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const deactivated = await cpaService.deactivateRate(id);
    
    if (!deactivated) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Rate not found' },
      });
    }

    return { success: true, data: { deactivated: true } };
  });

  /**
   * POST /cpa/rates/bulk - Bulk import rates
   */
  fastify.post('/rates/bulk', {
    preHandler: [
      requireRole('admin'),
      validateBody(z.object({ rates: z.array(createRateSchema) })),
    ],
  }, async (request) => {
    const { rates } = request.body as { rates: z.infer<typeof createRateSchema>[] };
    const result = await cpaService.bulkImport(rates);
    return { success: true, data: result };
  });

  /**
   * POST /cpa/calculate/:signupId - Calculate CPA for signup
   */
  fastify.post('/calculate/:id', {
    preHandler: [validateParams(commonSchemas.id)],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const cpaAmount = await cpaService.calculateSignupCpa(id);
    return { success: true, data: { signupId: id, cpaAmount } };
  });

  /**
   * GET /cpa/tiers - Get CPA tiers
   */
  fastify.get('/tiers', async (request) => {
    const { operatorId } = request.query as { operatorId?: string };
    const tiers = await cpaService.getTiers(operatorId ? parseInt(operatorId) : undefined);
    return { success: true, data: tiers };
  });
}
