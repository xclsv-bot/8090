/**
 * Pay Statement Routes - WO-91
 * API endpoints for detailed pay statements, line items, and rate management
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { payStatementService } from '../services/payStatementService.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery, commonSchemas } from '../middleware/validate.js';

// Validation schemas
const lineItemSchema = z.object({
  type: z.enum(['earning', 'deduction', 'bonus']),
  description: z.string().min(1).max(500),
  amount: z.number().positive(),
  sourceType: z.enum(['signup', 'event_assignment', 'bonus_rule', 'manual_adjustment', 'correction', 'expense_reimbursement']).optional(),
  sourceId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const paymentSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(['direct_deposit', 'check', 'paypal', 'venmo', 'wire', 'other']),
  externalReference: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const paymentStatusSchema = z.object({
  status: z.enum(['pending', 'processing', 'completed', 'failed', 'reversed']),
  failureReason: z.string().optional(),
});

const rateSchema = z.object({
  rateType: z.enum(['per_signup', 'hourly', 'daily', 'flat', 'bonus_tier']),
  rateAmount: z.number().positive(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  reason: z.string().optional(),
});

const searchQuerySchema = z.object({
  ambassadorId: z.string().optional(),
  payPeriodId: z.string().optional(),
  status: z.enum(['draft', 'pending', 'approved', 'processing', 'paid', 'failed', 'cancelled']).optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  minAmount: z.coerce.number().optional(),
  maxAmount: z.coerce.number().optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  offset: z.coerce.number().min(0).optional(),
});

export async function payStatementsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticate);

  // ==================== STATEMENTS ====================

  /**
   * GET /pay-statements - Search pay statements
   */
  fastify.get('/', {
    preHandler: [requireRole('admin', 'manager'), validateQuery(searchQuerySchema)],
  }, async (request) => {
    const params = request.query as z.infer<typeof searchQuerySchema>;
    const result = await payStatementService.searchStatements(params);
    return {
      success: true,
      data: result.statements,
      meta: { total: result.total, limit: params.limit || 50, offset: params.offset || 0 },
    };
  });

  /**
   * GET /pay-statements/stats - Get statement statistics
   */
  fastify.get('/stats', {
    preHandler: [requireRole('admin', 'manager')],
  }, async (request) => {
    const { payPeriodId } = request.query as { payPeriodId?: string };
    const stats = await payStatementService.getStats(payPeriodId);
    return { success: true, data: stats };
  });

  /**
   * GET /pay-statements/:id - Get statement by ID
   */
  fastify.get('/:id', {
    preHandler: [validateParams(commonSchemas.id)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const statement = await payStatementService.getStatementById(id);

    if (!statement) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Pay statement not found' },
      });
    }

    // Ambassadors can only view their own statements
    if (request.user?.role === 'ambassador' && statement.ambassadorId !== request.user.id) {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied' },
      });
    }

    return { success: true, data: statement };
  });

  /**
   * POST /pay-statements/calculate - Calculate statement for ambassador/period
   */
  fastify.post('/calculate', {
    preHandler: [
      requireRole('admin', 'manager'),
      validateBody(z.object({
        ambassadorId: z.string(),
        payPeriodId: z.string(),
      })),
    ],
  }, async (request) => {
    const { ambassadorId, payPeriodId } = request.body as { ambassadorId: string; payPeriodId: string };
    const calculation = await payStatementService.calculateStatement(ambassadorId, payPeriodId);
    return { success: true, data: calculation };
  });

  /**
   * PATCH /pay-statements/:id/status - Update statement status
   */
  fastify.patch('/:id/status', {
    preHandler: [
      requireRole('admin', 'manager'),
      validateParams(commonSchemas.id),
      validateBody(z.object({
        status: z.enum(['draft', 'pending', 'approved', 'processing', 'paid', 'failed', 'cancelled']),
      })),
    ],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status } = request.body as { status: string };

    const statement = await payStatementService.updateStatementStatus(id, status as any);
    
    if (!statement) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Pay statement not found' },
      });
    }

    return { success: true, data: statement };
  });

  // ==================== LINE ITEMS ====================

  /**
   * GET /pay-statements/:id/line-items - Get line items for statement
   */
  fastify.get('/:id/line-items', {
    preHandler: [validateParams(commonSchemas.id)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    // Verify statement exists and user has access
    const statement = await payStatementService.getStatementById(id);
    if (!statement) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Pay statement not found' },
      });
    }

    if (request.user?.role === 'ambassador' && statement.ambassadorId !== request.user.id) {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied' },
      });
    }

    const lineItems = await payStatementService.getLineItems(id);
    return { success: true, data: lineItems };
  });

  /**
   * POST /pay-statements/:id/line-items - Add line item
   */
  fastify.post('/:id/line-items', {
    preHandler: [
      requireRole('admin', 'manager'),
      validateParams(commonSchemas.id),
      validateBody(lineItemSchema),
    ],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = request.body as z.infer<typeof lineItemSchema>;

    const statement = await payStatementService.getStatementById(id);
    if (!statement) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Pay statement not found' },
      });
    }

    const lineItem = await payStatementService.addLineItem({
      statementId: id,
      ...input,
    });

    return { success: true, data: lineItem };
  });

  /**
   * DELETE /pay-statements/line-items/:id - Delete line item
   */
  fastify.delete('/line-items/:id', {
    preHandler: [requireRole('admin', 'manager'), validateParams(commonSchemas.id)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = await payStatementService.deleteLineItem(id);

    if (!deleted) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Line item not found' },
      });
    }

    return { success: true, data: { deleted: true } };
  });

  /**
   * POST /pay-statements/line-items/bulk - Bulk add line items
   */
  const bulkLineItemSchema = lineItemSchema.extend({ statementId: z.string() });
  
  fastify.post('/line-items/bulk', {
    preHandler: [
      requireRole('admin'),
      validateBody(z.object({
        items: z.array(bulkLineItemSchema),
      })),
    ],
  }, async (request) => {
    const { items } = request.body as { items: z.infer<typeof bulkLineItemSchema>[] };
    const result = await payStatementService.bulkAddLineItems(items);
    return {
      success: true,
      data: {
        success: result.success,
        failed: result.failed,
        statementsUpdated: result.statementIds.size,
      },
    };
  });

  // ==================== PAYMENT HISTORY ====================

  /**
   * GET /pay-statements/:id/payments - Get payment history for statement
   */
  fastify.get('/:id/payments', {
    preHandler: [validateParams(commonSchemas.id)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const statement = await payStatementService.getStatementById(id);
    if (!statement) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Pay statement not found' },
      });
    }

    if (request.user?.role === 'ambassador' && statement.ambassadorId !== request.user.id) {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied' },
      });
    }

    const payments = await payStatementService.getPaymentHistory(id);
    return { success: true, data: payments };
  });

  /**
   * POST /pay-statements/:id/payments - Record payment
   */
  fastify.post('/:id/payments', {
    preHandler: [
      requireRole('admin'),
      validateParams(commonSchemas.id),
      validateBody(paymentSchema),
    ],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = request.body as z.infer<typeof paymentSchema>;

    const statement = await payStatementService.getStatementById(id);
    if (!statement) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Pay statement not found' },
      });
    }

    const payment = await payStatementService.recordPayment({
      statementId: id,
      ...input,
    });

    return { success: true, data: payment };
  });

  /**
   * PATCH /pay-statements/payments/:id - Update payment status
   */
  fastify.patch('/payments/:id', {
    preHandler: [
      requireRole('admin'),
      validateParams(commonSchemas.id),
      validateBody(paymentStatusSchema),
    ],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { status, failureReason } = request.body as z.infer<typeof paymentStatusSchema>;

    const payment = await payStatementService.updatePaymentStatus(id, status, failureReason);

    if (!payment) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Payment not found' },
      });
    }

    return { success: true, data: payment };
  });

  // ==================== RATE HISTORY ====================

  /**
   * GET /pay-statements/rates/:ambassadorId - Get rate history for ambassador
   */
  fastify.get('/rates/:ambassadorId', {
    preHandler: [validateParams(z.object({ ambassadorId: z.string() }))],
  }, async (request, reply) => {
    const { ambassadorId } = request.params as { ambassadorId: string };

    // Ambassadors can only view their own rates
    if (request.user?.role === 'ambassador' && ambassadorId !== request.user.id) {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied' },
      });
    }

    const rates = await payStatementService.getRateHistory(ambassadorId);
    return { success: true, data: rates };
  });

  /**
   * POST /pay-statements/rates/:ambassadorId - Set pay rate
   */
  fastify.post('/rates/:ambassadorId', {
    preHandler: [
      requireRole('admin', 'manager'),
      validateParams(z.object({ ambassadorId: z.string() })),
      validateBody(rateSchema),
    ],
  }, async (request) => {
    const { ambassadorId } = request.params as { ambassadorId: string };
    const input = request.body as z.infer<typeof rateSchema>;

    const rate = await payStatementService.setPayRate(
      { ambassadorId, ...input },
      request.user?.id
    );

    return { success: true, data: rate };
  });

  /**
   * GET /pay-statements/rates/:ambassadorId/current - Get current rate
   */
  fastify.get('/rates/:ambassadorId/current', {
    preHandler: [validateParams(z.object({ ambassadorId: z.string() }))],
  }, async (request, reply) => {
    const { ambassadorId } = request.params as { ambassadorId: string };
    const { rateType } = request.query as { rateType?: string };

    if (request.user?.role === 'ambassador' && ambassadorId !== request.user.id) {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied' },
      });
    }

    if (!rateType) {
      // Return all current rates
      const [perSignup, hourly, daily, flat] = await Promise.all([
        payStatementService.getCurrentRate(ambassadorId, 'per_signup'),
        payStatementService.getCurrentRate(ambassadorId, 'hourly'),
        payStatementService.getCurrentRate(ambassadorId, 'daily'),
        payStatementService.getCurrentRate(ambassadorId, 'flat'),
      ]);

      return {
        success: true,
        data: {
          perSignup,
          hourly,
          daily,
          flat,
        },
      };
    }

    const rate = await payStatementService.getCurrentRate(ambassadorId, rateType as any);
    return { success: true, data: rate };
  });

  // ==================== AMBASSADOR VIEWS ====================

  /**
   * GET /pay-statements/ambassador/:id/summary - Get ambassador pay summary
   */
  fastify.get('/ambassador/:id/summary', {
    preHandler: [validateParams(commonSchemas.id)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    if (request.user?.role === 'ambassador' && id !== request.user.id) {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied' },
      });
    }

    const summary = await payStatementService.getAmbassadorSummary(id);

    if (!summary) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Ambassador not found' },
      });
    }

    return { success: true, data: summary };
  });

  /**
   * GET /pay-statements/ambassador/:id/payments - Get ambassador payment history
   */
  fastify.get('/ambassador/:id/payments', {
    preHandler: [validateParams(commonSchemas.id)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { limit } = request.query as { limit?: string };

    if (request.user?.role === 'ambassador' && id !== request.user.id) {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Access denied' },
      });
    }

    const payments = await payStatementService.getAmbassadorPaymentHistory(
      id,
      limit ? parseInt(limit) : 50
    );

    return { success: true, data: payments };
  });
}
