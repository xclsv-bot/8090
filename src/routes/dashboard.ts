/**
 * Dashboard Routes
 * WO-72: Real-time Analytics Dashboards and Performance Tracking APIs
 * Provides API endpoints for event performance, operator analytics, venue analysis,
 * and real-time signup tracking
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { dashboardService } from '../services/dashboardService.js';
import { operatorAnalyticsService } from '../services/operatorAnalyticsService.js';
import { venueAnalyticsService } from '../services/venueAnalyticsService.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateQuery, validateParams } from '../middleware/validate.js';
import type {
  EventPerformanceFilters,
  OperatorPerformanceFilters,
  VenuePerformanceFilters,
} from '../types/dashboard.js';

// ============================================
// VALIDATION SCHEMAS
// ============================================

const dateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
});

const eventPerformanceFiltersSchema = dateRangeSchema.extend({
  region: z.string().optional(),
  operatorId: z.coerce.number().optional(),
  eventType: z.string().optional(),
  sortBy: z.enum(['signups', 'revenue', 'achievement', 'date']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  offset: z.coerce.number().min(0).optional(),
});

const operatorPerformanceFiltersSchema = dateRangeSchema.extend({
  region: z.string().optional(),
  operatorIds: z.string().transform(str => str.split(',').map(Number)).optional(),
  groupByLocation: z.coerce.boolean().optional(),
  sortBy: z.enum(['signups', 'revenue', 'dropOff', 'validation']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  offset: z.coerce.number().min(0).optional(),
});

const venuePerformanceFiltersSchema = dateRangeSchema.extend({
  region: z.string().optional(),
  minEvents: z.coerce.number().min(1).optional(),
  sortBy: z.enum(['signups', 'revenue', 'avgSignups', 'events', 'score', 'consistency', 'profitMargin']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  offset: z.coerce.number().min(0).optional(),
});

const ambassadorGoalFiltersSchema = dateRangeSchema.extend({
  sortBy: z.enum(['achievement', 'signups', 'events']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
});

export async function dashboardRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticate);

  // ============================================
  // EVENT PERFORMANCE DASHBOARD
  // ============================================

  /**
   * GET /dashboard/events - Event Performance Dashboard
   * Returns comprehensive event performance metrics with goal tracking
   */
  fastify.get('/events', {
    preHandler: [requireRole('admin', 'manager'), validateQuery(eventPerformanceFiltersSchema)],
  }, async (request, reply) => {
    const query = request.query as z.infer<typeof eventPerformanceFiltersSchema>;

    const filters: EventPerformanceFilters = {
      fromDate: query.from,
      toDate: query.to,
      region: query.region,
      operatorId: query.operatorId,
      eventType: query.eventType,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    };

    const data = await dashboardService.getEventPerformanceDashboard(filters);
    return { success: true, data };
  });

  /**
   * GET /dashboard/events/goal-analysis - Goal vs Actual Summary
   * Returns aggregated goal achievement metrics
   */
  fastify.get('/events/goal-analysis', {
    preHandler: [requireRole('admin', 'manager'), validateQuery(dateRangeSchema.extend({
      region: z.string().optional(),
      operatorId: z.coerce.number().optional(),
    }))],
  }, async (request) => {
    const query = request.query as {
      from: string;
      to: string;
      region?: string;
      operatorId?: number;
    };

    const data = await dashboardService.getGoalVsActualSummary(
      query.from,
      query.to,
      query.region,
      query.operatorId
    );
    return { success: true, data };
  });

  /**
   * GET /dashboard/events/ambassadors - Ambassador Goal Performance
   * Returns goal achievement metrics by ambassador
   */
  fastify.get('/events/ambassadors', {
    preHandler: [requireRole('admin', 'manager'), validateQuery(ambassadorGoalFiltersSchema)],
  }, async (request) => {
    const query = request.query as z.infer<typeof ambassadorGoalFiltersSchema>;

    const data = await dashboardService.getAmbassadorGoalPerformance(
      query.from,
      query.to,
      query.sortBy as 'achievement' | 'signups' | 'events',
      query.sortOrder as 'asc' | 'desc',
      query.limit ?? 50
    );
    return { success: true, data };
  });

  // ============================================
  // REAL-TIME SIGNUP TRACKING
  // ============================================

  /**
   * GET /dashboard/realtime - Real-time Signup Tracking
   * Returns current-day metrics and live signup data
   */
  fastify.get('/realtime', {
    preHandler: [requireRole('admin', 'manager')],
  }, async () => {
    const data = await dashboardService.getRealtimeSignupTracking();
    return { success: true, data };
  });

  /**
   * POST /dashboard/realtime/refresh - Force Metrics Refresh
   * Broadcasts updated metrics to all connected WebSocket clients
   */
  fastify.post('/realtime/refresh', {
    preHandler: [requireRole('admin')],
  }, async () => {
    await dashboardService.broadcastMetricsRefresh();
    return { success: true, message: 'Metrics refresh broadcast sent' };
  });

  // ============================================
  // OPERATOR PERFORMANCE DASHBOARD
  // ============================================

  /**
   * GET /dashboard/operators - Operator Performance Dashboard
   * Returns comprehensive operator metrics with drop-off analysis
   */
  fastify.get('/operators', {
    preHandler: [requireRole('admin', 'manager'), validateQuery(operatorPerformanceFiltersSchema)],
  }, async (request) => {
    const query = request.query as z.infer<typeof operatorPerformanceFiltersSchema>;

    const filters: OperatorPerformanceFilters = {
      fromDate: query.from,
      toDate: query.to,
      region: query.region,
      operatorIds: query.operatorIds,
      groupByLocation: query.groupByLocation,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    };

    const data = await operatorAnalyticsService.getOperatorPerformanceDashboard(filters);
    return { success: true, data };
  });

  /**
   * GET /dashboard/operators/:operatorId - Single Operator Detail
   * Returns detailed performance for a specific operator
   */
  fastify.get('/operators/:operatorId', {
    preHandler: [
      requireRole('admin', 'manager'),
      validateParams(z.object({ operatorId: z.coerce.number() })),
      validateQuery(dateRangeSchema),
    ],
  }, async (request) => {
    const { operatorId } = request.params as { operatorId: number };
    const { from, to } = request.query as { from: string; to: string };

    const data = await operatorAnalyticsService.getOperatorDetail(operatorId, from, to);
    return { success: true, data };
  });

  /**
   * GET /dashboard/operators/drop-off - Drop-off Analysis
   * Returns detailed drop-off rate analysis across operators
   */
  fastify.get('/operators/drop-off', {
    preHandler: [requireRole('admin', 'manager'), validateQuery(dateRangeSchema.extend({
      region: z.string().optional(),
    }))],
  }, async (request) => {
    const query = request.query as { from: string; to: string; region?: string };

    const dashboard = await operatorAnalyticsService.getOperatorPerformanceDashboard({
      fromDate: query.from,
      toDate: query.to,
      region: query.region,
    });

    return { success: true, data: dashboard.dropOffAnalysis };
  });

  /**
   * GET /dashboard/operators/trends - Operator Trend Data
   * Returns trend data for volume and drop-off rates
   */
  fastify.get('/operators/trends', {
    preHandler: [requireRole('admin', 'manager'), validateQuery(operatorPerformanceFiltersSchema)],
  }, async (request) => {
    const query = request.query as z.infer<typeof operatorPerformanceFiltersSchema>;

    const dashboard = await operatorAnalyticsService.getOperatorPerformanceDashboard({
      fromDate: query.from,
      toDate: query.to,
      region: query.region,
      operatorIds: query.operatorIds,
    });

    return { success: true, data: dashboard.trendData };
  });

  // ============================================
  // VENUE PERFORMANCE DASHBOARD
  // ============================================

  /**
   * GET /dashboard/venues - Venue Performance Dashboard
   * Returns comprehensive venue metrics with consistency scoring
   */
  fastify.get('/venues', {
    preHandler: [requireRole('admin', 'manager'), validateQuery(venuePerformanceFiltersSchema)],
  }, async (request) => {
    const query = request.query as z.infer<typeof venuePerformanceFiltersSchema>;

    const filters: VenuePerformanceFilters = {
      fromDate: query.from,
      toDate: query.to,
      region: query.region,
      minEvents: query.minEvents,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    };

    const data = await venueAnalyticsService.getVenuePerformanceDashboard(filters);
    return { success: true, data };
  });

  /**
   * GET /dashboard/venues/:venueName - Single Venue Detail
   * Returns detailed performance for a specific venue
   */
  fastify.get('/venues/:venueName', {
    preHandler: [
      requireRole('admin', 'manager'),
      validateParams(z.object({ venueName: z.string() })),
      validateQuery(dateRangeSchema),
    ],
  }, async (request) => {
    const { venueName } = request.params as { venueName: string };
    const { from, to } = request.query as { from: string; to: string };

    const data = await venueAnalyticsService.getVenueDetail(
      decodeURIComponent(venueName),
      from,
      to
    );
    return { success: true, data };
  });

  /**
   * POST /dashboard/venues/compare - Compare Multiple Venues
   * Returns side-by-side comparison of selected venues
   */
  fastify.post('/venues/compare', {
    preHandler: [requireRole('admin', 'manager')],
  }, async (request) => {
    const body = request.body as {
      venueNames: string[];
      from: string;
      to: string;
    };

    // Validate body
    const schema = z.object({
      venueNames: z.array(z.string()).min(2).max(10),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    });
    const validated = schema.parse(body);

    const data = await venueAnalyticsService.compareVenues(
      validated.venueNames,
      validated.from,
      validated.to
    );
    return { success: true, data };
  });

  /**
   * GET /dashboard/venues/recommendations - Venue Recommendations
   * Returns actionable recommendations based on performance
   */
  fastify.get('/venues/recommendations', {
    preHandler: [requireRole('admin', 'manager'), validateQuery(dateRangeSchema.extend({
      region: z.string().optional(),
    }))],
  }, async (request) => {
    const query = request.query as { from: string; to: string; region?: string };

    const data = await venueAnalyticsService.getVenueRecommendations(
      query.from,
      query.to,
      query.region
    );
    return { success: true, data };
  });

  /**
   * GET /dashboard/venues/consistency - Consistency Analysis
   * Returns venue consistency metrics overview
   */
  fastify.get('/venues/consistency', {
    preHandler: [requireRole('admin', 'manager'), validateQuery(dateRangeSchema.extend({
      region: z.string().optional(),
    }))],
  }, async (request) => {
    const query = request.query as { from: string; to: string; region?: string };

    const dashboard = await venueAnalyticsService.getVenuePerformanceDashboard({
      fromDate: query.from,
      toDate: query.to,
      region: query.region,
    });

    return { success: true, data: dashboard.consistencyAnalysis };
  });
}
