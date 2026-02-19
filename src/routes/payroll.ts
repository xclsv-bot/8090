/**
 * Payroll Routes
 * WO-48, WO-49: Payroll & Compensation API
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { payrollService } from '../services/payrollService.js';
import { db } from '../services/database.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateBody, validateParams, commonSchemas } from '../middleware/validate.js';

const adjustmentSchema = z.object({
  adjustmentType: z.enum(['bonus', 'deduction', 'correction']),
  amount: z.number().positive(),
  reason: z.string().min(1),
});

export async function payrollRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticate);

  /**
   * GET /payroll/periods - List pay periods
   */
  fastify.get('/periods', {
    preHandler: [requireRole('admin', 'manager')],
  }, async (request) => {
    const { limit } = request.query as { limit?: string };
    const periods = await payrollService.listPayPeriods(limit ? parseInt(limit) : 12);
    return { success: true, data: periods };
  });

  /**
   * GET /payroll/periods/current - Get current pay period
   */
  fastify.get('/periods/current', {
    preHandler: [requireRole('admin', 'manager')],
  }, async () => {
    const period = await payrollService.getCurrentPayPeriod();
    return { success: true, data: period };
  });

  /**
   * GET /payroll/periods/:id - Get pay period by ID
   */
  fastify.get('/periods/:id', {
    preHandler: [requireRole('admin', 'manager'), validateParams(commonSchemas.id)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const period = await payrollService.getPayPeriod(id);
    
    if (!period) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Pay period not found' },
      });
    }

    return { success: true, data: period };
  });

  /**
   * GET /payroll/periods/:id/statements - Get statements for period
   */
  fastify.get('/periods/:id/statements', {
    preHandler: [requireRole('admin', 'manager'), validateParams(commonSchemas.id)],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const statements = await payrollService.getStatements(id);
    return { success: true, data: statements };
  });

  /**
   * POST /payroll/periods/:id/calculate - Calculate payroll
   */
  fastify.post('/periods/:id/calculate', {
    preHandler: [requireRole('admin'), validateParams(commonSchemas.id)],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const result = await payrollService.calculatePayroll(id, request.user?.id);
    return { success: true, data: result };
  });

  /**
   * POST /payroll/periods/:id/approve - Approve pay period
   */
  fastify.post('/periods/:id/approve', {
    preHandler: [requireRole('admin'), validateParams(commonSchemas.id)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const period = await payrollService.approvePeriod(id, request.user!.id);
    
    if (!period) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Pay period not found' },
      });
    }

    return { success: true, data: period };
  });

  /**
   * POST /payroll/periods/:id/process - Process payments
   */
  fastify.post('/periods/:id/process', {
    preHandler: [requireRole('admin'), validateParams(commonSchemas.id)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    
    try {
      const result = await payrollService.processPayments(id, request.user?.id);
      return { success: true, data: result };
    } catch (error: any) {
      return reply.status(400).send({
        success: false,
        error: { code: 'PROCESSING_ERROR', message: error.message },
      });
    }
  });

  /**
   * POST /payroll/statements/:id/adjust - Add adjustment
   */
  fastify.post('/statements/:id/adjust', {
    preHandler: [
      requireRole('admin', 'manager'),
      validateParams(commonSchemas.id),
      validateBody(adjustmentSchema),
    ],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const adjustment = request.body as z.infer<typeof adjustmentSchema>;

    const statement = await payrollService.addAdjustment(
      id,
      { statementId: id, ...adjustment },
      request.user?.id
    );
    
    if (!statement) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Statement not found' },
      });
    }

    return { success: true, data: statement };
  });

  /**
   * GET /payroll/ambassador/:id/history - Get ambassador payment history
   */
  fastify.get('/ambassador/:id/history', {
    preHandler: [validateParams(commonSchemas.id)],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const { limit } = request.query as { limit?: string };
    
    // Ambassadors can only see their own history
    if (request.user?.role === 'ambassador' && request.user?.id !== id) {
      return { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } };
    }

    const history = await payrollService.getAmbassadorPayments(id, limit ? parseInt(limit) : 12);
    return { success: true, data: history };
  });

  /**
   * GET /payroll/stats - Get payroll summary stats
   */
  fastify.get('/stats', {
    preHandler: [requireRole('admin', 'manager')],
  }, async () => {
    const stats = await payrollService.getSummaryStats();
    return { success: true, data: stats };
  });


  /**
   * GET /payroll/entries - List payroll entries (imported historical data)
   */
  fastify.get('/entries', {
    preHandler: [requireRole('admin', 'manager')],
  }, async (request) => {
    const { limit, offset, ambassador, startDate, endDate, status } = request.query as {
      limit?: string;
      offset?: string;
      ambassador?: string;
      startDate?: string;
      endDate?: string;
      status?: string;
    };

    let query = 'SELECT * FROM payroll_entries WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (ambassador) {
      query += ` AND ambassador_name ILIKE $${paramIndex}`;
      params.push(`%${ambassador}%`);
      paramIndex++;
    }

    if (startDate) {
      query += ` AND work_date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      query += ` AND work_date <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    query += ' ORDER BY work_date DESC, ambassador_name';
    
    if (limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(parseInt(limit));
      paramIndex++;
    }

    if (offset) {
      query += ` OFFSET $${paramIndex}`;
      params.push(parseInt(offset));
    }

    const entries = await db.queryMany(query, params);
    
    // Get total count
    const countResult = await db.queryOne<{ count: string }>(
      'SELECT COUNT(*) as count FROM payroll_entries'
    );

    return {
      success: true,
      data: {
        entries,
        total: parseInt(countResult?.count || '0'),
      },
    };
  });

  /**
   * GET /payroll/entries/summary - Get summary stats for payroll entries
   */
  fastify.get('/entries/summary', {
    preHandler: [requireRole('admin', 'manager')],
  }, async () => {
    const summary = await db.queryOne<{
      total_entries: string;
      total_amount: string;
      paid_amount: string;
      pending_amount: string;
      unique_ambassadors: string;
    }>(`
      SELECT 
        COUNT(*) as total_entries,
        COALESCE(SUM(total), 0) as total_amount,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN total ELSE 0 END), 0) as paid_amount,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN total ELSE 0 END), 0) as pending_amount,
        COUNT(DISTINCT ambassador_name) as unique_ambassadors
      FROM payroll_entries
    `);

    return {
      success: true,
      data: {
        totalEntries: parseInt(summary?.total_entries || '0'),
        totalAmount: parseFloat(summary?.total_amount || '0'),
        paidAmount: parseFloat(summary?.paid_amount || '0'),
        pendingAmount: parseFloat(summary?.pending_amount || '0'),
        uniqueAmbassadors: parseInt(summary?.unique_ambassadors || '0'),
      },
    };
  });
}
