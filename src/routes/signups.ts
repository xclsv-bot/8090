/**
 * Signup Routes
 * WO-53, WO-54: Sign-Up Management API
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { signupService } from '../services/signupService.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery, commonSchemas } from '../middleware/validate.js';

const createSignupSchema = z.object({
  eventId: z.string().uuid().optional(),
  ambassadorId: z.string().uuid(),
  operatorId: z.number().int().positive(),
  customerFirstName: z.string().min(1).max(100),
  customerLastName: z.string().min(1).max(100),
  customerEmail: z.string().email(),
  customerPhone: z.string().optional(),
  customerState: z.string().length(2).optional(),
  depositAmount: z.number().positive().optional(),
  promoCode: z.string().optional(),
});

const searchSchema = z.object({
  eventId: z.string().uuid().optional(),
  ambassadorId: z.string().uuid().optional(),
  operatorId: z.string().transform(Number).optional(),
  status: z.enum(['pending', 'confirmed', 'invalid', 'duplicate']).optional(),
  validationStatus: z.enum(['pending', 'validated', 'rejected', 'duplicate']).optional(),
  customerState: z.string().length(2).optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  search: z.string().optional(),
  page: z.string().optional().default('1').transform(Number),
  limit: z.string().optional().default('50').transform(Number),
});

export async function signupRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticate);

  /**
   * GET /signups - Search signups
   */
  fastify.get('/', {
    preHandler: [validateQuery(searchSchema)],
  }, async (request) => {
    const query = request.query as z.infer<typeof searchSchema>;
    const result = await signupService.search(query, query.page, query.limit);

    return {
      success: true,
      data: result.items,
      meta: { page: result.page, limit: result.limit, total: result.total },
    };
  });

  /**
   * GET /signups/queue - Get validation queue
   */
  fastify.get('/queue', {
    preHandler: [requireRole('admin', 'manager')],
  }, async (request) => {
    const { limit } = request.query as { limit?: string };
    const queue = await signupService.getValidationQueue(limit ? parseInt(limit) : 50);
    return { success: true, data: queue };
  });

  /**
   * GET /signups/stats - Get signup statistics
   */
  fastify.get('/stats', {
    preHandler: [requireRole('admin', 'manager')],
  }, async (request) => {
    const { from, to } = request.query as { from?: string; to?: string };
    const stats = await signupService.getStats(from, to);
    return { success: true, data: stats };
  });

  /**
   * GET /signups/:id - Get signup by ID
   */
  fastify.get('/:id', {
    preHandler: [validateParams(commonSchemas.id)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const signup = await signupService.getById(id);
    
    if (!signup) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Signup not found' },
      });
    }

    return { success: true, data: signup };
  });

  /**
   * POST /signups - Create signup
   */
  fastify.post('/', {
    preHandler: [validateBody(createSignupSchema)],
  }, async (request, reply) => {
    const input = request.body as z.infer<typeof createSignupSchema>;
    
    try {
      const signup = await signupService.create(input, request.user?.id);
      return reply.status(201).send({ success: true, data: signup });
    } catch (error: any) {
      if (error.message.includes('Duplicate')) {
        return reply.status(409).send({
          success: false,
          error: { code: 'DUPLICATE', message: error.message },
        });
      }
      throw error;
    }
  });

  /**
   * POST /signups/bulk - Bulk import signups
   */
  fastify.post('/bulk', {
    preHandler: [
      requireRole('admin', 'manager'),
      validateBody(z.object({
        batchName: z.string(),
        signups: z.array(createSignupSchema),
      })),
    ],
  }, async (request) => {
    const { batchName, signups } = request.body as { 
      batchName: string; 
      signups: z.infer<typeof createSignupSchema>[] 
    };
    
    const result = await signupService.bulkImport(signups, batchName, request.user?.id);
    return { success: true, data: result };
  });

  /**
   * POST /signups/extract - Extract signup data from text
   */
  fastify.post('/extract', {
    preHandler: [validateBody(z.object({ text: z.string().min(1) }))],
  }, async (request) => {
    const { text } = request.body as { text: string };
    const result = await signupService.extractFromText(text);
    return { success: true, data: result };
  });

  /**
   * PATCH /signups/:id/validate - Update validation status
   */
  fastify.patch('/:id/validate', {
    preHandler: [
      requireRole('admin', 'manager'),
      validateParams(commonSchemas.id),
      validateBody(z.object({
        status: z.enum(['validated', 'rejected', 'duplicate']),
        notes: z.string().optional(),
      })),
    ],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status, notes } = request.body as { status: string; notes?: string };

    const signup = await signupService.updateValidation(
      id, 
      status as any, 
      request.user?.id, 
      notes
    );
    
    if (!signup) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Signup not found' },
      });
    }

    return { success: true, data: signup };
  });

  /**
   * POST /signups/check-duplicate - Check for duplicate
   */
  fastify.post('/check-duplicate', {
    preHandler: [validateBody(z.object({
      email: z.string().email(),
      operatorId: z.number().int().positive(),
    }))],
  }, async (request) => {
    const { email, operatorId } = request.body as { email: string; operatorId: number };
    const duplicate = await signupService.checkDuplicate(email, operatorId);
    return { 
      success: true, 
      data: { 
        isDuplicate: !!duplicate, 
        existingSignupId: duplicate?.id 
      } 
    };
  });
}
