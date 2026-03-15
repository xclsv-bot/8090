/**
 * Traffic Prediction Service - WO-85 / WO-135
 * Scoring and recommendation service for event traffic intelligence.
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

export interface TrafficPredictionInput {
  eventId?: string;
  venueId: string;
  eventDate: Date;
  game?: GameInfo;
  manualInsight?: ManualInsight;
}

export interface TrafficScoreResponse {
  eventScore: number;
  breakdown: {
    gameRelevance: number;
    historicalPerformance: number;
    dayTimeFactor: number;
    seasonalFactor: number;
    manualInsight: number;
  };
  explanation: string;
  appliedWeights: {
    gameRelevance: number;
    historicalPerformance: number;
    dayTimeFactor: number;
    seasonalFactor: number;
    manualInsight: number;
  };
  confidenceLevel: 'low' | 'medium' | 'high';
  varianceFromHistorical: number;
}

export interface VenueHistoryResult {
  venueId: string;
  venueName: string;
  summaryStats: {
    avgSignups: number;
    totalEvents: number;
    successRate: number;
    confidenceLevel: 'low' | 'medium' | 'high';
  };
  recentEvents: Array<{
    eventId: string;
    date: string;
    time: string;
    signups: number;
    ambassadorCount: number;
    ambassador?: string;
  }>;
}

export interface AlertData {
  type: 'low_traffic' | 'conflict' | 'seasonal_trend' | 'low_confidence';
  severity: 'low' | 'medium' | 'high';
  message: string;
  dismissible: boolean;
}

export interface Recommendation {
  venueId: string;
  venueName: string;
  predictedScore: number;
  contributingFactors: string[];
  alerts: AlertData[];
}

export interface GameSchedule {
  date: string;
  time: string;
  teams: string;
  league: string;
  broadcastStatus: string;
  isLocalTeam: boolean;
  relevanceScore: number;
  isPlayoffs?: boolean;
  isChampionship?: boolean;
}

const WEIGHTS = {
  gameRelevance: 0.5,
  historicalPerformance: 0.25,
  dayTimeFactor: 0.15,
  seasonalFactor: 0.1,
  manualInsight: 1,
};

const scoreCache = new Map<string, { score: TrafficScoreResponse; expiry: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

class TrafficPredictionService {
  async calculateScore(input: TrafficPredictionInput): Promise<TrafficScoreResponse> {
    const cacheKey = this.getCacheKey(input);
    const cached = scoreCache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      logger.debug({ cacheKey }, 'Traffic prediction score cache hit');
      return cached.score;
    }

    const venue = await this.getVenueInfo(input.venueId);
    if (!venue) {
      throw new Error(`Venue not found: ${input.venueId}`);
    }

    const history = await this.getVenueHistory(input.venueId, venue.name);

    const gameRelevance = calculateGameRelevance(input.game || {}, venue);
    const historicalPerformance = calculateHistoricalPerformance(history);
    const dayTimeFactor = calculateDayTimeScore(input.eventDate);
    const seasonalFactor = calculateSeasonalScore(input.eventDate);
    const manualInsight = calculateManualInsightScore(input.manualInsight || null);

    const factors: ScoringFactorResult[] = [
      gameRelevance,
      historicalPerformance,
      dayTimeFactor,
      seasonalFactor,
      manualInsight,
    ];

    const rawScore = factors.reduce((sum, factor) => sum + factor.weightedScore, 0);
    const eventScore = Math.max(0, Math.min(100, Math.round(rawScore)));
    const confidenceLevel = this.determineConfidenceLevel(history, input.game, input.manualInsight);
    const varianceFromHistorical = this.calculateVarianceFromHistorical(eventScore, history);

    const score: TrafficScoreResponse = {
      eventScore,
      breakdown: {
        gameRelevance: this.round1(gameRelevance.weightedScore),
        historicalPerformance: this.round1(historicalPerformance.weightedScore),
        dayTimeFactor: this.round1(dayTimeFactor.weightedScore),
        seasonalFactor: this.round1(seasonalFactor.weightedScore),
        manualInsight: this.round1(manualInsight.weightedScore),
      },
      explanation: this.buildScoreExplanation(eventScore, factors, varianceFromHistorical, confidenceLevel),
      appliedWeights: WEIGHTS,
      confidenceLevel,
      varianceFromHistorical,
    };

    scoreCache.set(cacheKey, { score, expiry: Date.now() + CACHE_TTL_MS });

    return score;
  }

  async getRecommendations(options?: {
    limit?: number;
    region?: string;
    week?: number;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<Recommendation[]> {
    const limit = options?.limit ?? 10;
    const fromDate = options?.dateFrom || new Date();
    const toDate = options?.dateTo || new Date(Date.now() + 28 * 24 * 60 * 60 * 1000);

    const regionFilter = options?.region?.trim();

    const venues = await db.queryMany<{
      id: string;
      name: string;
      region: string;
      city: string | null;
      state: string | null;
    }>(
      `SELECT id, name, region, city, state
       FROM venues
       WHERE status = 'Active'
         AND ($1::text IS NULL OR region ILIKE $2)
       ORDER BY name
       LIMIT 100`,
      [regionFilter || null, regionFilter ? `%${regionFilter}%` : null]
    );

    const games = await this.getGamesForRange(fromDate, toDate, regionFilter);

    const recommendations: Recommendation[] = [];

    for (const venue of venues) {
      const score = await this.calculateScore({
        venueId: venue.id,
        eventDate: fromDate,
        game: this.pickMostRelevantGame(games, venue),
      }).catch(() => null);

      if (!score) {
        continue;
      }

      const alerts = this.getRecommendationAlerts(score, games, venue);
      const contributingFactors = this.getContributingFactors(score);

      recommendations.push({
        venueId: venue.id,
        venueName: venue.name,
        predictedScore: score.eventScore,
        contributingFactors,
        alerts,
      });
    }

    return recommendations
      .sort((a, b) => b.predictedScore - a.predictedScore)
      .slice(0, limit);
  }

  async getVenueHistoryDetails(venueId: string): Promise<VenueHistoryResult> {
    const venue = await this.getVenueInfo(venueId);
    if (!venue) {
      throw new Error(`Venue not found: ${venueId}`);
    }

    const history = await this.getVenueHistory(venueId, venue.name);

    const recentEvents = await db.queryMany<{
      event_id: string;
      event_date: string;
      start_time: string | null;
      signups: string;
      ambassador_count: string;
      ambassador: string | null;
    }>(
      `SELECT
        e.id as event_id,
        e.event_date,
        e.start_time,
        COUNT(s.id) FILTER (WHERE s.validation_status = 'validated') as signups,
        COUNT(DISTINCT a.ambassador_id) as ambassador_count,
        MIN(COALESCE(amb.first_name || ' ' || amb.last_name, NULL)) as ambassador
       FROM events e
       LEFT JOIN signups s ON s.event_id = e.id
       LEFT JOIN assignments a ON a.event_id = e.id
       LEFT JOIN ambassadors amb ON amb.id = a.ambassador_id
       WHERE (e.venue_id = $1 OR LOWER(e.venue) = LOWER($2))
         AND e.status IN ('completed', 'active', 'confirmed')
       GROUP BY e.id, e.event_date, e.start_time
       ORDER BY e.event_date DESC
       LIMIT 10`,
      [venueId, venue.name]
    );

    const confidenceLevel = this.determineConfidenceLevel(history);

    return {
      venueId,
      venueName: venue.name,
      summaryStats: {
        avgSignups: this.round1(history?.avgSignups || 0),
        totalEvents: history?.totalEvents || 0,
        successRate: this.round2(history?.successRate || 0),
        confidenceLevel,
      },
      recentEvents: recentEvents.map((event) => ({
        eventId: event.event_id,
        date: event.event_date,
        time: event.start_time || '',
        signups: parseInt(event.signups, 10) || 0,
        ambassadorCount: parseInt(event.ambassador_count, 10) || 0,
        ambassador: event.ambassador || undefined,
      })),
    };
  }

  async getSportsCalendar(date: string, region?: string): Promise<GameSchedule[]> {
    const baseDate = new Date(`${date}T00:00:00`);
    if (Number.isNaN(baseDate.getTime())) {
      throw new Error('Invalid date provided for sports calendar');
    }

    const endDate = new Date(baseDate);
    endDate.setDate(endDate.getDate() + 7);

    const games = await this.getGamesForRange(baseDate, endDate, region);

    return games
      .map((game) => {
        const gameDate = new Date(game.game_date);
        const homeTeam = game.home_team || 'TBD';
        const awayTeam = game.away_team || 'TBD';
        const isPlayoffs = game.is_playoffs;
        const isChampionship = /championship|final/i.test(game.game_type || '');

        const relevanceScore = Math.min(
          100,
          (game.local_market_match ? 35 : 15) +
            (isPlayoffs ? 30 : 0) +
            (game.is_national_broadcast ? 20 : 0) +
            (game.is_primetime ? 15 : 0)
        );

        return {
          date: gameDate.toISOString().split('T')[0],
          time: gameDate.toISOString().split('T')[1]?.slice(0, 5) || '19:00',
          teams: `${awayTeam} vs ${homeTeam}`,
          league: game.league,
          broadcastStatus: game.broadcast_network || (game.is_national_broadcast ? 'National' : 'Regional'),
          isLocalTeam: game.local_market_match,
          relevanceScore,
          isPlayoffs,
          isChampionship,
        };
      })
      .sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  clearCache(venueId?: string): void {
    if (venueId) {
      const keys = [...scoreCache.keys()].filter((key) => key.includes(venueId));
      keys.forEach((key) => scoreCache.delete(key));
      return;
    }
    scoreCache.clear();
  }

  getConfiguration(): ReturnType<typeof getScoringFactorsConfig> {
    return getScoringFactorsConfig();
  }

  private getCacheKey(input: TrafficPredictionInput): string {
    return `${input.venueId}:${input.eventDate.toISOString()}:${JSON.stringify(input.game || {})}`;
  }

  private async getVenueInfo(venueId: string): Promise<VenueInfo | null> {
    const venue = await db.queryOne<{
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

    if (!venue) return null;

    return {
      id: venue.id,
      name: venue.name,
      city: venue.city,
      state: venue.state,
      localTeams: venue.local_teams || [],
    };
  }

  private async getVenueHistory(venueId: string, venueName: string): Promise<HistoricalPerformance | null> {
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
          COUNT(s.id) FILTER (WHERE s.validation_status = 'validated') as actual_signups,
          COUNT(DISTINCT a.ambassador_id) as ambassador_count
        FROM events e
        LEFT JOIN signups s ON s.event_id = e.id
        LEFT JOIN assignments a ON a.event_id = e.id
        WHERE (e.venue_id = $1 OR LOWER(e.venue) = LOWER($2))
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
      [venueId, venueName]
    );

    if (!result || parseInt(result.total_events, 10) === 0) {
      return null;
    }

    const totalEvents = parseInt(result.total_events, 10);
    const totalSignups = parseInt(result.total_signups, 10) || 0;
    const totalAmbassadors = parseInt(result.total_ambassadors, 10) || 1;
    const avgSignups = parseFloat(result.avg_signups) || 0;
    const eventsMeetingProjection = parseInt(result.events_meeting_projection, 10) || 0;

    return {
      totalEvents,
      avgSignups,
      avgSignupsPerAmbassador: totalSignups / Math.max(1, totalAmbassadors),
      successRate: eventsMeetingProjection / Math.max(1, totalEvents),
      recentTrend: await this.getRecentTrend(venueId, venueName),
    };
  }

  private async getRecentTrend(venueId: string, venueName: string): Promise<'up' | 'down' | 'stable'> {
    const trend = await db.queryOne<{ recent_avg: string | null; older_avg: string | null }>(
      `WITH recent AS (
        SELECT AVG(signup_count) as recent_avg
        FROM (
          SELECT COUNT(s.id) FILTER (WHERE s.validation_status = 'validated') as signup_count
          FROM events e
          LEFT JOIN signups s ON s.event_id = e.id
          WHERE (e.venue_id = $1 OR LOWER(e.venue) = LOWER($2))
            AND e.status = 'completed'
          GROUP BY e.id
          ORDER BY MAX(e.event_date) DESC
          LIMIT 3
        ) recent_events
      ), older AS (
        SELECT AVG(signup_count) as older_avg
        FROM (
          SELECT COUNT(s.id) FILTER (WHERE s.validation_status = 'validated') as signup_count
          FROM events e
          LEFT JOIN signups s ON s.event_id = e.id
          WHERE (e.venue_id = $1 OR LOWER(e.venue) = LOWER($2))
            AND e.status = 'completed'
          GROUP BY e.id
          ORDER BY MAX(e.event_date) DESC
          LIMIT 3 OFFSET 3
        ) older_events
      )
      SELECT recent.recent_avg, older.older_avg FROM recent, older`,
      [venueId, venueName]
    );

    const recentAvg = parseFloat(trend?.recent_avg || '0');
    const olderAvg = parseFloat(trend?.older_avg || '0');

    if (!olderAvg) return 'stable';
    const change = (recentAvg - olderAvg) / olderAvg;

    if (change > 0.1) return 'up';
    if (change < -0.1) return 'down';
    return 'stable';
  }

  private determineConfidenceLevel(
    history: HistoricalPerformance | null,
    game?: GameInfo,
    manualInsight?: ManualInsight
  ): 'low' | 'medium' | 'high' {
    let score = 0;

    if (history?.totalEvents && history.totalEvents >= 8) score += 2;
    else if (history?.totalEvents && history.totalEvents >= 3) score += 1;

    if (game?.homeTeam || game?.awayTeam) score += 1;
    if (manualInsight?.confidenceAdjustment !== undefined) score += 1;

    if (score >= 3) return 'high';
    if (score >= 2) return 'medium';
    return 'low';
  }

  private calculateVarianceFromHistorical(eventScore: number, history: HistoricalPerformance | null): number {
    if (!history) return 0;
    return Math.round(eventScore - history.avgSignups);
  }

  private buildScoreExplanation(
    eventScore: number,
    factors: ScoringFactorResult[],
    variance: number,
    confidence: 'low' | 'medium' | 'high'
  ): string {
    const topFactors = factors
      .slice()
      .sort((a, b) => b.weightedScore - a.weightedScore)
      .slice(0, 2)
      .map((factor) => factor.name);

    const base = eventScore >= 70
      ? 'Strong traffic outlook.'
      : eventScore >= 40
      ? 'Moderate traffic outlook.'
      : 'Low traffic outlook.';

    const factorText = topFactors.length > 0 ? ` Top factors: ${topFactors.join(', ')}.` : '';
    const varianceText = Math.abs(variance) >= 20 ? ` Variance warning: ${variance > 0 ? '+' : ''}${variance} vs historical average.` : '';

    return `${base}${factorText} Confidence: ${confidence}.${varianceText}`.trim();
  }

  private async getGamesForRange(fromDate: Date, toDate: Date, region?: string) {
    const regionFilter = region?.trim() || null;

    const result = await db.query<{
      home_team: string;
      away_team: string;
      league: string;
      is_playoffs: boolean;
      game_type: string | null;
      game_date: Date;
      city: string | null;
      state: string | null;
      broadcast_network: string | null;
      is_national_broadcast: boolean;
      is_primetime: boolean;
      local_market_match: boolean;
    }>(
      `SELECT
        home_team->>'name' as home_team,
        away_team->>'name' as away_team,
        league,
        COALESCE((relevance_flags->>'isPlayoff')::boolean, false) as is_playoffs,
        game_type,
        game_date,
        venue->>'city' as city,
        venue->>'state' as state,
        broadcasts[1]->>'network' as broadcast_network,
        COALESCE((relevance_flags->>'isNationalBroadcast')::boolean, false) as is_national_broadcast,
        COALESCE((relevance_flags->>'isPrimetime')::boolean, false) as is_primetime,
        (
          COALESCE(venue->>'city', '') ILIKE COALESCE($3, '') OR
          COALESCE(venue->>'state', '') ILIKE COALESCE($3, '') OR
          COALESCE(home_team->>'name', '') ILIKE COALESCE($3, '') OR
          COALESCE(away_team->>'name', '') ILIKE COALESCE($3, '')
        ) as local_market_match
       FROM sports_games
       WHERE game_date >= $1
         AND game_date <= $2
         AND ($4::text IS NULL OR
           COALESCE(venue->>'city', '') ILIKE $3 OR
           COALESCE(venue->>'state', '') ILIKE $3 OR
           COALESCE(home_team->>'name', '') ILIKE $3 OR
           COALESCE(away_team->>'name', '') ILIKE $3)
       ORDER BY game_date ASC`,
      [fromDate.toISOString(), toDate.toISOString(), regionFilter ? `%${regionFilter}%` : '', regionFilter]
    );

    return result.rows;
  }

  private pickMostRelevantGame(games: Awaited<ReturnType<TrafficPredictionService['getGamesForRange']>>[number][], venue: {
    city: string | null;
    state: string | null;
  }): GameInfo | undefined {
    const sorted = games
      .map((game) => ({
        ...game,
        score:
          (game.is_playoffs ? 30 : 0) +
          (game.is_national_broadcast ? 20 : 0) +
          (game.is_primetime ? 15 : 0) +
          (this.matchesVenue(game.city, venue.city) || this.matchesVenue(game.state, venue.state) ? 20 : 0),
      }))
      .sort((a, b) => b.score - a.score);

    const best = sorted[0];
    if (!best) return undefined;

    return {
      homeTeam: best.home_team,
      awayTeam: best.away_team,
      league: best.league,
      isPlayoffs: best.is_playoffs,
      broadcastNetwork: best.broadcast_network || undefined,
      startTime: new Date(best.game_date),
    };
  }

  private matchesVenue(a: string | null | undefined, b: string | null | undefined): boolean {
    if (!a || !b) return false;
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  }

  private getContributingFactors(score: TrafficScoreResponse): string[] {
    const factors: Array<{ name: string; value: number }> = [
      { name: 'game relevance', value: score.breakdown.gameRelevance },
      { name: 'venue history', value: score.breakdown.historicalPerformance },
      { name: 'day/time optimization', value: score.breakdown.dayTimeFactor },
      { name: 'seasonal trend', value: score.breakdown.seasonalFactor },
      { name: 'manual insight', value: score.breakdown.manualInsight },
    ];

    return factors
      .filter((factor) => factor.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 3)
      .map((factor) => factor.name);
  }

  private getRecommendationAlerts(
    score: TrafficScoreResponse,
    games: Awaited<ReturnType<TrafficPredictionService['getGamesForRange']>>,
    venue: { city: string | null; state: string | null }
  ): AlertData[] {
    const alerts: AlertData[] = [];

    if (score.eventScore < 30) {
      alerts.push({
        type: 'low_traffic',
        severity: 'high',
        message: 'Dead period detected: projected score below 30.',
        dismissible: true,
      });
    }

    if (score.confidenceLevel === 'low') {
      alerts.push({
        type: 'low_confidence',
        severity: 'medium',
        message: 'Low confidence due to limited historical sample size.',
        dismissible: true,
      });
    }

    const localHighImpactGames = games.filter((game) => {
      const local = this.matchesVenue(game.city, venue.city) || this.matchesVenue(game.state, venue.state);
      return local && (game.is_playoffs || /championship|final/i.test(game.game_type || ''));
    });

    if (localHighImpactGames.length > 0) {
      alerts.push({
        type: 'conflict',
        severity: 'low',
        message: `${localHighImpactGames.length} high-impact local game(s) in the same window.`,
        dismissible: true,
      });
    }

    return alerts;
  }

  private round1(value: number): number {
    return Math.round(value * 10) / 10;
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }
}

export const trafficPredictionService = new TrafficPredictionService();
