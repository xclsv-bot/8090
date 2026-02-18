/**
 * Ambassador API Routes
 * WO-10: Ambassador CRUD API and profile management
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ambassadorService } from '../services/ambassadorService.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateBody, validateQuery, validateParams, commonSchemas } from '../middleware/validate.js';

// Validation schemas
const createAmbassadorSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().optional(),
  skillLevel: z.enum(['trainee', 'standard', 'senior', 'lead']).optional(),
  compensationType: z.enum(['per_signup', 'hourly', 'hybrid']).optional(),
  hourlyRate: z.number().positive().optional(),
  perSignupRate: z.number().positive().optional(),
  notes: z.string().optional(),
});

const updateAmbassadorSchema = createAmbassadorSchema.partial().extend({
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
});

const searchSchema = z.object({
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
  skillLevel: z.enum(['trainee', 'standard', 'senior', 'lead']).optional(),
  search: z.string().optional(),
  minPerformanceScore: z.string().optional().transform(v => v ? parseFloat(v) : undefined),
  page: z.string().optional().default('1').transform(Number),
  limit: z.string().optional().default('20').transform(Number),
});

export async function ambassadorRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.addHook('preHandler', authenticate);

  /**
   * GET /ambassadors - List/search ambassadors
   */
  fastify.get('/', {
    preHandler: [validateQuery(searchSchema)],
  }, async (request) => {
    const query = request.query as z.infer<typeof searchSchema>;
    
    const result = await ambassadorService.search(
      {
        status: query.status,
        skillLevel: query.skillLevel,
        search: query.search,
        minPerformanceScore: query.minPerformanceScore,
      },
      query.page,
      query.limit
    );

    return {
      success: true,
      data: result.items,
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
    };
  });

  /**
   * GET /ambassadors/active - Get all active ambassadors (for dropdowns)
   */
  fastify.get('/active', async () => {
    const ambassadors = await ambassadorService.getAllActive();
    return { success: true, data: ambassadors };
  });

  /**
   * GET /ambassadors/stats - Get ambassador counts by status
   */
  fastify.get('/stats', {
    preHandler: [requireRole('admin', 'manager')],
  }, async () => {
    const counts = await ambassadorService.countByStatus();
    return { success: true, data: counts };
  });

  /**
   * GET /ambassadors/:id - Get ambassador by ID
   */
  fastify.get('/:id', {
    preHandler: [validateParams(commonSchemas.id)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    
    const ambassador = await ambassadorService.getWithStats(id);
    
    if (!ambassador) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Ambassador not found' },
      });
    }

    return { success: true, data: ambassador };
  });

  /**
   * POST /ambassadors - Create new ambassador
   */
  fastify.post('/', {
    preHandler: [requireRole('admin', 'manager'), validateBody(createAmbassadorSchema)],
  }, async (request, reply) => {
    const input = request.body as z.infer<typeof createAmbassadorSchema>;
    
    // Check for existing email
    const existing = await ambassadorService.getByEmail(input.email);
    if (existing) {
      return reply.status(409).send({
        success: false,
        error: { code: 'CONFLICT', message: 'Ambassador with this email already exists' },
      });
    }

    const ambassador = await ambassadorService.create(input, request.user?.id);

    return reply.status(201).send({
      success: true,
      data: ambassador,
    });
  });

  /**
   * PUT /ambassadors/:id - Update ambassador
   */
  fastify.put('/:id', {
    preHandler: [
      requireRole('admin', 'manager'),
      validateParams(commonSchemas.id),
      validateBody(updateAmbassadorSchema),
    ],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = request.body as z.infer<typeof updateAmbassadorSchema>;

    const ambassador = await ambassadorService.update(id, input, request.user?.id);
    
    if (!ambassador) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Ambassador not found' },
      });
    }

    return { success: true, data: ambassador };
  });

  /**
   * PATCH /ambassadors/:id/status - Update ambassador status
   */
  fastify.patch('/:id/status', {
    preHandler: [
      requireRole('admin', 'manager'),
      validateParams(commonSchemas.id),
      validateBody(z.object({
        status: z.enum(['active', 'inactive', 'suspended']),
        reason: z.string().optional(),
      })),
    ],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status, reason } = request.body as { status: string; reason?: string };

    const ambassador = await ambassadorService.updateStatus(
      id, 
      status as 'active' | 'inactive' | 'suspended',
      request.user?.id,
      reason
    );
    
    if (!ambassador) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Ambassador not found' },
      });
    }

    return { success: true, data: ambassador };
  });

  /**
   * DELETE /ambassadors/:id - Delete ambassador (soft delete)
   */
  fastify.delete('/:id', {
    preHandler: [requireRole('admin'), validateParams(commonSchemas.id)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const deleted = await ambassadorService.delete(id, request.user?.id);
    
    if (!deleted) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Ambassador not found' },
      });
    }

    return { success: true, data: { deleted: true } };
  });
}
