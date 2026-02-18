/**
 * Payroll Routes
 * WO-48, WO-49: Payroll & Compensation API
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { payrollService } from '../services/payrollService.js';
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
}
