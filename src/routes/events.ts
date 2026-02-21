/**
 * Event API Routes
 * WO-29: Event CRUD API and basic operations
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eventService } from '../services/eventService.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateBody, validateQuery, validateParams, commonSchemas } from '../middleware/validate.js';

const createEventSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  eventType: z.enum(['activation', 'promotion', 'tournament', 'watch_party', 'corporate', 'other']).optional(),
  venue: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  region: z.string().optional(),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  timezone: z.string().optional(),
  venueContactName: z.string().optional(),
  venueContactPhone: z.string().optional(),
  venueContactEmail: z.string().email().optional(),
  expectedAttendance: z.number().int().positive().optional(),
  budget: z.number().positive().optional(),
  minAmbassadors: z.number().int().positive().optional(),
  maxAmbassadors: z.number().int().positive().optional(),
  requiredSkillLevel: z.enum(['trainee', 'standard', 'senior', 'lead']).optional(),
  operatorIds: z.array(z.number().int().positive()).optional(),
});

const updateEventSchema = createEventSchema.partial().omit({ operatorIds: true });

const searchSchema = z.object({
  status: z.enum(['planned', 'confirmed', 'active', 'completed', 'cancelled']).optional(),
  eventType: z.enum(['activation', 'promotion', 'tournament', 'watch_party', 'corporate', 'other']).optional(),
  region: z.string().optional(),
  state: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  search: z.string().optional(),
  page: z.string().optional().default('1').transform(Number),
  limit: z.string().optional().default('20').transform(Number),
});

export async function eventRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticate);

  /**
   * GET /events - List/search events
   */
  fastify.get('/', {
    preHandler: [validateQuery(searchSchema)],
  }, async (request) => {
    const query = request.query as z.infer<typeof searchSchema>;
    const result = await eventService.search(query, query.page, query.limit);

    return {
      success: true,
      data: result.items,
      meta: { page: result.page, limit: result.limit, total: result.total },
    };
  });

  /**
   * GET /events/upcoming - Get upcoming events
   */
  fastify.get('/upcoming', async (request) => {
    const limit = (request.query as { limit?: string }).limit;
    const events = await eventService.getUpcoming(limit ? parseInt(limit) : 10);
    return { success: true, data: events };
  });

  /**
   * GET /events/:id - Get event by ID
   */
  fastify.get('/:id', {
    preHandler: [validateParams(commonSchemas.id)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const event = await eventService.getWithDetails(id);
    
    if (!event) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Event not found' },
      });
    }

    return { success: true, data: event };
  });

  /**
   * POST /events - Create event
   */
  fastify.post('/', {
    preHandler: [requireRole('admin', 'manager'), validateBody(createEventSchema)],
  }, async (request, reply) => {
    const input = request.body as z.infer<typeof createEventSchema>;
    const event = await eventService.create(input, request.user?.id);

    return reply.status(201).send({ success: true, data: event });
  });

  /**
   * PUT /events/:id - Update event
   */
  fastify.put('/:id', {
    preHandler: [requireRole('admin', 'manager'), validateParams(commonSchemas.id), validateBody(updateEventSchema)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = request.body as z.infer<typeof updateEventSchema>;
    const event = await eventService.update(id, input, request.user?.id);
    
    if (!event) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Event not found' },
      });
    }

    return { success: true, data: event };
  });

  /**
   * PATCH /events/:id/status - Update event status
   */
  fastify.patch('/:id/status', {
    preHandler: [
      requireRole('admin', 'manager'),
      validateParams(commonSchemas.id),
      validateBody(z.object({
        status: z.enum(['planned', 'confirmed', 'active', 'completed', 'cancelled']),
        reason: z.string().optional(),
      })),
    ],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status, reason } = request.body as { status: string; reason?: string };

    try {
      const event = await eventService.updateStatus(id, status as any, request.user?.id, reason);
      
      if (!event) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Event not found' },
        });
      }

      return { success: true, data: event };
    } catch (error: any) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_TRANSITION', message: error.message },
      });
    }
  });

  /**
   * DELETE /events/:id - Delete event (soft or hard)
   * Query params:
   *   - hard=true: permanently delete from database
   *   - reason: cancellation reason (for soft delete)
   */
  fastify.delete('/:id', {
    preHandler: [requireRole('admin'), validateParams(commonSchemas.id)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { reason, hard } = request.query as { reason?: string; hard?: string };

    const isHardDelete = hard === 'true';
    
    let deleted: boolean;
    if (isHardDelete) {
      deleted = await eventService.hardDelete(id);
    } else {
      deleted = await eventService.delete(id, request.user?.id, reason);
    }
    
    if (!deleted) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Event not found' },
      });
    }

    return { success: true, data: { deleted: isHardDelete, cancelled: !isHardDelete } };
  });
}

// ============================================
// EVENT BUDGET ENDPOINTS (WO-96)
// ============================================

/**
 * GET /events/:id/budget - Get event budget
 */
fastify.get('/:id/budget', {
  preHandler: [requireRole('admin', 'manager')],
}, async (request) => {
  const { id } = request.params as { id: string };
  
  const budget = await db.queryOne<{
    id: string;
    event_id: string;
    budget_staff: string | null;
    budget_reimbursements: string | null;
    budget_rewards: string | null;
    budget_base: string | null;
    budget_bonus_kickback: string | null;
    budget_parking: string | null;
    budget_setup: string | null;
    budget_additional_1: string | null;
    budget_additional_2: string | null;
    budget_additional_3: string | null;
    budget_additional_4: string | null;
    budget_total: string | null;
    projected_signups: number | null;
    projected_revenue: string | null;
    projected_profit: string | null;
    notes: string | null;
  }>('SELECT * FROM event_budgets WHERE event_id = $1', [id]);
  
  return { success: true, data: budget };
});

/**
 * PUT /events/:id/budget - Create or update event budget
 */
fastify.put('/:id/budget', {
  preHandler: [requireRole('admin', 'manager')],
}, async (request) => {
  const { id } = request.params as { id: string };
  const body = request.body as {
    budgetStaff?: number;
    budgetReimbursements?: number;
    budgetRewards?: number;
    budgetBase?: number;
    budgetBonusKickback?: number;
    budgetParking?: number;
    budgetSetup?: number;
    budgetAdditional1?: number;
    budgetAdditional2?: number;
    budgetAdditional3?: number;
    budgetAdditional4?: number;
    projectedSignups?: number;
    projectedRevenue?: number;
    notes?: string;
  };
  
  // Calculate totals
  const budgetTotal = (body.budgetStaff || 0) + (body.budgetReimbursements || 0) + 
    (body.budgetRewards || 0) + (body.budgetBase || 0) + (body.budgetBonusKickback || 0) +
    (body.budgetParking || 0) + (body.budgetSetup || 0) + (body.budgetAdditional1 || 0) +
    (body.budgetAdditional2 || 0) + (body.budgetAdditional3 || 0) + (body.budgetAdditional4 || 0);
  
  const projectedProfit = (body.projectedRevenue || 0) - budgetTotal;
  
  // Check if budget exists
  const existing = await db.queryOne<{ id: string }>('SELECT id FROM event_budgets WHERE event_id = $1', [id]);
  
  if (existing) {
    // Update
    await db.query(`
      UPDATE event_budgets SET
        budget_staff = $2,
        budget_reimbursements = $3,
        budget_rewards = $4,
        budget_base = $5,
        budget_bonus_kickback = $6,
        budget_parking = $7,
        budget_setup = $8,
        budget_additional_1 = $9,
        budget_additional_2 = $10,
        budget_additional_3 = $11,
        budget_additional_4 = $12,
        budget_total = $13,
        projected_signups = $14,
        projected_revenue = $15,
        projected_profit = $16,
        notes = $17,
        updated_at = NOW()
      WHERE event_id = $1
    `, [id, body.budgetStaff, body.budgetReimbursements, body.budgetRewards, body.budgetBase,
        body.budgetBonusKickback, body.budgetParking, body.budgetSetup, body.budgetAdditional1,
        body.budgetAdditional2, body.budgetAdditional3, body.budgetAdditional4, budgetTotal,
        body.projectedSignups, body.projectedRevenue, projectedProfit, body.notes]);
  } else {
    // Insert
    await db.query(`
      INSERT INTO event_budgets (
        id, event_id, budget_staff, budget_reimbursements, budget_rewards, budget_base,
        budget_bonus_kickback, budget_parking, budget_setup, budget_additional_1,
        budget_additional_2, budget_additional_3, budget_additional_4, budget_total,
        projected_signups, projected_revenue, projected_profit, notes, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW()
      )
    `, [id, body.budgetStaff, body.budgetReimbursements, body.budgetRewards, body.budgetBase,
        body.budgetBonusKickback, body.budgetParking, body.budgetSetup, body.budgetAdditional1,
        body.budgetAdditional2, body.budgetAdditional3, body.budgetAdditional4, budgetTotal,
        body.projectedSignups, body.projectedRevenue, projectedProfit, body.notes]);
  }
  
  // Return updated budget
  const budget = await db.queryOne('SELECT * FROM event_budgets WHERE event_id = $1', [id]);
  return { success: true, data: budget };
});
