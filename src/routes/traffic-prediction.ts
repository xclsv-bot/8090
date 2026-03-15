/**
 * Traffic Prediction Routes - WO-85 / WO-135
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { trafficPredictionService } from '../services/trafficPredictionService.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateBody, validateQuery } from '../middleware/validate.js';

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

const scoreQuerySchema = z.object({
  venueId: z.string().uuid(),
  eventDate: z.string().datetime(),
});

const recommendationsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(50).default(10),
  week: z.coerce.number().min(1).max(8).optional(),
  region: z.string().min(1).max(100).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const venueHistoryQuerySchema = z.object({
  venueId: z.string().uuid(),
});

const sportsCalendarQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  region: z.string().min(1).max(100).optional(),
});

export async function trafficPredictionRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticate);

  fastify.post('/score', {
    preHandler: [requireRole('admin', 'manager'), validateBody(scoreRequestSchema)],
  }, async (request) => {
    const body = request.body as z.infer<typeof scoreRequestSchema>;

    const score = await trafficPredictionService.calculateScore({
      eventId: body.eventId,
      venueId: body.venueId,
      eventDate: new Date(body.eventDate),
      game: body.game
        ? {
            ...body.game,
            startTime: body.game.startTime ? new Date(body.game.startTime) : undefined,
          }
        : undefined,
      manualInsight: body.manualInsight,
    });

    return { success: true, data: score };
  });

  fastify.get('/score', {
    preHandler: [requireRole('admin', 'manager'), validateQuery(scoreQuerySchema)],
  }, async (request) => {
    const { venueId, eventDate } = request.query as z.infer<typeof scoreQuerySchema>;

    const score = await trafficPredictionService.calculateScore({
      venueId,
      eventDate: new Date(eventDate),
    });

    return { success: true, data: score };
  });

  fastify.get('/recommendations', {
    preHandler: [requireRole('admin', 'manager'), validateQuery(recommendationsQuerySchema)],
  }, async (request) => {
    const query = request.query as z.infer<typeof recommendationsQuerySchema>;

    const dateFrom = query.dateFrom
      ? new Date(`${query.dateFrom}T00:00:00.000Z`)
      : query.week
      ? new Date(Date.now() + (query.week - 1) * 7 * 24 * 60 * 60 * 1000)
      : undefined;

    const dateTo = query.dateTo
      ? new Date(`${query.dateTo}T23:59:59.999Z`)
      : dateFrom
      ? new Date(dateFrom.getTime() + 6 * 24 * 60 * 60 * 1000)
      : undefined;

    const recommendations = await trafficPredictionService.getRecommendations({
      limit: query.limit,
      week: query.week,
      region: query.region,
      dateFrom,
      dateTo,
    });

    return { success: true, data: recommendations };
  });

  fastify.get('/sports-calendar', {
    preHandler: [requireRole('admin', 'manager'), validateQuery(sportsCalendarQuerySchema)],
  }, async (request) => {
    const { date, region } = request.query as z.infer<typeof sportsCalendarQuerySchema>;

    const games = await trafficPredictionService.getSportsCalendar(date, region);
    return { success: true, data: games };
  });

  fastify.get('/venue-history', {
    preHandler: [requireRole('admin', 'manager'), validateQuery(venueHistoryQuerySchema)],
  }, async (request) => {
    const { venueId } = request.query as z.infer<typeof venueHistoryQuerySchema>;
    const history = await trafficPredictionService.getVenueHistoryDetails(venueId);

    return { success: true, data: history };
  });

  fastify.get('/config', {
    preHandler: [requireRole('admin', 'manager')],
  }, async () => {
    const config = trafficPredictionService.getConfiguration();
    return { success: true, data: config };
  });

  fastify.post('/cache/clear', {
    preHandler: [requireRole('admin')],
  }, async (request) => {
    const { venueId } = (request.body || {}) as { venueId?: string };
    trafficPredictionService.clearCache(venueId);

    return {
      success: true,
      data: {
        cleared: true,
        scope: venueId ? `venue:${venueId}` : 'all',
      },
    };
  });
}
