/**
 * Performance Service
 * WO-11: Performance scoring and skill level management
 * WO-7, WO-51: Performance Dashboard
 */

import { db } from './database.js';
import { logger } from '../utils/logger.js';

interface PerformanceScore {
  ambassadorId: string;
  score: number;
  breakdown: {
    signupVolume: number;
    validationRate: number;
    consistency: number;
    eventParticipation: number;
  };
  calculatedAt: Date;
}

interface SkillLevelCriteria {
  level: string;
  minScore: number;
  minSignups: number;
  minEvents: number;
  minTenureDays: number;
}

class PerformanceService {
  private skillCriteria: SkillLevelCriteria[] = [
    { level: 'lead', minScore: 90, minSignups: 200, minEvents: 50, minTenureDays: 180 },
    { level: 'senior', minScore: 75, minSignups: 100, minEvents: 25, minTenureDays: 90 },
    { level: 'standard', minScore: 50, minSignups: 25, minEvents: 10, minTenureDays: 30 },
    { level: 'trainee', minScore: 0, minSignups: 0, minEvents: 0, minTenureDays: 0 },
  ];

  /**
   * Calculate performance score for ambassador
   */
  async calculateScore(ambassadorId: string): Promise<PerformanceScore> {
    const [signupStats, eventStats, consistencyStats] = await Promise.all([
      this.getSignupStats(ambassadorId),
      this.getEventStats(ambassadorId),
      this.getConsistencyStats(ambassadorId),
    ]);

    // Weight each component
    const breakdown = {
      signupVolume: Math.min(signupStats.volumeScore, 30), // Max 30 points
      validationRate: Math.min(signupStats.validationScore, 25), // Max 25 points
      consistency: Math.min(consistencyStats.score, 25), // Max 25 points
      eventParticipation: Math.min(eventStats.participationScore, 20), // Max 20 points
    };

    const totalScore = Object.values(breakdown).reduce((a, b) => a + b, 0);

    // Store the score
    await db.query(
      `INSERT INTO ambassador_performance_history (
        ambassador_id, performance_score, score_breakdown, calculated_at
      ) VALUES ($1, $2, $3, NOW())`,
      [ambassadorId, totalScore, JSON.stringify(breakdown)]
    );

    logger.info({ ambassadorId, score: totalScore }, 'Performance score calculated');

    return {
      ambassadorId,
      score: totalScore,
      breakdown,
      calculatedAt: new Date(),
    };
  }

  private async getSignupStats(ambassadorId: string): Promise<{ volumeScore: number; validationScore: number }> {
    const result = await db.queryOne<{
      total: string;
      validated: string;
      last_90_days: string;
    }>(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE validation_status = 'validated') as validated,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '90 days') as last_90_days
       FROM signups WHERE ambassador_id = $1`,
      [ambassadorId]
    );

    const total = parseInt(result?.total || '0');
    const validated = parseInt(result?.validated || '0');
    const last90Days = parseInt(result?.last_90_days || '0');

    // Volume score: based on last 90 days signups
    const volumeScore = Math.min((last90Days / 50) * 30, 30);

    // Validation rate score
    const validationRate = total > 0 ? (validated / total) * 100 : 0;
    const validationScore = (validationRate / 100) * 25;

    return { volumeScore, validationScore };
  }

  private async getEventStats(ambassadorId: string): Promise<{ participationScore: number }> {
    const result = await db.queryOne<{
      events_attended: string;
      events_completed: string;
      no_shows: string;
    }>(
      `SELECT 
        COUNT(*) as events_attended,
        COUNT(*) FILTER (WHERE status = 'completed') as events_completed,
        COUNT(*) FILTER (WHERE status = 'no_show') as no_shows
       FROM event_assignments 
       WHERE ambassador_id = $1 AND created_at >= NOW() - INTERVAL '90 days'`,
      [ambassadorId]
    );

    const attended = parseInt(result?.events_attended || '0');
    const completed = parseInt(result?.events_completed || '0');
    const noShows = parseInt(result?.no_shows || '0');

    // Penalize no-shows
    const completionRate = attended > 0 ? (completed / attended) * 100 : 0;
    const noShowPenalty = noShows * 2;

    const participationScore = Math.max((completionRate / 100) * 20 - noShowPenalty, 0);

    return { participationScore };
  }

  private async getConsistencyStats(ambassadorId: string): Promise<{ score: number }> {
    // Check weekly activity over last 12 weeks
    const result = await db.queryMany<{ week: Date; signups: string }>(
      `SELECT DATE_TRUNC('week', created_at) as week, COUNT(*) as signups
       FROM signups 
       WHERE ambassador_id = $1 AND created_at >= NOW() - INTERVAL '12 weeks'
       GROUP BY DATE_TRUNC('week', created_at)`,
      [ambassadorId]
    );

    // Score based on number of active weeks
    const activeWeeks = result.length;
    const score = (activeWeeks / 12) * 25;

    return { score };
  }

  /**
   * Calculate scores for all active ambassadors
   */
  async calculateAllScores(): Promise<{ calculated: number; errors: number }> {
    const ambassadors = await db.queryMany<{ id: string }>(
      "SELECT id FROM ambassadors WHERE status = 'active'"
    );

    let calculated = 0;
    let errors = 0;

    for (const ambassador of ambassadors) {
      try {
        await this.calculateScore(ambassador.id);
        calculated++;
      } catch (error) {
        logger.error({ error, ambassadorId: ambassador.id }, 'Failed to calculate score');
        errors++;
      }
    }

    logger.info({ calculated, errors }, 'Batch score calculation completed');
    return { calculated, errors };
  }

  /**
   * Evaluate and update skill levels
   */
  async evaluateSkillLevels(): Promise<{
    promoted: { id: string; from: string; to: string }[];
    unchanged: number;
  }> {
    const ambassadors = await db.queryMany<{
      id: string;
      skill_level: string;
      created_at: Date;
    }>(
      "SELECT id, skill_level, created_at FROM ambassadors WHERE status = 'active'"
    );

    const promoted: { id: string; from: string; to: string }[] = [];
    let unchanged = 0;

    for (const ambassador of ambassadors) {
      const [score, signups, events] = await Promise.all([
        this.getLatestScore(ambassador.id),
        db.queryOne<{ count: string }>(
          'SELECT COUNT(*) as count FROM signups WHERE ambassador_id = $1',
          [ambassador.id]
        ),
        db.queryOne<{ count: string }>(
          "SELECT COUNT(*) as count FROM event_assignments WHERE ambassador_id = $1 AND status = 'completed'",
          [ambassador.id]
        ),
      ]);

      const tenureDays = Math.floor(
        (Date.now() - new Date(ambassador.created_at).getTime()) / (1000 * 60 * 60 * 24)
      );
      const totalSignups = parseInt(signups?.count || '0');
      const totalEvents = parseInt(events?.count || '0');

      // Find appropriate skill level
      const newLevel = this.determineSkillLevel(
        score?.score || 0,
        totalSignups,
        totalEvents,
        tenureDays
      );

      if (newLevel !== ambassador.skill_level) {
        await db.query(
          'UPDATE ambassadors SET skill_level = $1, updated_at = NOW() WHERE id = $2',
          [newLevel, ambassador.id]
        );
        promoted.push({
          id: ambassador.id,
          from: ambassador.skill_level,
          to: newLevel,
        });
      } else {
        unchanged++;
      }
    }

    logger.info({ promoted: promoted.length, unchanged }, 'Skill level evaluation completed');
    return { promoted, unchanged };
  }

  private determineSkillLevel(
    score: number,
    signups: number,
    events: number,
    tenureDays: number
  ): string {
    for (const criteria of this.skillCriteria) {
      if (
        score >= criteria.minScore &&
        signups >= criteria.minSignups &&
        events >= criteria.minEvents &&
        tenureDays >= criteria.minTenureDays
      ) {
        return criteria.level;
      }
    }
    return 'trainee';
  }

  /**
   * Get latest performance score
   */
  async getLatestScore(ambassadorId: string): Promise<PerformanceScore | null> {
    const result = await db.queryOne<{
      performance_score: number;
      score_breakdown: string;
      calculated_at: Date;
    }>(
      `SELECT performance_score, score_breakdown, calculated_at
       FROM ambassador_performance_history
       WHERE ambassador_id = $1
       ORDER BY calculated_at DESC LIMIT 1`,
      [ambassadorId]
    );

    if (!result) return null;

    return {
      ambassadorId,
      score: result.performance_score,
      breakdown: JSON.parse(result.score_breakdown),
      calculatedAt: result.calculated_at,
    };
  }

  /**
   * Get performance history
   */
  async getHistory(ambassadorId: string, limit = 12): Promise<PerformanceScore[]> {
    const results = await db.queryMany<{
      performance_score: number;
      score_breakdown: string;
      calculated_at: Date;
    }>(
      `SELECT performance_score, score_breakdown, calculated_at
       FROM ambassador_performance_history
       WHERE ambassador_id = $1
       ORDER BY calculated_at DESC
       LIMIT $2`,
      [ambassadorId, limit]
    );

    return results.map(r => ({
      ambassadorId,
      score: r.performance_score,
      breakdown: JSON.parse(r.score_breakdown),
      calculatedAt: r.calculated_at,
    }));
  }

  /**
   * Get leaderboard
   */
  async getLeaderboard(limit = 20): Promise<{
    rank: number;
    ambassadorId: string;
    name: string;
    score: number;
    skillLevel: string;
  }[]> {
    const results = await db.queryMany<{
      ambassador_id: string;
      first_name: string;
      last_name: string;
      skill_level: string;
      performance_score: number;
    }>(
      `SELECT DISTINCT ON (a.id) a.id as ambassador_id, a.first_name, a.last_name, a.skill_level, ph.performance_score
       FROM ambassadors a
       JOIN ambassador_performance_history ph ON ph.ambassador_id = a.id
       WHERE a.status = 'active'
       ORDER BY a.id, ph.calculated_at DESC`,
      []
    );

    // Sort by score and add rank
    return results
      .sort((a, b) => b.performance_score - a.performance_score)
      .slice(0, limit)
      .map((r, i) => ({
        rank: i + 1,
        ambassadorId: r.ambassador_id,
        name: `${r.first_name} ${r.last_name}`,
        score: r.performance_score,
        skillLevel: r.skill_level,
      }));
  }
}

export const performanceService = new PerformanceService();
