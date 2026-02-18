/**
 * Reporting Routes
 * WO-4, WO-24: Portal reporting + audit features
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { reportingService } from '../services/reportingService.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateQuery } from '../middleware/validate.js';

const dateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const auditFilterSchema = z.object({
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  userId: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  limit: z.string().optional().transform(v => v ? parseInt(v) : 100),
});

export async function reportRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticate);

  /**
   * GET /reports/dashboard - Get dashboard metrics
   */
  fastify.get('/dashboard', {
    preHandler: [requireRole('admin', 'manager')],
  }, async () => {
    const metrics = await reportingService.getDashboardMetrics();
    return { success: true, data: metrics };
  });

  /**
   * GET /reports/validation - Get validation report
   */
  fastify.get('/validation', {
    preHandler: [requireRole('admin', 'manager'), validateQuery(dateRangeSchema)],
  }, async (request) => {
    const { from, to } = request.query as { from: string; to: string };
    const report = await reportingService.getValidationReport(from, to);
    return { success: true, data: report };
  });

  /**
   * GET /reports/leaderboard - Get ambassador leaderboard
   */
  fastify.get('/leaderboard', {
    preHandler: [requireRole('admin', 'manager'), validateQuery(dateRangeSchema)],
  }, async (request) => {
    const { from, to, limit } = request.query as { from: string; to: string; limit?: string };
    const leaderboard = await reportingService.getAmbassadorLeaderboard(
      from, 
      to, 
      limit ? parseInt(limit) : 20
    );
    return { success: true, data: leaderboard };
  });

  /**
   * GET /reports/operators - Get operator performance report
   */
  fastify.get('/operators', {
    preHandler: [requireRole('admin', 'manager'), validateQuery(dateRangeSchema)],
  }, async (request) => {
    const { from, to } = request.query as { from: string; to: string };
    const report = await reportingService.getOperatorReport(from, to);
    return { success: true, data: report };
  });

  /**
   * GET /reports/events - Get event performance report
   */
  fastify.get('/events', {
    preHandler: [requireRole('admin', 'manager'), validateQuery(dateRangeSchema)],
  }, async (request) => {
    const { from, to } = request.query as { from: string; to: string };
    const report = await reportingService.getEventReport(from, to);
    return { success: true, data: report };
  });

  /**
   * GET /reports/audit - Get audit log
   */
  fastify.get('/audit', {
    preHandler: [requireRole('admin'), validateQuery(auditFilterSchema)],
  }, async (request) => {
    const filters = request.query as z.infer<typeof auditFilterSchema>;
    const log = await reportingService.getAuditLog(filters, filters.limit);
    return { success: true, data: log };
  });

  /**
   * GET /reports/export/:type - Export report as CSV
   */
  fastify.get('/export/:type', {
    preHandler: [requireRole('admin', 'manager'), validateQuery(dateRangeSchema)],
  }, async (request, reply) => {
    const { type } = request.params as { type: string };
    const { from, to } = request.query as { from: string; to: string };

    try {
      const csv = await reportingService.exportToCsv(type, from, to);
      
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename="${type}_${from}_${to}.csv"`);
      
      return csv;
    } catch (error: any) {
      return reply.status(400).send({
        success: false,
        error: { code: 'EXPORT_ERROR', message: error.message },
      });
    }
  });
}
