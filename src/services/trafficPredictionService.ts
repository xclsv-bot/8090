/**
 * Traffic Prediction Service - WO-85
 * Scoring algorithm for predicting event traffic/performance
 */

import { db } from './database.js';
import { logger } from '../utils/logger.js';
import {
  calculateGameRelevance,
  calculateHistoricalPerformance,
  calculateDayTimeScore,
  calculateSeasonalScore,
  calculateManualInsightScore,
  getScoringFactorsConfig,
  GameInfo,
  VenueInfo,
  HistoricalPerformance,
  ManualInsight,
  ScoringFactorResult,
} from '../utils/scoringFactors.js';

// ============================================
// TYPES
// ============================================

export interface TrafficPredictionInput {
  eventId?: string;
  venueId: string;
  eventDate: Date;
  game?: GameInfo;
  manualInsight?: ManualInsight;
}

export interface TrafficPredictionScore {
  totalScore: number;
  normalizedScore: number; // 0-100 scale
  confidence: 'low' | 'medium' | 'high';
  tier: 'excellent' | 'good' | 'average' | 'below_average' | 'poor';
  factors: ScoringFactorResult[];
  predictedSignups: {
    low: number;
    expected: number;
    high: number;
  };
  generatedAt: string;
}

export interface VenueHistoryResult {
  venueId: string;
  venueName: string;
  history: HistoricalPerformance | null;
  recentEvents: Array<{
    eventId: string;
    eventDate: string;
    signups: number;
    ambassadorCount: number;
    signupsPerAmbassador: number;
  }>;
}

export interface Recommendation {
  venueId: string;
  venueName: string;
  score: number;
  tier: string;
  reason: string;
  suggestedAmbassadors: number;
}

// Score tiers
const TIER_THRESHOLDS = {
  excellent: 85,
  good: 70,
  average: 50,
  below_average: 35,
};

// Simple in-memory cache
const scoreCache = new Map<string, { score: TrafficPredictionScore; expiry: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ============================================
// SERVICE CLASS
// ============================================

class TrafficPredictionService {
  /**
   * Calculate traffic prediction score for an event
   */
  async calculateScore(input: TrafficPredictionInput): Promise<TrafficPredictionScore> {
    const cacheKey = this.getCacheKey(input);
    const cached = scoreCache.get(cacheKey);
    
    if (cached && cached.expiry > Date.now()) {
      logger.debug({ cacheKey }, 'Traffic prediction score cache hit');
      return cached.score;
    }
    
    // Fetch venue info
    const venue = await this.getVenueInfo(input.venueId);
    if (!venue) {
      throw new Error(`Venue not found: ${input.venueId}`);
    }
    
    // Fetch historical performance
    const history = await this.getVenueHistory(input.venueId);
    
    // Calculate all factors
    const factors: ScoringFactorResult[] = [];
    
    // 1. Game Relevance (max 50 points)
    const gameRelevance = calculateGameRelevance(input.game || {}, venue);
    factors.push(gameRelevance);
    
    // 2. Historical Performance (max 25 points)
    const historicalPerf = calculateHistoricalPerformance(history);
    factors.push(historicalPerf);
    
    // 3. Day/Time Score (max 15 points)
    const dayTimeScore = calculateDayTimeScore(input.eventDate);
    factors.push(dayTimeScore);
    
    // 4. Seasonal Score (max 10 points)
    const seasonalScore = calculateSeasonalScore(input.eventDate);
    factors.push(seasonalScore);
    
    // 5. Manual Insight (-20 to +20 points)
    const manualInsight = calculateManualInsightScore(input.manualInsight || null);
    factors.push(manualInsight);
    
    // Calculate total
    const totalScore = factors.reduce((sum, f) => sum + f.weightedScore, 0);
    
    // Normalize to 0-100 (base max is 100, but manual insight can push it higher)
    const normalizedScore = Math.max(0, Math.min(100, totalScore));
    
    // Determine confidence based on data availability
    const confidence = this.determineConfidence(history, input);
    
    // Determine tier
    const tier = this.determineTier(normalizedScore);
    
    // Predict signups based on historical + score
    const predictedSignups = this.predictSignups(normalizedScore, history, venue);
    
    const score: TrafficPredictionScore = {
      totalScore: Math.round(totalScore * 10) / 10,
      normalizedScore: Math.round(normalizedScore),
      confidence,
      tier,
      factors,
      predictedSignups,
      generatedAt: new Date().toISOString(),
    };
    
    // Cache the result
    scoreCache.set(cacheKey, { score, expiry: Date.now() + CACHE_TTL_MS });
    
    logger.info(
      { venueId: input.venueId, totalScore: score.totalScore, tier },
      'Traffic prediction score calculated'
    );
    
    return score;
  }

  /**
   * Get recommendations for upcoming events based on scores
   */
  async getRecommendations(
    limit: number = 10,
    dateFrom?: Date,
    dateTo?: Date
  ): Promise<Recommendation[]> {
    // Get upcoming events
    const fromDate = dateFrom || new Date();
    const toDate = dateTo || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    
    // Query events directly (no venues table - venue is stored as text on events)
    const events = await db.query<{
      id: string;
      venue: string;
      city: string;
      state: string;
      event_date: Date;
      title: string;
      signup_goal: number;
    }>(
      `SELECT 
        e.id,
        e.venue,
        e.city,
        e.state,
        e.event_date,
        e.title,
        e.signup_goal
       FROM events e
       WHERE e.event_date >= $1 
         AND e.event_date <= $2
         AND e.status NOT IN ('cancelled', 'completed')
       ORDER BY e.event_date ASC
       LIMIT 100`,
      [fromDate.toISOString(), toDate.toISOString()]
    );
    
    const recommendations: Recommendation[] = [];
    
    // Look up relevant sports games for date range
    const games = await db.query<{
      home_team: string;
      away_team: string;
      league: string;
      is_playoffs: boolean;
      broadcast_network: string;
      game_date: Date;
      city: string;
      state: string;
    }>(
      `SELECT 
        home_team->>'name' as home_team,
        away_team->>'name' as away_team,
        league,
        COALESCE((relevance_flags->>'isPlayoff')::boolean, false) as is_playoffs,
        broadcasts[1]->>'network' as broadcast_network,
        game_date,
        venue->>'city' as city,
        venue->>'state' as state
       FROM sports_games
       WHERE game_date >= $1 AND game_date <= $2
       ORDER BY game_date ASC`,
      [fromDate.toISOString(), toDate.toISOString()]
    );
    
    for (const event of events.rows) {
      try {
        // Find matching games by city/region
        const matchingGame = games.rows.find(g => 
          g.city?.toLowerCase() === event.city?.toLowerCase() ||
          g.state?.toLowerCase()?.includes(event.city?.toLowerCase() || '')
        );
        
        // Calculate a simplified score based on available data
        const dayOfWeek = new Date(event.event_date).getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 5 || dayOfWeek === 6;
        
        let baseScore = 50; // Default score
        if (matchingGame) baseScore += 25; // Game in area
        if (matchingGame?.is_playoffs) baseScore += 15;
        if (isWeekend) baseScore += 10;
        
        const normalizedScore = Math.min(100, baseScore);
        const tier = normalizedScore >= 85 ? 'excellent' : 
                     normalizedScore >= 70 ? 'good' : 
                     normalizedScore >= 50 ? 'average' : 
                     normalizedScore >= 35 ? 'below_average' : 'poor';
        
        recommendations.push({
          venueId: event.id, // Use event ID as identifier
          venueName: event.venue || event.title,
          score: normalizedScore,
          tier,
          reason: matchingGame 
            ? `${matchingGame.home_team} vs ${matchingGame.away_team} game nearby`
            : isWeekend ? 'Weekend event' : 'Scheduled event',
          suggestedAmbassadors: Math.max(2, Math.ceil((event.signup_goal || 20) / 10)),
        });
      } catch (error) {
        logger.warn({ eventId: event.id, error }, 'Failed to calculate score for event');
      }
    }
    
    // Sort by score descending and limit
    return recommendations
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  /**
   * Get detailed venue history with ambassador-normalized performance
   */
  async getVenueHistoryDetails(venueId: string): Promise<VenueHistoryResult> {
    const venue = await this.getVenueInfo(venueId);
    if (!venue) {
      throw new Error(`Venue not found: ${venueId}`);
    }
    
    const history = await this.getVenueHistory(venueId);
    
    // Get recent events detail
    const recentEvents = await db.query<{
      event_id: string;
      event_date: string;
      signups: string;
      ambassador_count: string;
    }>(
      `SELECT 
        e.id as event_id,
        e.event_date,
        COUNT(s.id) as signups,
        COUNT(DISTINCT a.ambassador_id) as ambassador_count
       FROM events e
       LEFT JOIN signups s ON s.event_id = e.id AND s.validation_status = 'validated'
       LEFT JOIN assignments a ON a.event_id = e.id
       WHERE e.venue_id = $1
         AND e.status = 'completed'
       GROUP BY e.id, e.event_date
       ORDER BY e.event_date DESC
       LIMIT 20`,
      [venueId]
    );
    
    return {
      venueId,
      venueName: venue.name,
      history,
      recentEvents: recentEvents.rows.map(e => ({
        eventId: e.event_id,
        eventDate: e.event_date,
        signups: parseInt(e.signups) || 0,
        ambassadorCount: parseInt(e.ambassador_count) || 1,
        signupsPerAmbassador: 
          (parseInt(e.signups) || 0) / Math.max(1, parseInt(e.ambassador_count) || 1),
      })),
    };
  }

  /**
   * Clear cached scores for a venue
   */
  clearCache(venueId?: string): void {
    if (venueId) {
      const keysToDelete = Array.from(scoreCache.keys()).filter(key => key.includes(venueId));
      keysToDelete.forEach(key => scoreCache.delete(key));
    } else {
      scoreCache.clear();
    }
    logger.info({ venueId }, 'Traffic prediction cache cleared');
  }

  /**
   * Get scoring configuration for API documentation
   */
  getConfiguration(): ReturnType<typeof getScoringFactorsConfig> {
    return getScoringFactorsConfig();
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  private getCacheKey(input: TrafficPredictionInput): string {
    return `${input.venueId}:${input.eventDate.toISOString().split('T')[0]}:${JSON.stringify(input.game || {})}`;
  }

  private async getVenueInfo(venueId: string): Promise<VenueInfo | null> {
    const result = await db.queryOne<{
      id: string;
      name: string;
      city: string;
      state: string;
      local_teams: string[] | null;
    }>(
      `SELECT id, name, city, state, local_teams 
       FROM venues 
       WHERE id = $1`,
      [venueId]
    );
    
    if (!result) return null;
    
    return {
      id: result.id,
      name: result.name,
      city: result.city,
      state: result.state,
      localTeams: result.local_teams || [],
    };
  }

  private async getVenueHistory(venueId: string): Promise<HistoricalPerformance | null> {
    // Get aggregated historical data
    const result = await db.queryOne<{
      total_events: string;
      avg_signups: string;
      total_signups: string;
      total_ambassadors: string;
      events_meeting_projection: string;
    }>(
      `WITH event_stats AS (
        SELECT 
          e.id,
          e.projected_signups,
          COUNT(s.id) as actual_signups,
          COUNT(DISTINCT a.ambassador_id) as ambassador_count
        FROM events e
        LEFT JOIN signups s ON s.event_id = e.id AND s.validation_status = 'validated'
        LEFT JOIN assignments a ON a.event_id = e.id
        WHERE e.venue_id = $1
          AND e.status = 'completed'
          AND e.event_date >= NOW() - INTERVAL '12 months'
        GROUP BY e.id
      )
      SELECT 
        COUNT(*) as total_events,
        AVG(actual_signups) as avg_signups,
        SUM(actual_signups) as total_signups,
        SUM(ambassador_count) as total_ambassadors,
        COUNT(*) FILTER (WHERE actual_signups >= COALESCE(projected_signups, 0)) as events_meeting_projection
      FROM event_stats`,
      [venueId]
    );
    
    if (!result || parseInt(result.total_events) === 0) {
      return null;
    }
    
    const totalEvents = parseInt(result.total_events);
    const avgSignups = parseFloat(result.avg_signups) || 0;
    const totalSignups = parseInt(result.total_signups) || 0;
    const totalAmbassadors = parseInt(result.total_ambassadors) || 1;
    const eventsMeetingProjection = parseInt(result.events_meeting_projection) || 0;
    
    // Get recent trend
    const trendResult = await db.queryOne<{
      recent_avg: string;
      older_avg: string;
    }>(
      `WITH recent AS (
        SELECT AVG(cnt) as avg_signups
        FROM (
          SELECT COUNT(s.id) as cnt
          FROM events e
          LEFT JOIN signups s ON s.event_id = e.id AND s.validation_status = 'validated'
          WHERE e.venue_id = $1 AND e.status = 'completed'
          ORDER BY e.event_date DESC
          LIMIT 3
        ) sub
      ),
      older AS (
        SELECT AVG(cnt) as avg_signups
        FROM (
          SELECT COUNT(s.id) as cnt
          FROM events e
          LEFT JOIN signups s ON s.event_id = e.id AND s.validation_status = 'validated'
          WHERE e.venue_id = $1 AND e.status = 'completed'
          ORDER BY e.event_date DESC
          LIMIT 6 OFFSET 3
        ) sub
      )
      SELECT recent.avg_signups as recent_avg, older.avg_signups as older_avg
      FROM recent, older`,
      [venueId]
    );
    
    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (trendResult) {
      const recentAvg = parseFloat(trendResult.recent_avg) || 0;
      const olderAvg = parseFloat(trendResult.older_avg) || recentAvg;
      
      if (olderAvg > 0) {
        const change = (recentAvg - olderAvg) / olderAvg;
        if (change > 0.1) trend = 'up';
        else if (change < -0.1) trend = 'down';
      }
    }
    
    return {
      totalEvents,
      avgSignups,
      avgSignupsPerAmbassador: totalSignups / Math.max(1, totalAmbassadors),
      successRate: eventsMeetingProjection / totalEvents,
      recentTrend: trend,
    };
  }

  private determineConfidence(
    history: HistoricalPerformance | null,
    input: TrafficPredictionInput
  ): 'low' | 'medium' | 'high' {
    let confidenceScore = 0;
    
    // Historical data contributes most
    if (history) {
      if (history.totalEvents >= 10) confidenceScore += 3;
      else if (history.totalEvents >= 5) confidenceScore += 2;
      else if (history.totalEvents >= 2) confidenceScore += 1;
    }
    
    // Game info helps
    if (input.game?.homeTeam && input.game?.awayTeam) {
      confidenceScore += 1;
    }
    
    // Manual insight adds confidence
    if (input.manualInsight?.confidenceAdjustment !== undefined) {
      confidenceScore += 1;
    }
    
    if (confidenceScore >= 4) return 'high';
    if (confidenceScore >= 2) return 'medium';
    return 'low';
  }

  private determineTier(score: number): TrafficPredictionScore['tier'] {
    if (score >= TIER_THRESHOLDS.excellent) return 'excellent';
    if (score >= TIER_THRESHOLDS.good) return 'good';
    if (score >= TIER_THRESHOLDS.average) return 'average';
    if (score >= TIER_THRESHOLDS.below_average) return 'below_average';
    return 'poor';
  }

  private predictSignups(
    score: number,
    history: HistoricalPerformance | null,
    venue: VenueInfo
  ): TrafficPredictionScore['predictedSignups'] {
    // Base prediction on history if available
    let baseSignups = history?.avgSignups || 15; // Default assumption
    
    // Adjust based on score (100 = 130% of base, 50 = 100%, 0 = 70%)
    const scoreMultiplier = 0.7 + (score / 100) * 0.6;
    const expected = Math.round(baseSignups * scoreMultiplier);
    
    // Range based on confidence (roughly ±25% for low confidence, ±10% for high)
    const variance = history && history.totalEvents >= 5 ? 0.15 : 0.3;
    
    return {
      low: Math.max(1, Math.round(expected * (1 - variance))),
      expected,
      high: Math.round(expected * (1 + variance)),
    };
  }

  private generateRecommendationReason(score: TrafficPredictionScore): string {
    const topFactors = score.factors
      .filter(f => f.weightedScore > 0)
      .sort((a, b) => b.weightedScore - a.weightedScore)
      .slice(0, 2);
    
    const reasons: string[] = [];
    
    for (const factor of topFactors) {
      switch (factor.name) {
        case 'gameRelevance':
          if (factor.details?.localTeamBonus) reasons.push('local team game');
          if (factor.details?.primetimeBonus) reasons.push('primetime slot');
          if (factor.details?.playoffsBonus) reasons.push('playoff game');
          break;
        case 'historicalPerformance':
          if (factor.weightedScore > 18) reasons.push('strong venue history');
          break;
        case 'dayTimeScore':
          if (factor.weightedScore > 12) reasons.push('optimal day/time');
          break;
        case 'seasonalScore':
          if (factor.weightedScore > 10) reasons.push('peak season');
          break;
      }
    }
    
    if (reasons.length === 0) {
      return score.tier === 'excellent' || score.tier === 'good' 
        ? 'High overall potential'
        : 'Standard opportunity';
    }
    
    return reasons.join(', ');
  }

  private suggestAmbassadorCount(score: TrafficPredictionScore): number {
    // Base suggestion on predicted signups
    const expected = score.predictedSignups.expected;
    
    // Target 4-6 signups per ambassador
    const suggested = Math.ceil(expected / 5);
    
    // Minimum 1, max 10 per event
    return Math.max(1, Math.min(10, suggested));
  }
}

// Export singleton instance
export const trafficPredictionService = new TrafficPredictionService();
