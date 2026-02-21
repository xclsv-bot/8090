/**
 * Budget Allocations Routes
 * WO-90: Budget allocation API endpoints
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { budgetAllocationService, BudgetCategory, ScopeType } from '../services/budgetAllocationService.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js';

// Validation schemas
const categoryEnum = z.enum(['payroll', 'materials', 'travel', 'venue', 'marketing', 'software', 'other']);
const scopeTypeEnum = z.enum(['event', 'region', 'period']);

const createAllocationSchema = z.object({
  name: z.string().min(1).max(255),
  category: categoryEnum,
  allocatedAmount: z.number().positive(),
  scopeType: scopeTypeEnum,
  scopeId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const updateAllocationSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  category: categoryEnum.optional(),
  allocatedAmount: z.number().positive().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const idParamSchema = z.object({
  id: z.string().uuid(),
});

const listQuerySchema = z.object({
  category: categoryEnum.optional(),
  scopeType: scopeTypeEnum.optional(),
  scopeId: z.string().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
});

const recalculateScopeSchema = z.object({
  scopeType: scopeTypeEnum,
  scopeId: z.string().min(1),
});

export async function budgetAllocationRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticate);

  // ============================================
  // CRUD OPERATIONS
  // ============================================

  /**
   * GET /budget-allocations - List all budget allocations
   */
  fastify.get('/', {
    preHandler: [requireRole('admin', 'manager')],
  }, async (request) => {
    const query = request.query as {
      category?: BudgetCategory;
      scopeType?: ScopeType;
      scopeId?: string;
      startDate?: string;
      endDate?: string;
      page?: string;
      limit?: string;
    };

    const result = await budgetAllocationService.list(
      {
        category: query.category,
        scopeType: query.scopeType,
        scopeId: query.scopeId,
        startDate: query.startDate,
        endDate: query.endDate,
      },
      query.page ? parseInt(query.page) : 1,
      query.limit ? parseInt(query.limit) : 50
    );

    return {
      success: true,
      data: result.items,
      meta: { total: result.total },
    };
  });

  /**
   * GET /budget-allocations/:id - Get single budget allocation
   */
  fastify.get('/:id', {
    preHandler: [requireRole('admin', 'manager'), validateParams(idParamSchema)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const allocation = await budgetAllocationService.getById(id);

    if (!allocation) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Budget allocation not found' },
      });
    }

    return { success: true, data: allocation };
  });

  /**
   * POST /budget-allocations - Create budget allocation
   */
  fastify.post('/', {
    preHandler: [requireRole('admin', 'manager'), validateBody(createAllocationSchema)],
  }, async (request, reply) => {
    const input = request.body as z.infer<typeof createAllocationSchema>;
    const allocation = await budgetAllocationService.create(input);

    return reply.status(201).send({ success: true, data: allocation });
  });

  /**
   * PUT /budget-allocations/:id - Update budget allocation
   */
  fastify.put('/:id', {
    preHandler: [
      requireRole('admin', 'manager'),
      validateParams(idParamSchema),
      validateBody(updateAllocationSchema),
    ],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const updates = request.body as z.infer<typeof updateAllocationSchema>;

    const allocation = await budgetAllocationService.update(id, updates);

    if (!allocation) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Budget allocation not found' },
      });
    }

    return { success: true, data: allocation };
  });

  /**
   * DELETE /budget-allocations/:id - Delete budget allocation
   */
  fastify.delete('/:id', {
    preHandler: [requireRole('admin'), validateParams(idParamSchema)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = await budgetAllocationService.delete(id);

    if (!deleted) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Budget allocation not found' },
      });
    }

    return { success: true, data: { deleted: true } };
  });

  // ============================================
  // RECALCULATION ENDPOINTS
  // ============================================

  /**
   * POST /budget-allocations/:id/recalculate - Recalculate spent for single allocation
   */
  fastify.post('/:id/recalculate', {
    preHandler: [requireRole('admin', 'manager'), validateParams(idParamSchema)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const allocation = await budgetAllocationService.recalculateSpent(id);

    if (!allocation) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Budget allocation not found' },
      });
    }

    return { success: true, data: allocation };
  });

  /**
   * POST /budget-allocations/recalculate-scope - Recalculate all allocations for a scope
   */
  fastify.post('/recalculate-scope', {
    preHandler: [requireRole('admin', 'manager'), validateBody(recalculateScopeSchema)],
  }, async (request) => {
    const { scopeType, scopeId } = request.body as { scopeType: ScopeType; scopeId: string };
    const count = await budgetAllocationService.recalculateAllForScope(scopeType, scopeId);

    return { success: true, data: { updatedCount: count } };
  });

  // ============================================
  // REPORTING ENDPOINTS
  // ============================================

  /**
   * GET /budget-allocations/reports/by-category - Get summary by category
   */
  fastify.get('/reports/by-category', {
    preHandler: [requireRole('admin', 'manager')],
  }, async (request) => {
    const query = request.query as {
      scopeType?: ScopeType;
      scopeId?: string;
      startDate?: string;
      endDate?: string;
    };

    const summary = await budgetAllocationService.getCategorySummary({
      scopeType: query.scopeType,
      scopeId: query.scopeId,
      startDate: query.startDate,
      endDate: query.endDate,
    });

    return { success: true, data: summary };
  });

  /**
   * GET /budget-allocations/reports/by-scope/:scopeType - Get summary by scope type
   */
  fastify.get('/reports/by-scope/:scopeType', {
    preHandler: [requireRole('admin', 'manager')],
  }, async (request, reply) => {
    const { scopeType } = request.params as { scopeType: string };

    if (!['event', 'region', 'period'].includes(scopeType)) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_SCOPE_TYPE', message: 'Invalid scope type' },
      });
    }

    const summary = await budgetAllocationService.getScopeSummary(scopeType as ScopeType);

    return { success: true, data: summary };
  });

  /**
   * GET /budget-allocations/reports/at-risk - Get allocations near or over budget
   */
  fastify.get('/reports/at-risk', {
    preHandler: [requireRole('admin', 'manager')],
  }, async (request) => {
    const { threshold } = request.query as { threshold?: string };
    const thresholdValue = threshold ? parseInt(threshold) : 90;

    const allocations = await budgetAllocationService.getAtRiskAllocations(thresholdValue);

    return { success: true, data: allocations };
  });

  /**
   * GET /budget-allocations/reports/overall - Get comprehensive budget report
   */
  fastify.get('/reports/overall', {
    preHandler: [requireRole('admin', 'manager')],
  }, async (request) => {
    const query = request.query as {
      scopeType?: ScopeType;
      scopeId?: string;
    };

    const report = await budgetAllocationService.getOverallReport({
      scopeType: query.scopeType,
      scopeId: query.scopeId,
    });

    return { success: true, data: report };
  });

  /**
   * GET /budget-allocations/event/:eventId - Get all allocations for an event
   */
  fastify.get('/event/:eventId', {
    preHandler: [requireRole('admin', 'manager')],
  }, async (request) => {
    const { eventId } = request.params as { eventId: string };

    const result = await budgetAllocationService.list({
      scopeType: 'event',
      scopeId: eventId,
    });

    return {
      success: true,
      data: result.items,
      meta: { total: result.total },
    };
  });

  /**
   * GET /budget-allocations/region/:region - Get all allocations for a region
   */
  fastify.get('/region/:region', {
    preHandler: [requireRole('admin', 'manager')],
  }, async (request) => {
    const { region } = request.params as { region: string };

    const result = await budgetAllocationService.list({
      scopeType: 'region',
      scopeId: region,
    });

    return {
      success: true,
      data: result.items,
      meta: { total: result.total },
    };
  });
}
