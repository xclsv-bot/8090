/**
 * Analytics Routes
 * WO-14, WO-15, WO-16, WO-17, WO-18, WO-51: Analytics & Dashboards
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { analyticsService } from '../services/analyticsService.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateQuery } from '../middleware/validate.js';

const dateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function analyticsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticate);

  /**
   * POST /analytics/snapshot - Create daily snapshot
   */
  fastify.post('/snapshot', {
    preHandler: [requireRole('admin')],
  }, async (request, reply) => {
    const snapshot = await analyticsService.createDailySnapshot();
    return reply.status(201).send({ success: true, data: snapshot });
  });

  /**
   * GET /analytics/snapshots - Get historical snapshots
   */
  fastify.get('/snapshots', {
    preHandler: [requireRole('admin', 'manager'), validateQuery(z.object({
      type: z.string().default('daily'),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))],
  }, async (request) => {
    const { type, from, to } = request.query as { type: string; from: string; to: string };
    const snapshots = await analyticsService.getSnapshots(type, from, to);
    return { success: true, data: snapshots };
  });

  /**
   * GET /analytics/events - Event performance dashboard
   */
  fastify.get('/events', {
    preHandler: [requireRole('admin', 'manager'), validateQuery(dateRangeSchema)],
  }, async (request) => {
    const { from, to } = request.query as { from: string; to: string };
    const data = await analyticsService.getEventPerformance(from, to);
    return { success: true, data };
  });

  /**
   * GET /analytics/ambassadors - Ambassador productivity dashboard
   */
  fastify.get('/ambassadors', {
    preHandler: [requireRole('admin', 'manager'), validateQuery(dateRangeSchema)],
  }, async (request) => {
    const { from, to } = request.query as { from: string; to: string };
    const data = await analyticsService.getAmbassadorProductivity(from, to);
    return { success: true, data };
  });

  /**
   * GET /analytics/financial - Financial performance dashboard
   */
  fastify.get('/financial', {
    preHandler: [requireRole('admin', 'manager'), validateQuery(dateRangeSchema)],
  }, async (request) => {
    const { from, to } = request.query as { from: string; to: string };
    const data = await analyticsService.getFinancialPerformance(from, to);
    return { success: true, data };
  });

  /**
   * GET /analytics/kpis - Get all KPIs
   */
  fastify.get('/kpis', {
    preHandler: [requireRole('admin', 'manager')],
  }, async () => {
    const kpis = await analyticsService.getKPIs();
    return { success: true, data: kpis };
  });

  /**
   * PUT /analytics/kpis/:name/target - Set KPI target
   */
  fastify.put('/kpis/:name/target', {
    preHandler: [requireRole('admin')],
  }, async (request) => {
    const { name } = request.params as { name: string };
    const { targetValue } = request.body as { targetValue: number };
    await analyticsService.setKPITarget(name, targetValue);
    return { success: true, data: { updated: true } };
  });

  /**
   * GET /analytics/export/:type - Export report
   */
  fastify.get('/export/:type', {
    preHandler: [requireRole('admin', 'manager'), validateQuery(z.object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      format: z.enum(['csv', 'json']).default('json'),
    }))],
  }, async (request, reply) => {
    const { type } = request.params as { type: string };
    const { from, to, format } = request.query as { from: string; to: string; format: 'csv' | 'json' };

    const data = await analyticsService.exportReport(type, from, to, format);

    if (format === 'csv') {
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename="${type}_${from}_${to}.csv"`);
    } else {
      reply.header('Content-Type', 'application/json');
    }

    return data;
  });
}
