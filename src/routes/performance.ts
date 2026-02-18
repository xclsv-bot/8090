/**
 * Performance Routes
 * WO-7, WO-11, WO-51: Performance scoring and dashboards
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { performanceService } from '../services/performanceService.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateParams, commonSchemas } from '../middleware/validate.js';

export async function performanceRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', authenticate);

  /**
   * GET /performance/leaderboard - Get performance leaderboard
   */
  fastify.get('/leaderboard', async (request) => {
    const { limit } = request.query as { limit?: string };
    const leaderboard = await performanceService.getLeaderboard(limit ? parseInt(limit) : 20);
    return { success: true, data: leaderboard };
  });

  /**
   * GET /performance/ambassador/:id - Get ambassador performance
   */
  fastify.get('/ambassador/:id', {
    preHandler: [validateParams(commonSchemas.id)],
  }, async (request) => {
    const { id } = request.params as { id: string };
    
    // Ambassadors can only see their own performance
    if (request.user?.role === 'ambassador' && request.user?.id !== id) {
      return { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } };
    }

    const score = await performanceService.getLatestScore(id);
    return { success: true, data: score };
  });

  /**
   * GET /performance/ambassador/:id/history - Get performance history
   */
  fastify.get('/ambassador/:id/history', {
    preHandler: [validateParams(commonSchemas.id)],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const { limit } = request.query as { limit?: string };

    if (request.user?.role === 'ambassador' && request.user?.id !== id) {
      return { success: false, error: { code: 'FORBIDDEN', message: 'Access denied' } };
    }

    const history = await performanceService.getHistory(id, limit ? parseInt(limit) : 12);
    return { success: true, data: history };
  });

  /**
   * POST /performance/calculate/:id - Calculate score for ambassador
   */
  fastify.post('/calculate/:id', {
    preHandler: [requireRole('admin', 'manager'), validateParams(commonSchemas.id)],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const score = await performanceService.calculateScore(id);
    return { success: true, data: score };
  });

  /**
   * POST /performance/calculate-all - Calculate scores for all ambassadors
   */
  fastify.post('/calculate-all', {
    preHandler: [requireRole('admin')],
  }, async () => {
    const result = await performanceService.calculateAllScores();
    return { success: true, data: result };
  });

  /**
   * POST /performance/evaluate-levels - Evaluate and update skill levels
   */
  fastify.post('/evaluate-levels', {
    preHandler: [requireRole('admin')],
  }, async () => {
    const result = await performanceService.evaluateSkillLevels();
    return { success: true, data: result };
  });
}
