/**
 * Financial Routes
 * WO-38: Actuals population + expense reconciliation
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { financialService } from '../services/financialService.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateBody, validateParams, validateQuery, commonSchemas } from '../middleware/validate.js';

const createExpenseSchema = z.object({
  eventId: z.string().uuid().optional(),
  category: z.string(),
  description: z.string(),
  amount: z.number().positive(),
  vendorName: z.string().optional(),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  receiptKey: z.string().optional(),
});

const setBudgetSchema = z.object({
  eventId: z.string().uuid().optional(),
  category: z.string(),
  budgetedAmount: z.number().positive(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
});

const recordRevenueSchema = z.object({
  eventId: z.string().uuid().optional(),
  operatorId: z.number().int().positive().optional(),
  revenueType: z.string(),
  amount: z.number().positive(),
  revenueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: z.string().optional(),
  notes: z.string().optional(),
});

const dateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function financialRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticate);

  // ============================================
  // EXPENSES
  // ============================================

  /**
   * GET /financial/expenses - List expenses
   */
  fastify.get('/expenses', {
    preHandler: [requireRole('admin', 'manager')],
  }, async (request) => {
    const query = request.query as { 
      eventId?: string;
      category?: string;
      fromDate?: string;
      toDate?: string;
      status?: string;
      page?: string;
      limit?: string;
    };
    
    const result = await financialService.getExpenses(
      query,
      query.page ? parseInt(query.page) : 1,
      query.limit ? parseInt(query.limit) : 50
    );

    return { success: true, data: result.items, meta: { total: result.total } };
  });

  /**
   * POST /financial/expenses - Create expense
   */
  fastify.post('/expenses', {
    preHandler: [requireRole('admin', 'manager'), validateBody(createExpenseSchema)],
  }, async (request, reply) => {
    const input = request.body as z.infer<typeof createExpenseSchema>;
    const expense = await financialService.createExpense({
      ...input,
      createdBy: request.user?.id,
    });

    return reply.status(201).send({ success: true, data: expense });
  });

  /**
   * POST /financial/expenses/reconcile - Reconcile expenses
   */
  fastify.post('/expenses/reconcile', {
    preHandler: [
      requireRole('admin'),
      validateBody(z.object({ source: z.string() })),
    ],
  }, async (request) => {
    const { source } = request.body as { source: string };
    const result = await financialService.reconcileExpenses(source);
    return { success: true, data: result };
  });

  // ============================================
  // BUDGETS
  // ============================================

  /**
   * GET /financial/budgets - Get budget report
   */
  fastify.get('/budgets', {
    preHandler: [requireRole('admin', 'manager')],
  }, async (request) => {
    const { eventId } = request.query as { eventId?: string };
    const report = await financialService.getBudgetReport(eventId);
    return { success: true, data: report };
  });

  /**
   * POST /financial/budgets - Set budget
   */
  fastify.post('/budgets', {
    preHandler: [requireRole('admin', 'manager'), validateBody(setBudgetSchema)],
  }, async (request, reply) => {
    const input = request.body as z.infer<typeof setBudgetSchema>;
    const budget = await financialService.setBudget(input);
    return reply.status(201).send({ success: true, data: budget });
  });

  // ============================================
  // REVENUE
  // ============================================

  /**
   * POST /financial/revenue - Record revenue
   */
  fastify.post('/revenue', {
    preHandler: [requireRole('admin', 'manager'), validateBody(recordRevenueSchema)],
  }, async (request, reply) => {
    const input = request.body as z.infer<typeof recordRevenueSchema>;
    const revenue = await financialService.recordRevenue(input);
    return reply.status(201).send({ success: true, data: revenue });
  });

  /**
   * GET /financial/revenue/summary - Get revenue summary
   */
  fastify.get('/revenue/summary', {
    preHandler: [requireRole('admin', 'manager'), validateQuery(dateRangeSchema)],
  }, async (request) => {
    const { from, to } = request.query as { from: string; to: string };
    const summary = await financialService.getRevenueSummary(from, to);
    return { success: true, data: summary };
  });

  // ============================================
  // P&L
  // ============================================

  /**
   * GET /financial/pnl - Get P&L summary
   */
  fastify.get('/pnl', {
    preHandler: [requireRole('admin', 'manager'), validateQuery(dateRangeSchema)],
  }, async (request) => {
    const { from, to, eventId } = request.query as { from: string; to: string; eventId?: string };
    const pnl = await financialService.getProfitLoss(from, to, eventId);
    return { success: true, data: pnl };
  });
}
