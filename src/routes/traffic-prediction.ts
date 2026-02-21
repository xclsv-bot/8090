/**
 * Traffic Prediction Routes - WO-85
 * REST API endpoints for traffic prediction scoring
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { trafficPredictionService } from '../services/trafficPredictionService.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';

// ============================================
// SCHEMAS
// ============================================

const gameInfoSchema = z.object({
  homeTeam: z.string().optional(),
  awayTeam: z.string().optional(),
  league: z.string().optional(),
  isPlayoffs: z.boolean().optional(),
  isRivalry: z.boolean().optional(),
  broadcastNetwork: z.string().optional(),
  startTime: z.string().datetime().optional(),
});

const manualInsightSchema = z.object({
  note: z.string().max(500).optional(),
  confidenceAdjustment: z.number().min(-20).max(20).optional(),
  source: z.enum(['manager', 'ambassador', 'operator']).optional(),
});

const scoreRequestSchema = z.object({
  eventId: z.string().uuid().optional(),
  venueId: z.string().uuid(),
  eventDate: z.string().datetime(),
  game: gameInfoSchema.optional(),
  manualInsight: manualInsightSchema.optional(),
});

const recommendationsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(50).default(10),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const venueHistoryQuerySchema = z.object({
  venueId: z.string().uuid(),
});

// ============================================
// ROUTES
// ============================================

export async function trafficPredictionRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.addHook('preHandler', authenticate);

  /**
   * POST /score - Calculate traffic prediction score
   * 
   * Calculate a weighted score predicting event traffic/performance based on:
   * - Game relevance (local teams, primetime, playoffs, rivalries)
   * - Historical venue performance (ambassador-normalized)
   * - Day/time optimization
   * - Seasonal factors
   * - Manual insights/adjustments
   */
  fastify.post('/score', {
    preHandler: [requireRole('admin', 'manager'), validateBody(scoreRequestSchema)],
    schema: {
      description: 'Calculate traffic prediction score for an event',
      tags: ['Traffic Prediction'],
      body: {
        type: 'object',
        required: ['venueId', 'eventDate'],
        properties: {
          eventId: { type: 'string', format: 'uuid' },
          venueId: { type: 'string', format: 'uuid' },
          eventDate: { type: 'string', format: 'date-time' },
          game: {
            type: 'object',
            properties: {
              homeTeam: { type: 'string' },
              awayTeam: { type: 'string' },
              league: { type: 'string' },
              isPlayoffs: { type: 'boolean' },
              isRivalry: { type: 'boolean' },
              broadcastNetwork: { type: 'string' },
              startTime: { type: 'string', format: 'date-time' },
            },
          },
          manualInsight: {
            type: 'object',
            properties: {
              note: { type: 'string', maxLength: 500 },
              confidenceAdjustment: { type: 'number', minimum: -20, maximum: 20 },
              source: { type: 'string', enum: ['manager', 'ambassador', 'operator'] },
            },
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                totalScore: { type: 'number' },
                normalizedScore: { type: 'number' },
                confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
                tier: { type: 'string', enum: ['excellent', 'good', 'average', 'below_average', 'poor'] },
                factors: { type: 'array' },
                predictedSignups: {
                  type: 'object',
                  properties: {
                    low: { type: 'number' },
                    expected: { type: 'number' },
                    high: { type: 'number' },
                  },
                },
                generatedAt: { type: 'string' },
              },
            },
          },
        },
      },
    },
  }, async (request, reply) => {
    const body = request.body as z.infer<typeof scoreRequestSchema>;
    
    const score = await trafficPredictionService.calculateScore({
      eventId: body.eventId,
      venueId: body.venueId,
      eventDate: new Date(body.eventDate),
      game: body.game ? {
        ...body.game,
        startTime: body.game.startTime ? new Date(body.game.startTime) : undefined,
      } : undefined,
      manualInsight: body.manualInsight,
    });
    
    return { success: true, data: score };
  });

  /**
   * GET /score - Calculate score with query params (simpler interface)
   */
  fastify.get('/score', {
    preHandler: [
      requireRole('admin', 'manager'),
      validateQuery(z.object({
        venueId: z.string().uuid(),
        eventDate: z.string().datetime(),
      })),
    ],
    schema: {
      description: 'Calculate basic traffic prediction score (simplified)',
      tags: ['Traffic Prediction'],
      querystring: {
        type: 'object',
        required: ['venueId', 'eventDate'],
        properties: {
          venueId: { type: 'string', format: 'uuid' },
          eventDate: { type: 'string', format: 'date-time' },
        },
      },
    },
  }, async (request) => {
    const { venueId, eventDate } = request.query as { venueId: string; eventDate: string };
    
    const score = await trafficPredictionService.calculateScore({
      venueId,
      eventDate: new Date(eventDate),
    });
    
    return { success: true, data: score };
  });

  /**
   * GET /recommendations - Get recommended events based on scores
   */
  fastify.get('/recommendations', {
    preHandler: [requireRole('admin', 'manager'), validateQuery(recommendationsQuerySchema)],
    schema: {
      description: 'Get event recommendations ranked by traffic prediction scores',
      tags: ['Traffic Prediction'],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', default: 10, minimum: 1, maximum: 50 },
          dateFrom: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          dateTo: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  venueId: { type: 'string' },
                  venueName: { type: 'string' },
                  score: { type: 'number' },
                  tier: { type: 'string' },
                  reason: { type: 'string' },
                  suggestedAmbassadors: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
  }, async (request) => {
    const query = request.query as z.infer<typeof recommendationsQuerySchema>;
    
    const recommendations = await trafficPredictionService.getRecommendations(
      query.limit,
      query.dateFrom ? new Date(query.dateFrom) : undefined,
      query.dateTo ? new Date(query.dateTo) : undefined
    );
    
    return { success: true, data: recommendations };
  });

  /**
   * GET /venue-history - Get detailed venue history with performance metrics
   */
  fastify.get('/venue-history', {
    preHandler: [requireRole('admin', 'manager'), validateQuery(venueHistoryQuerySchema)],
    schema: {
      description: 'Get detailed venue history with ambassador-normalized performance',
      tags: ['Traffic Prediction'],
      querystring: {
        type: 'object',
        required: ['venueId'],
        properties: {
          venueId: { type: 'string', format: 'uuid' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                venueId: { type: 'string' },
                venueName: { type: 'string' },
                history: {
                  type: 'object',
                  nullable: true,
                  properties: {
                    totalEvents: { type: 'number' },
                    avgSignups: { type: 'number' },
                    avgSignupsPerAmbassador: { type: 'number' },
                    successRate: { type: 'number' },
                    recentTrend: { type: 'string', enum: ['up', 'down', 'stable'] },
                  },
                },
                recentEvents: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      eventId: { type: 'string' },
                      eventDate: { type: 'string' },
                      signups: { type: 'number' },
                      ambassadorCount: { type: 'number' },
                      signupsPerAmbassador: { type: 'number' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  }, async (request) => {
    const { venueId } = request.query as { venueId: string };
    
    const history = await trafficPredictionService.getVenueHistoryDetails(venueId);
    
    return { success: true, data: history };
  });

  /**
   * GET /config - Get scoring configuration (for transparency/documentation)
   */
  fastify.get('/config', {
    preHandler: [requireRole('admin', 'manager')],
    schema: {
      description: 'Get scoring configuration and weights',
      tags: ['Traffic Prediction'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
          },
        },
      },
    },
  }, async () => {
    const config = trafficPredictionService.getConfiguration();
    return { success: true, data: config };
  });

  /**
   * POST /cache/clear - Clear prediction cache
   */
  fastify.post('/cache/clear', {
    preHandler: [requireRole('admin')],
    schema: {
      description: 'Clear traffic prediction cache',
      tags: ['Traffic Prediction'],
      body: {
        type: 'object',
        properties: {
          venueId: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request) => {
    const { venueId } = (request.body || {}) as { venueId?: string };
    
    trafficPredictionService.clearCache(venueId);
    
    return { 
      success: true, 
      data: { 
        cleared: true, 
        scope: venueId ? `venue:${venueId}` : 'all' 
      } 
    };
  });
}
