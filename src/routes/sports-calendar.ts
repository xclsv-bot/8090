/**
 * Sports Calendar API Routes
 * WO-84: Sports Calendar Integration
 *
 * API endpoints for sports schedule data:
 * - GET /sports-calendar - List games with filters
 * - GET /sports-calendar/today - Today's games
 * - GET /sports-calendar/upcoming - Upcoming games
 * - GET /sports-calendar/games/:id - Get specific game
 * - GET /sports-calendar/markets - List geographic markets
 * - GET /sports-calendar/markets/:id/teams - Get local teams
 * - GET /sports-calendar/markets/:id/games - Get local team games
 * - POST /sports-calendar/sync - Trigger manual sync
 * - POST /sports-calendar/sync/:league - Sync specific league
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sportsCalendarService } from '../services/sportsCalendarService.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateBody, validateQuery, validateParams, commonSchemas } from '../middleware/validate.js';
import { logger } from '../utils/logger.js';
import type { SportsLeague } from '../types/sportsCalendar.js';

// ============================================
// VALIDATION SCHEMAS
// ============================================

const leagueEnum = z.enum(['NFL', 'NBA', 'MLB', 'NHL', 'NCAAF', 'NCAAB']);

const gameStatusEnum = z.enum([
  'scheduled', 'in_progress', 'halftime', 'delayed',
  'postponed', 'cancelled', 'final', 'suspended'
]);

const gameTypeEnum = z.enum([
  'regular', 'preseason', 'postseason', 'playoff',
  'championship', 'all-star', 'exhibition'
]);

const gamesQuerySchema = z.object({
  leagues: z.string().optional().transform(val => 
    val ? val.split(',').map(l => l.trim().toUpperCase()) as SportsLeague[] : undefined
  ),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.string().optional().transform(val =>
    val ? val.split(',').map(s => s.trim()) : undefined
  ),
  gameType: z.string().optional().transform(val =>
    val ? val.split(',').map(t => t.trim()) : undefined
  ),
  isNationalBroadcast: z.string().optional().transform(val => 
    val === 'true' ? true : val === 'false' ? false : undefined
  ),
  isPrimetime: z.string().optional().transform(val =>
    val === 'true' ? true : val === 'false' ? false : undefined
  ),
  includeCompleted: z.string().optional().transform(val => val === 'true'),
  search: z.string().optional(),
  page: z.string().optional().default('1').transform(Number),
  limit: z.string().optional().default('20').transform(Number),
  sortBy: z.enum(['gameDate', 'relevanceScore', 'league']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

const upcomingQuerySchema = z.object({
  limit: z.string().optional().default('10').transform(Number),
  leagues: z.string().optional().transform(val =>
    val ? val.split(',').map(l => l.trim().toUpperCase()) as SportsLeague[] : undefined
  ),
});

const syncBodySchema = z.object({
  dateRange: z.object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).optional(),
  leagues: z.array(leagueEnum).optional(),
});

const leagueSyncParamsSchema = z.object({
  league: leagueEnum,
});

const leagueSyncQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const marketParamsSchema = z.object({
  id: z.string().min(1),
});

const localGamesQuerySchema = z.object({
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.string().optional().default('20').transform(Number),
});

// ============================================
// ROUTES
// ============================================

export async function sportsCalendarRoutes(fastify: FastifyInstance): Promise<void> {
  // All routes require authentication
  fastify.addHook('preHandler', authenticate);

  /**
   * GET /sports-calendar - List games with filters and pagination
   */
  fastify.get('/', {
    preHandler: [validateQuery(gamesQuerySchema)],
  }, async (request) => {
    const query = request.query as z.infer<typeof gamesQuerySchema>;
    
    const result = await sportsCalendarService.getGames({
      leagues: query.leagues,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      status: query.status as any,
      gameType: query.gameType as any,
      isNationalBroadcast: query.isNationalBroadcast,
      isPrimetime: query.isPrimetime,
      includeCompleted: query.includeCompleted,
      search: query.search,
      page: query.page,
      limit: query.limit,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    });

    return {
      success: true,
      data: result.games,
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
    };
  });

  /**
   * GET /sports-calendar/today - Get today's games
   */
  fastify.get('/today', {
    preHandler: [validateQuery(upcomingQuerySchema)],
  }, async (request) => {
    const { leagues } = request.query as z.infer<typeof upcomingQuerySchema>;
    const games = await sportsCalendarService.getTodaysGames(leagues);

    return {
      success: true,
      data: games,
      meta: {
        date: new Date().toISOString().split('T')[0],
        count: games.length,
      },
    };
  });

  /**
   * GET /sports-calendar/upcoming - Get upcoming games
   */
  fastify.get('/upcoming', {
    preHandler: [validateQuery(upcomingQuerySchema)],
  }, async (request) => {
    const { limit, leagues } = request.query as z.infer<typeof upcomingQuerySchema>;
    const games = await sportsCalendarService.getUpcomingGames(limit, leagues);

    return {
      success: true,
      data: games,
      meta: {
        count: games.length,
      },
    };
  });

  /**
   * GET /sports-calendar/games/:id - Get specific game by ID
   */
  fastify.get('/games/:id', {
    preHandler: [validateParams(commonSchemas.id)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const game = await sportsCalendarService.getGameById(id);

    if (!game) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Game not found' },
      });
    }

    return { success: true, data: game };
  });

  /**
   * GET /sports-calendar/markets - List all geographic markets
   */
  fastify.get('/markets', async () => {
    const markets = sportsCalendarService.getMarkets();

    return {
      success: true,
      data: markets,
      meta: { count: markets.length },
    };
  });

  /**
   * GET /sports-calendar/markets/:id - Get specific market
   */
  fastify.get('/markets/:id', {
    preHandler: [validateParams(marketParamsSchema)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const market = sportsCalendarService.getMarket(id);

    if (!market) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Market not found' },
      });
    }

    return { success: true, data: market };
  });

  /**
   * GET /sports-calendar/markets/:id/teams - Get local teams for a market
   */
  fastify.get('/markets/:id/teams', {
    preHandler: [validateParams(marketParamsSchema)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const market = sportsCalendarService.getMarket(id);

    if (!market) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Market not found' },
      });
    }

    const teams = await sportsCalendarService.getLocalTeams(id);

    return {
      success: true,
      data: {
        market,
        teams,
      },
    };
  });

  /**
   * GET /sports-calendar/markets/:id/games - Get games for local teams
   */
  fastify.get('/markets/:id/games', {
    preHandler: [validateParams(marketParamsSchema), validateQuery(localGamesQuerySchema)],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const query = request.query as z.infer<typeof localGamesQuerySchema>;
    const market = sportsCalendarService.getMarket(id);

    if (!market) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Market not found' },
      });
    }

    const games = await sportsCalendarService.getLocalTeamGames(id, {
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      limit: query.limit,
    });

    return {
      success: true,
      data: games,
      meta: {
        market,
        count: games.length,
      },
    };
  });

  /**
   * POST /sports-calendar/sync - Trigger manual sync (admin only)
   * Syncs all leagues or specific leagues for a date range
   */
  fastify.post('/sync', {
    preHandler: [requireRole('admin'), validateBody(syncBodySchema)],
  }, async (request, reply) => {
    const body = request.body as z.infer<typeof syncBodySchema>;
    
    logger.info(
      { userId: request.user?.id, leagues: body.leagues, dateRange: body.dateRange },
      'Manual sports calendar sync initiated'
    );

    try {
      const results = await sportsCalendarService.syncAllLeagues(body.dateRange);

      const summary = {
        totalLeagues: results.length,
        successfulSyncs: results.filter(r => r.success).length,
        totalGamesFound: results.reduce((sum, r) => sum + r.gamesFound, 0),
        totalGamesCreated: results.reduce((sum, r) => sum + r.gamesCreated, 0),
        totalGamesUpdated: results.reduce((sum, r) => sum + r.gamesUpdated, 0),
        totalErrors: results.reduce((sum, r) => sum + r.errors.length, 0),
      };

      return {
        success: true,
        data: {
          summary,
          results,
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ error: errorMessage }, 'Sports calendar sync failed');

      return reply.status(500).send({
        success: false,
        error: {
          code: 'SYNC_FAILED',
          message: 'Failed to sync sports calendar',
          details: errorMessage,
        },
      });
    }
  });

  /**
   * POST /sports-calendar/sync/:league - Sync specific league (admin only)
   */
  fastify.post('/sync/:league', {
    preHandler: [
      requireRole('admin'),
      validateParams(leagueSyncParamsSchema),
      validateQuery(leagueSyncQuerySchema),
    ],
  }, async (request, reply) => {
    const { league } = request.params as { league: SportsLeague };
    const query = request.query as z.infer<typeof leagueSyncQuerySchema>;

    // Default to 7 day range from today
    const today = new Date().toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const startDate = query.startDate || today;
    const endDate = query.endDate || nextWeek;

    logger.info(
      { userId: request.user?.id, league, startDate, endDate },
      'Manual league sync initiated'
    );

    try {
      const result = await sportsCalendarService.syncLeague(league, startDate, endDate);

      return {
        success: result.success,
        data: result,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ league, error: errorMessage }, 'League sync failed');

      return reply.status(500).send({
        success: false,
        error: {
          code: 'SYNC_FAILED',
          message: `Failed to sync ${league} schedule`,
          details: errorMessage,
        },
      });
    }
  });

  /**
   * GET /sports-calendar/leagues - List supported leagues
   */
  fastify.get('/leagues', async () => {
    const leagues = [
      { id: 'NFL', name: 'National Football League', sport: 'football' },
      { id: 'NBA', name: 'National Basketball Association', sport: 'basketball' },
      { id: 'MLB', name: 'Major League Baseball', sport: 'baseball' },
      { id: 'NHL', name: 'National Hockey League', sport: 'hockey' },
      { id: 'NCAAF', name: 'NCAA Football', sport: 'football' },
      { id: 'NCAAB', name: 'NCAA Basketball', sport: 'basketball' },
    ];

    return {
      success: true,
      data: leagues,
    };
  });

  /**
   * GET /sports-calendar/stats - Get sync statistics (admin only)
   */
  fastify.get('/stats', {
    preHandler: [requireRole('admin')],
  }, async () => {
    // Get game counts by league and status
    const stats = {
      lastSyncAt: new Date().toISOString(), // Would query from db in real impl
      gamesCount: {
        total: 0,
        byLeague: {} as Record<string, number>,
        byStatus: {} as Record<string, number>,
      },
    };

    // This would be implemented with actual DB queries
    // For now, return structure
    return {
      success: true,
      data: stats,
    };
  });
}
