/**
 * Operator Routes
 * WO-2, WO-46: Operator Management API
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { operatorService } from '../services/operatorService.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';

const createOperatorSchema = z.object({
  displayName: z.string().min(1).max(100),
  legalName: z.string().optional(),
  operatorType: z.enum(['sportsbook', 'casino', 'dfs', 'sweepstakes']),
  logoUrl: z.string().url().optional(),
  websiteUrl: z.string().url().optional(),
  affiliatePortalUrl: z.string().url().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  notes: z.string().optional(),
});

const stateAvailabilitySchema = z.object({
  stateCode: z.string().length(2),
  isLive: z.boolean(),
  launchDate: z.string().optional(),
  restrictions: z.string().optional(),
});

const bulkStateSchema = z.object({
  states: z.array(z.object({
    stateCode: z.string().length(2),
    isLive: z.boolean(),
    launchDate: z.string().optional(),
  })),
});

export async function operatorRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticate);

  /**
   * GET /operators - List all operators
   */
  fastify.get('/', async (request) => {
    const { activeOnly } = request.query as { activeOnly?: string };
    const operators = await operatorService.getAll(activeOnly !== 'false');
    return { success: true, data: operators };
  });

  /**
   * GET /operators/by-state/:stateCode - Get operators by state
   */
  fastify.get('/by-state/:stateCode', {
    preHandler: [validateParams(z.object({ stateCode: z.string().length(2) }))],
  }, async (request) => {
    const { stateCode } = request.params as { stateCode: string };
    const { type } = request.query as { type?: string };
    const operators = await operatorService.getByState(stateCode, type);
    return { success: true, data: operators };
  });

  /**
   * GET /operators/states-summary - Get all states summary
   */
  fastify.get('/states-summary', async () => {
    const summary = await operatorService.getStatesSummary();
    return { success: true, data: summary };
  });

  /**
   * GET /operators/:id - Get operator by ID
   */
  fastify.get('/:id', {
    preHandler: [validateParams(z.object({ id: z.string().transform(Number) }))],
  }, async (request, reply) => {
    const { id } = request.params as { id: number };
    const operator = await operatorService.getById(id);
    
    if (!operator) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Operator not found' },
      });
    }

    return { success: true, data: operator };
  });

  /**
   * GET /operators/:id/states - Get state availability
   */
  fastify.get('/:id/states', {
    preHandler: [validateParams(z.object({ id: z.string().transform(Number) }))],
  }, async (request) => {
    const { id } = request.params as { id: number };
    const states = await operatorService.getStateAvailability(id);
    return { success: true, data: states };
  });

  /**
   * GET /operators/:id/stats - Get operator stats
   */
  fastify.get('/:id/stats', {
    preHandler: [validateParams(z.object({ id: z.string().transform(Number) }))],
  }, async (request) => {
    const { id } = request.params as { id: number };
    const { from, to } = request.query as { from?: string; to?: string };
    const stats = await operatorService.getStats(id, from, to);
    return { success: true, data: stats };
  });

  /**
   * POST /operators - Create operator
   */
  fastify.post('/', {
    preHandler: [requireRole('admin'), validateBody(createOperatorSchema)],
  }, async (request, reply) => {
    const input = request.body as z.infer<typeof createOperatorSchema>;
    const operator = await operatorService.create(input);
    return reply.status(201).send({ success: true, data: operator });
  });

  /**
   * PUT /operators/:id - Update operator
   */
  fastify.put('/:id', {
    preHandler: [
      requireRole('admin'),
      validateParams(z.object({ id: z.string().transform(Number) })),
      validateBody(createOperatorSchema.partial()),
    ],
  }, async (request, reply) => {
    const { id } = request.params as { id: number };
    const updates = request.body as Partial<z.infer<typeof createOperatorSchema>>;

    const operator = await operatorService.update(id, updates);
    
    if (!operator) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Operator not found' },
      });
    }

    return { success: true, data: operator };
  });

  /**
   * POST /operators/:id/states - Set state availability
   */
  fastify.post('/:id/states', {
    preHandler: [
      requireRole('admin'),
      validateParams(z.object({ id: z.string().transform(Number) })),
      validateBody(stateAvailabilitySchema),
    ],
  }, async (request, reply) => {
    const { id } = request.params as { id: number };
    const input = request.body as z.infer<typeof stateAvailabilitySchema>;

    await operatorService.setStateAvailability(
      id,
      input.stateCode,
      input.isLive,
      input.launchDate,
      input.restrictions
    );

    return reply.status(201).send({ success: true, data: { updated: true } });
  });

  /**
   * POST /operators/:id/states/bulk - Bulk update states
   */
  fastify.post('/:id/states/bulk', {
    preHandler: [
      requireRole('admin'),
      validateParams(z.object({ id: z.string().transform(Number) })),
      validateBody(bulkStateSchema),
    ],
  }, async (request) => {
    const { id } = request.params as { id: number };
    const { states } = request.body as z.infer<typeof bulkStateSchema>;

    await operatorService.bulkSetStateAvailability(id, states);
    return { success: true, data: { updated: states.length } };
  });

  /**
   * PATCH /operators/:id/active - Toggle active status
   */
  fastify.patch('/:id/active', {
    preHandler: [
      requireRole('admin'),
      validateParams(z.object({ id: z.string().transform(Number) })),
      validateBody(z.object({ isActive: z.boolean() })),
    ],
  }, async (request, reply) => {
    const { id } = request.params as { id: number };
    const { isActive } = request.body as { isActive: boolean };

    const operator = await operatorService.setActive(id, isActive);
    
    if (!operator) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Operator not found' },
      });
    }

    return { success: true, data: operator };
  });

  /**
   * PATCH /operators/:id/sort - Update sort order
   */
  fastify.patch('/:id/sort', {
    preHandler: [
      requireRole('admin'),
      validateParams(z.object({ id: z.string().transform(Number) })),
      validateBody(z.object({ sortOrder: z.number().int() })),
    ],
  }, async (request) => {
    const { id } = request.params as { id: number };
    const { sortOrder } = request.body as { sortOrder: number };

    await operatorService.updateSortOrder(id, sortOrder);
    return { success: true, data: { updated: true } };
  });
}
