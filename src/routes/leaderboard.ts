/**
 * Leaderboard Routes
 * WO-73: Ambassador Analytics and Leaderboard Systems
 * Provides API endpoints for ambassador leaderboards, performance breakdowns,
 * cohort comparisons, and trend analysis
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { leaderboardService } from '../services/leaderboardService.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateQuery, validateParams, validateBody } from '../middleware/validate.js';
import type {
  LeaderboardFilters,
  AmbassadorPerformanceFilters,
  CohortAnalysisFilters,
  TrendAnalysisFilters,
  LeaderboardMetric,
} from '../types/leaderboard.js';
import type { AmbassadorSkillLevel } from '../types/models.js';

// ============================================
// VALIDATION SCHEMAS
// ============================================

const dateRangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
});

const leaderboardFiltersSchema = dateRangeSchema.extend({
  metric: z.enum(['signups', 'performance_score', 'goal_achievement', 'signups_per_hour']).optional(),
  skillLevel: z.enum(['trainee', 'standard', 'pro', 'elite']).optional(),
  region: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).optional(),
  offset: z.coerce.number().min(0).optional(),
  includePreviousPeriod: z.coerce.boolean().optional(),
});

const performanceFiltersSchema = dateRangeSchema.extend({
  timelinePeriod: z.enum(['daily', 'weekly']).optional(),
});

const cohortFiltersSchema = dateRangeSchema.extend({
  groupBy: z.enum(['skill_level', 'region']),
  metric: z.enum(['signups', 'performance_score', 'goal_achievement', 'signups_per_hour']).optional(),
});

const trendFiltersSchema = z.object({
  ambassadorId: z.string().uuid().optional(),
  skillLevel: z.enum(['trainee', 'standard', 'pro', 'elite']).optional(),
  region: z.string().optional(),
  periods: z.coerce.number().min(2).max(12).optional(),
  periodType: z.enum(['week', 'month']).optional(),
});

const optInUpdateSchema = z.object({
  optIn: z.boolean(),
});

export async function leaderboardRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticate);

  // ============================================
  // LEADERBOARD ENDPOINTS (REQ-AR-005)
  // ============================================

  /**
   * GET /leaderboard - Ambassador Leaderboard
   * AC-AR-005.1: Rank by sign-ups (default)
   * AC-AR-005.2: Switch ranking criteria
   * AC-AR-005.3: Display rank, name, metric, events worked
   * AC-AR-005.4: Filter by region or skill level
   * AC-AR-005.5: Highlight significant rank improvements
   * AC-AR-005.6: Exclude opted-out ambassadors
   */
  fastify.get('/', {
    preHandler: [requireRole('admin', 'manager'), validateQuery(leaderboardFiltersSchema)],
  }, async (request) => {
    const query = request.query as z.infer<typeof leaderboardFiltersSchema>;

    const filters: LeaderboardFilters = {
      fromDate: query.from,
      toDate: query.to,
      metric: query.metric as LeaderboardMetric,
      skillLevel: query.skillLevel as AmbassadorSkillLevel,
      region: query.region,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
      includePreviousPeriod: query.includePreviousPeriod ?? true,
    };

    const data = await leaderboardService.getLeaderboard(filters);
    return {
      success: true,
      data,
      meta: {
        totalCount: data.pagination.total,
        limit: data.pagination.limit,
        offset: data.pagination.offset,
        generatedAt: data.generatedAt,
      },
    };
  });

  /**
   * GET /leaderboard/top - Top Performers Quick View
   * Returns top 10 performers for quick display
   */
  fastify.get('/top', {
    preHandler: [requireRole('admin', 'manager'), validateQuery(dateRangeSchema.extend({
      metric: z.enum(['signups', 'performance_score', 'goal_achievement', 'signups_per_hour']).optional(),
    }))],
  }, async (request) => {
    const query = request.query as {
      from: string;
      to: string;
      metric?: LeaderboardMetric;
    };

    const data = await leaderboardService.getLeaderboard({
      fromDate: query.from,
      toDate: query.to,
      metric: query.metric,
      limit: 10,
      offset: 0,
      includePreviousPeriod: true,
    });

    return {
      success: true,
      data: {
        topPerformers: data.entries,
        summary: data.summary,
        generatedAt: data.generatedAt,
      },
    };
  });

  /**
   * GET /leaderboard/by-skill-level - Leaderboard by Skill Level
   * AC-AR-005.4: Compare within skill level cohorts
   */
  fastify.get('/by-skill-level/:skillLevel', {
    preHandler: [
      requireRole('admin', 'manager'),
      validateParams(z.object({ skillLevel: z.enum(['trainee', 'standard', 'pro', 'elite']) })),
      validateQuery(leaderboardFiltersSchema.omit({ skillLevel: true })),
    ],
  }, async (request) => {
    const { skillLevel } = request.params as { skillLevel: AmbassadorSkillLevel };
    const query = request.query as Omit<z.infer<typeof leaderboardFiltersSchema>, 'skillLevel'>;

    const data = await leaderboardService.getLeaderboard({
      fromDate: query.from,
      toDate: query.to,
      metric: query.metric as LeaderboardMetric,
      skillLevel,
      region: query.region,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
      includePreviousPeriod: query.includePreviousPeriod ?? true,
    });

    return { success: true, data };
  });

  /**
   * GET /leaderboard/by-region/:region - Leaderboard by Region
   * AC-AR-005.4: Compare within region cohorts
   */
  fastify.get('/by-region/:region', {
    preHandler: [
      requireRole('admin', 'manager'),
      validateParams(z.object({ region: z.string() })),
      validateQuery(leaderboardFiltersSchema.omit({ region: true })),
    ],
  }, async (request) => {
    const { region } = request.params as { region: string };
    const query = request.query as Omit<z.infer<typeof leaderboardFiltersSchema>, 'region'>;

    const data = await leaderboardService.getLeaderboard({
      fromDate: query.from,
      toDate: query.to,
      metric: query.metric as LeaderboardMetric,
      skillLevel: query.skillLevel as AmbassadorSkillLevel,
      region: decodeURIComponent(region),
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
      includePreviousPeriod: query.includePreviousPeriod ?? true,
    });

    return { success: true, data };
  });

  // ============================================
  // INDIVIDUAL PERFORMANCE ENDPOINTS (REQ-AR-006)
  // ============================================

  /**
   * GET /leaderboard/ambassador/:ambassadorId - Individual Performance Breakdown
   * AC-AR-006.1: Total signups, events, avg signups/event
   * AC-AR-006.2: Goal achievement percentage
   * AC-AR-006.3: Sign-ups per hour
   * AC-AR-006.4: Breakdown by operator
   * AC-AR-006.5: Timeline of signups
   * AC-AR-006.6: Cohort comparisons
   */
  fastify.get('/ambassador/:ambassadorId', {
    preHandler: [
      requireRole('admin', 'manager'),
      validateParams(z.object({ ambassadorId: z.string().uuid() })),
      validateQuery(performanceFiltersSchema),
    ],
  }, async (request, reply) => {
    const { ambassadorId } = request.params as { ambassadorId: string };
    const query = request.query as z.infer<typeof performanceFiltersSchema>;

    const filters: AmbassadorPerformanceFilters = {
      ambassadorId,
      fromDate: query.from,
      toDate: query.to,
      timelinePeriod: query.timelinePeriod,
    };

    const data = await leaderboardService.getAmbassadorPerformance(filters);
    
    if (!data) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Ambassador not found',
        },
      });
    }

    return { success: true, data };
  });

  /**
   * GET /leaderboard/ambassador/:ambassadorId/timeline - Performance Timeline
   * AC-AR-006.5: Detailed timeline view
   */
  fastify.get('/ambassador/:ambassadorId/timeline', {
    preHandler: [
      requireRole('admin', 'manager'),
      validateParams(z.object({ ambassadorId: z.string().uuid() })),
      validateQuery(performanceFiltersSchema),
    ],
  }, async (request, reply) => {
    const { ambassadorId } = request.params as { ambassadorId: string };
    const query = request.query as z.infer<typeof performanceFiltersSchema>;

    const data = await leaderboardService.getAmbassadorPerformance({
      ambassadorId,
      fromDate: query.from,
      toDate: query.to,
      timelinePeriod: query.timelinePeriod,
    });

    if (!data) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Ambassador not found',
        },
      });
    }

    return {
      success: true,
      data: {
        ambassadorId,
        ambassadorName: data.ambassador.name,
        timeline: data.timeline,
        trend: data.trend,
        generatedAt: data.generatedAt,
      },
    };
  });

  /**
   * GET /leaderboard/ambassador/:ambassadorId/operators - Operator Breakdown
   * AC-AR-006.4: Breakdown by operator
   */
  fastify.get('/ambassador/:ambassadorId/operators', {
    preHandler: [
      requireRole('admin', 'manager'),
      validateParams(z.object({ ambassadorId: z.string().uuid() })),
      validateQuery(dateRangeSchema),
    ],
  }, async (request, reply) => {
    const { ambassadorId } = request.params as { ambassadorId: string };
    const query = request.query as { from: string; to: string };

    const data = await leaderboardService.getAmbassadorPerformance({
      ambassadorId,
      fromDate: query.from,
      toDate: query.to,
    });

    if (!data) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Ambassador not found',
        },
      });
    }

    return {
      success: true,
      data: {
        ambassadorId,
        ambassadorName: data.ambassador.name,
        operatorBreakdown: data.operatorBreakdown,
        generatedAt: data.generatedAt,
      },
    };
  });

  /**
   * GET /leaderboard/ambassador/:ambassadorId/cohort - Cohort Comparison
   * AC-AR-006.6: Compare to cohort averages
   */
  fastify.get('/ambassador/:ambassadorId/cohort', {
    preHandler: [
      requireRole('admin', 'manager'),
      validateParams(z.object({ ambassadorId: z.string().uuid() })),
      validateQuery(dateRangeSchema),
    ],
  }, async (request, reply) => {
    const { ambassadorId } = request.params as { ambassadorId: string };
    const query = request.query as { from: string; to: string };

    const data = await leaderboardService.getAmbassadorPerformance({
      ambassadorId,
      fromDate: query.from,
      toDate: query.to,
    });

    if (!data) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Ambassador not found',
        },
      });
    }

    return {
      success: true,
      data: {
        ambassadorId,
        ambassadorName: data.ambassador.name,
        skillLevel: data.ambassador.skillLevel,
        region: data.ambassador.region,
        cohortComparison: data.cohortComparison,
        generatedAt: data.generatedAt,
      },
    };
  });

  // ============================================
  // COHORT ANALYSIS ENDPOINTS
  // ============================================

  /**
   * GET /leaderboard/cohorts - Cohort Analysis
   * Compare performance across skill levels or regions
   */
  fastify.get('/cohorts', {
    preHandler: [requireRole('admin', 'manager'), validateQuery(cohortFiltersSchema)],
  }, async (request) => {
    const query = request.query as z.infer<typeof cohortFiltersSchema>;

    const filters: CohortAnalysisFilters = {
      fromDate: query.from,
      toDate: query.to,
      groupBy: query.groupBy,
      metric: query.metric as LeaderboardMetric,
    };

    const data = await leaderboardService.getCohortAnalysis(filters);
    return { success: true, data };
  });

  /**
   * GET /leaderboard/cohorts/skill-levels - Cohort by Skill Level
   */
  fastify.get('/cohorts/skill-levels', {
    preHandler: [requireRole('admin', 'manager'), validateQuery(dateRangeSchema)],
  }, async (request) => {
    const query = request.query as { from: string; to: string };

    const data = await leaderboardService.getCohortAnalysis({
      fromDate: query.from,
      toDate: query.to,
      groupBy: 'skill_level',
    });

    return { success: true, data };
  });

  /**
   * GET /leaderboard/cohorts/regions - Cohort by Region
   */
  fastify.get('/cohorts/regions', {
    preHandler: [requireRole('admin', 'manager'), validateQuery(dateRangeSchema)],
  }, async (request) => {
    const query = request.query as { from: string; to: string };

    const data = await leaderboardService.getCohortAnalysis({
      fromDate: query.from,
      toDate: query.to,
      groupBy: 'region',
    });

    return { success: true, data };
  });

  // ============================================
  // TREND ANALYSIS ENDPOINTS
  // ============================================

  /**
   * GET /leaderboard/trends - Performance Trend Analysis
   * Analyze performance trends over multiple periods
   */
  fastify.get('/trends', {
    preHandler: [requireRole('admin', 'manager'), validateQuery(trendFiltersSchema)],
  }, async (request) => {
    const query = request.query as z.infer<typeof trendFiltersSchema>;

    const filters: TrendAnalysisFilters = {
      ambassadorId: query.ambassadorId,
      skillLevel: query.skillLevel as AmbassadorSkillLevel,
      region: query.region,
      periods: query.periods ?? 6,
      periodType: query.periodType ?? 'week',
    };

    const data = await leaderboardService.getTrendAnalysis(filters);
    return { success: true, data };
  });

  /**
   * GET /leaderboard/trends/ambassador/:ambassadorId - Individual Trend
   */
  fastify.get('/trends/ambassador/:ambassadorId', {
    preHandler: [
      requireRole('admin', 'manager'),
      validateParams(z.object({ ambassadorId: z.string().uuid() })),
      validateQuery(z.object({
        periods: z.coerce.number().min(2).max(12).optional(),
        periodType: z.enum(['week', 'month']).optional(),
      })),
    ],
  }, async (request) => {
    const { ambassadorId } = request.params as { ambassadorId: string };
    const query = request.query as { periods?: number; periodType?: 'week' | 'month' };

    const data = await leaderboardService.getTrendAnalysis({
      ambassadorId,
      periods: query.periods ?? 6,
      periodType: query.periodType ?? 'week',
    });

    return { success: true, data };
  });

  // ============================================
  // PRIVACY CONTROL ENDPOINTS
  // ============================================

  /**
   * GET /leaderboard/privacy/:ambassadorId - Get Privacy Settings
   */
  fastify.get('/privacy/:ambassadorId', {
    preHandler: [
      authenticate,
      validateParams(z.object({ ambassadorId: z.string().uuid() })),
    ],
  }, async (request, reply) => {
    const { ambassadorId } = request.params as { ambassadorId: string };

    const data = await leaderboardService.getPrivacySettings(ambassadorId);

    if (!data) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Ambassador not found',
        },
      });
    }

    return { success: true, data };
  });

  /**
   * PUT /leaderboard/privacy/:ambassadorId/opt-in - Update Leaderboard Opt-in
   * AC-AR-005.6: Control leaderboard participation
   */
  fastify.put('/privacy/:ambassadorId/opt-in', {
    preHandler: [
      authenticate,
      validateParams(z.object({ ambassadorId: z.string().uuid() })),
      validateBody(optInUpdateSchema),
    ],
  }, async (request, reply) => {
    const { ambassadorId } = request.params as { ambassadorId: string };
    const { optIn } = request.body as { optIn: boolean };

    const success = await leaderboardService.updateLeaderboardOptIn({
      ambassadorId,
      optIn,
    });

    if (!success) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Ambassador not found',
        },
      });
    }

    return {
      success: true,
      data: {
        ambassadorId,
        leaderboardOptIn: optIn,
        message: optIn 
          ? 'You are now visible on the leaderboard' 
          : 'You have been removed from the leaderboard',
      },
    };
  });
}
