/**
 * Leaderboard Service
 * WO-73: Ambassador Analytics and Leaderboard Systems
 * Provides comprehensive leaderboard and performance analytics for ambassadors
 */

import { db } from './database.js';
import { logger } from '../utils/logger.js';
import type {
  LeaderboardFilters,
  LeaderboardResponse,
  LeaderboardEntry,
  LeaderboardSummary,
  LeaderboardMetric,
  AmbassadorPerformanceFilters,
  AmbassadorPerformanceBreakdown,
  OperatorPerformanceBreakdown,
  PerformanceTimelineEntry,
  CohortComparison,
  PerformanceTrendStatus,
  CohortAnalysisFilters,
  CohortAnalysisResponse,
  CohortMetrics,
  TrendAnalysisFilters,
  TrendAnalysisResponse,
  TrendPeriod,
  LeaderboardOptInUpdate,
  TimelinePeriod,
} from '../types/leaderboard.js';
import type { TrendDirection } from '../types/analytics.js';
import type { AmbassadorSkillLevel } from '../types/models.js';

class LeaderboardService {
  // ============================================
  // LEADERBOARD (REQ-AR-005)
  // ============================================

  /**
   * Get ambassador leaderboard with configurable ranking criteria
   * AC-AR-005.1 through AC-AR-005.6
   */
  async getLeaderboard(filters: LeaderboardFilters): Promise<LeaderboardResponse> {
    const {
      fromDate,
      toDate,
      metric = 'signups',
      skillLevel,
      region,
      limit = 50,
      offset = 0,
      includePreviousPeriod = true,
    } = filters;

    logger.info({ filters }, 'Fetching leaderboard');

    // Build the leaderboard query based on metric
    const [entries, summary, previousRankings] = await Promise.all([
      this.getLeaderboardEntries(fromDate, toDate, metric, skillLevel, region, limit, offset),
      this.getLeaderboardSummary(fromDate, toDate, metric, skillLevel, region),
      includePreviousPeriod 
        ? this.getPreviousPeriodRankings(fromDate, toDate, metric, skillLevel, region)
        : Promise.resolve(new Map<string, number>()),
    ]);

    // Enrich entries with rank changes
    const enrichedEntries = entries.map(entry => {
      const previousRank = previousRankings.get(entry.ambassadorId);
      const rankChange = previousRank ? previousRank - entry.rank : undefined;
      
      return {
        ...entry,
        previousRank,
        rankChange,
        isSignificantChange: Math.abs(rankChange || 0) >= 5, // AC-AR-005.5
      };
    });

    const total = await this.getLeaderboardTotalCount(fromDate, toDate, skillLevel, region);

    return {
      entries: enrichedEntries,
      summary,
      filters: {
        fromDate,
        toDate,
        metric,
        skillLevel,
        region,
      },
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
      generatedAt: new Date(),
    };
  }

  /**
   * Get leaderboard entries based on selected metric
   */
  private async getLeaderboardEntries(
    fromDate: string,
    toDate: string,
    metric: LeaderboardMetric,
    skillLevel?: AmbassadorSkillLevel,
    region?: string,
    limit = 50,
    offset = 0
  ): Promise<LeaderboardEntry[]> {
    // AC-AR-005.6: Exclude ambassadors with leaderboard_opt_in = false
    const skillFilter = skillLevel ? `AND a.skill_level = $3` : '';
    const regionFilter = region ? `AND a.home_region = ${skillLevel ? '$4' : '$3'}` : '';
    
    const params: (string | number)[] = [fromDate, toDate];
    if (skillLevel) params.push(skillLevel);
    if (region) params.push(region);

    // Metric-specific ordering
    const metricColumn = this.getMetricColumn(metric);
    const metricLabel = this.getMetricLabel(metric);

    const results = await db.queryMany<{
      ambassador_id: string;
      first_name: string;
      last_name: string;
      skill_level: string;
      home_region: string;
      total_signups: string;
      validated_signups: string;
      events_worked: string;
      total_hours: string;
      performance_score: string;
      goal_achievement: string;
    }>(`
      WITH ambassador_metrics AS (
        SELECT 
          a.id as ambassador_id,
          a.first_name,
          a.last_name,
          a.skill_level,
          a.home_region,
          COUNT(s.id) as total_signups,
          COUNT(s.id) FILTER (WHERE s.validation_status = 'validated') as validated_signups,
          COUNT(DISTINCT s.event_id) as events_worked,
          COALESCE(SUM(
            CASE WHEN ea.check_out_time IS NOT NULL AND ea.check_in_time IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (ea.check_out_time - ea.check_in_time)) / 3600.0 
            ELSE 0 END
          ), 0) as total_hours,
          -- Performance score: weighted combination
          CASE 
            WHEN COUNT(s.id) > 0 THEN
              (COUNT(s.id) FILTER (WHERE s.validation_status = 'validated')::float / NULLIF(COUNT(s.id), 0) * 100 * 0.4) +
              (LEAST(COUNT(s.id) / NULLIF(COUNT(DISTINCT s.event_id), 0), 20) * 5 * 0.4) +
              (LEAST(COUNT(DISTINCT s.event_id), 10) * 2 * 0.2)
            ELSE 0
          END as performance_score,
          -- Goal achievement
          CASE 
            WHEN COALESCE(SUM(e.signup_goal), 0) > 0 
            THEN (COUNT(s.id)::float / SUM(e.signup_goal) * 100)
            ELSE NULL
          END as goal_achievement
        FROM ambassadors a
        LEFT JOIN signups s ON s.ambassador_id = a.id 
          AND s.created_at BETWEEN $1 AND ($2::date + INTERVAL '1 day')
        LEFT JOIN events e ON e.id = s.event_id
        LEFT JOIN event_assignments ea ON ea.ambassador_id = a.id AND ea.event_id = e.id
        WHERE a.status = 'active'
          AND COALESCE(a.leaderboard_opt_in, true) = true
          ${skillFilter}
          ${regionFilter}
        GROUP BY a.id, a.first_name, a.last_name, a.skill_level, a.home_region
        HAVING COUNT(s.id) > 0
      )
      SELECT 
        *,
        ROW_NUMBER() OVER (ORDER BY ${metricColumn} DESC NULLS LAST, total_signups DESC) as rank
      FROM ambassador_metrics
      ORDER BY ${metricColumn} DESC NULLS LAST, total_signups DESC
      LIMIT ${limit} OFFSET ${offset}
    `, params);

    return results.map((row, index) => {
      const totalSignups = parseInt(row.total_signups);
      const validatedSignups = parseInt(row.validated_signups);
      const eventsWorked = parseInt(row.events_worked);
      const totalHours = parseFloat(row.total_hours);
      const performanceScore = parseFloat(row.performance_score);
      const goalAchievement = row.goal_achievement ? parseFloat(row.goal_achievement) : undefined;

      return {
        rank: offset + index + 1,
        previousRank: undefined,
        rankChange: undefined,
        isSignificantChange: false,
        
        ambassadorId: row.ambassador_id,
        ambassadorName: `${row.first_name} ${row.last_name}`,
        skillLevel: row.skill_level as AmbassadorSkillLevel,
        region: row.home_region || undefined,
        
        metricValue: this.getMetricValue(metric, {
          totalSignups,
          performanceScore,
          goalAchievement,
          totalHours,
        }),
        metricLabel,
        
        totalSignups,
        eventsWorked,
        validatedSignups,
        validationRate: totalSignups > 0 ? (validatedSignups / totalSignups) * 100 : 0,
        
        performanceScore,
        goalAchievementPercent: goalAchievement,
        signupsPerHour: totalHours > 0 ? totalSignups / totalHours : undefined,
        avgSignupsPerEvent: eventsWorked > 0 ? totalSignups / eventsWorked : 0,
      };
    });
  }

  /**
   * Get previous period rankings for rank change calculation
   */
  private async getPreviousPeriodRankings(
    fromDate: string,
    toDate: string,
    metric: LeaderboardMetric,
    skillLevel?: AmbassadorSkillLevel,
    region?: string
  ): Promise<Map<string, number>> {
    // Calculate previous period (same duration before fromDate)
    const from = new Date(fromDate);
    const to = new Date(toDate);
    const durationMs = to.getTime() - from.getTime();
    
    const prevTo = new Date(from.getTime() - 1); // Day before fromDate
    const prevFrom = new Date(prevTo.getTime() - durationMs);
    
    const prevFromDate = prevFrom.toISOString().split('T')[0];
    const prevToDate = prevTo.toISOString().split('T')[0];

    const skillFilter = skillLevel ? `AND a.skill_level = $3` : '';
    const regionFilter = region ? `AND a.home_region = ${skillLevel ? '$4' : '$3'}` : '';
    
    const params: (string | number)[] = [prevFromDate, prevToDate];
    if (skillLevel) params.push(skillLevel);
    if (region) params.push(region);

    const metricColumn = this.getMetricColumn(metric);

    const results = await db.queryMany<{
      ambassador_id: string;
      rank: string;
    }>(`
      WITH ambassador_metrics AS (
        SELECT 
          a.id as ambassador_id,
          COUNT(s.id) as total_signups,
          COUNT(s.id) FILTER (WHERE s.validation_status = 'validated') as validated_signups,
          COUNT(DISTINCT s.event_id) as events_worked,
          COALESCE(SUM(
            CASE WHEN ea.check_out_time IS NOT NULL AND ea.check_in_time IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (ea.check_out_time - ea.check_in_time)) / 3600.0 
            ELSE 0 END
          ), 0) as total_hours,
          CASE 
            WHEN COUNT(s.id) > 0 THEN
              (COUNT(s.id) FILTER (WHERE s.validation_status = 'validated')::float / NULLIF(COUNT(s.id), 0) * 100 * 0.4) +
              (LEAST(COUNT(s.id) / NULLIF(COUNT(DISTINCT s.event_id), 0), 20) * 5 * 0.4) +
              (LEAST(COUNT(DISTINCT s.event_id), 10) * 2 * 0.2)
            ELSE 0
          END as performance_score,
          CASE 
            WHEN COALESCE(SUM(e.signup_goal), 0) > 0 
            THEN (COUNT(s.id)::float / SUM(e.signup_goal) * 100)
            ELSE NULL
          END as goal_achievement
        FROM ambassadors a
        LEFT JOIN signups s ON s.ambassador_id = a.id 
          AND s.created_at BETWEEN $1 AND ($2::date + INTERVAL '1 day')
        LEFT JOIN events e ON e.id = s.event_id
        LEFT JOIN event_assignments ea ON ea.ambassador_id = a.id AND ea.event_id = e.id
        WHERE a.status = 'active'
          AND COALESCE(a.leaderboard_opt_in, true) = true
          ${skillFilter}
          ${regionFilter}
        GROUP BY a.id
        HAVING COUNT(s.id) > 0
      )
      SELECT 
        ambassador_id,
        ROW_NUMBER() OVER (ORDER BY ${metricColumn} DESC NULLS LAST, total_signups DESC) as rank
      FROM ambassador_metrics
    `, params);

    const rankMap = new Map<string, number>();
    for (const row of results) {
      rankMap.set(row.ambassador_id, parseInt(row.rank));
    }
    return rankMap;
  }

  /**
   * Get leaderboard summary statistics
   */
  private async getLeaderboardSummary(
    fromDate: string,
    toDate: string,
    metric: LeaderboardMetric,
    skillLevel?: AmbassadorSkillLevel,
    region?: string
  ): Promise<LeaderboardSummary> {
    const skillFilter = skillLevel ? `AND a.skill_level = $3` : '';
    const regionFilter = region ? `AND a.home_region = ${skillLevel ? '$4' : '$3'}` : '';
    
    const params: (string | number)[] = [fromDate, toDate];
    if (skillLevel) params.push(skillLevel);
    if (region) params.push(region);

    const result = await db.queryOne<{
      total_participants: string;
      total_excluded: string;
      avg_signups: string;
      median_signups: string;
      top_name: string;
      top_signups: string;
    }>(`
      WITH metrics AS (
        SELECT 
          a.id,
          a.first_name,
          a.last_name,
          COALESCE(a.leaderboard_opt_in, true) as opted_in,
          COUNT(s.id) as signups
        FROM ambassadors a
        LEFT JOIN signups s ON s.ambassador_id = a.id 
          AND s.created_at BETWEEN $1 AND ($2::date + INTERVAL '1 day')
        WHERE a.status = 'active'
          ${skillFilter}
          ${regionFilter}
        GROUP BY a.id, a.first_name, a.last_name, a.leaderboard_opt_in
      )
      SELECT 
        COUNT(*) FILTER (WHERE opted_in = true AND signups > 0) as total_participants,
        COUNT(*) FILTER (WHERE opted_in = false) as total_excluded,
        AVG(signups) FILTER (WHERE opted_in = true AND signups > 0) as avg_signups,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY signups) FILTER (WHERE opted_in = true AND signups > 0) as median_signups,
        (SELECT first_name || ' ' || last_name FROM metrics WHERE opted_in = true ORDER BY signups DESC LIMIT 1) as top_name,
        (SELECT signups FROM metrics WHERE opted_in = true ORDER BY signups DESC LIMIT 1) as top_signups
      FROM metrics
    `, params);

    return {
      totalParticipants: parseInt(result?.total_participants || '0'),
      totalExcluded: parseInt(result?.total_excluded || '0'),
      avgMetricValue: parseFloat(result?.avg_signups || '0'),
      medianMetricValue: parseFloat(result?.median_signups || '0'),
      topPerformerName: result?.top_name || 'N/A',
      topPerformerValue: parseFloat(result?.top_signups || '0'),
      significantImprovements: 0, // Calculated from rank changes
    };
  }

  /**
   * Get total count for pagination
   */
  private async getLeaderboardTotalCount(
    fromDate: string,
    toDate: string,
    skillLevel?: AmbassadorSkillLevel,
    region?: string
  ): Promise<number> {
    const skillFilter = skillLevel ? `AND a.skill_level = $3` : '';
    const regionFilter = region ? `AND a.home_region = ${skillLevel ? '$4' : '$3'}` : '';
    
    const params: (string | number)[] = [fromDate, toDate];
    if (skillLevel) params.push(skillLevel);
    if (region) params.push(region);

    const result = await db.queryOne<{ count: string }>(`
      SELECT COUNT(DISTINCT a.id) as count
      FROM ambassadors a
      JOIN signups s ON s.ambassador_id = a.id 
        AND s.created_at BETWEEN $1 AND ($2::date + INTERVAL '1 day')
      WHERE a.status = 'active'
        AND COALESCE(a.leaderboard_opt_in, true) = true
        ${skillFilter}
        ${regionFilter}
    `, params);

    return parseInt(result?.count || '0');
  }

  // ============================================
  // AMBASSADOR PERFORMANCE BREAKDOWN (REQ-AR-006)
  // ============================================

  /**
   * Get detailed performance breakdown for a single ambassador
   * AC-AR-006.1 through AC-AR-006.6
   */
  async getAmbassadorPerformance(
    filters: AmbassadorPerformanceFilters
  ): Promise<AmbassadorPerformanceBreakdown | null> {
    const { ambassadorId, fromDate, toDate, timelinePeriod = 'daily' } = filters;

    logger.info({ filters }, 'Fetching ambassador performance breakdown');

    // Get ambassador info
    const ambassador = await db.queryOne<{
      id: string;
      first_name: string;
      last_name: string;
      email: string;
      skill_level: string;
      home_region: string;
      compensation_type: string;
      leaderboard_opt_in: boolean;
    }>(`
      SELECT id, first_name, last_name, email, skill_level, home_region, 
             compensation_type, COALESCE(leaderboard_opt_in, true) as leaderboard_opt_in
      FROM ambassadors WHERE id = $1
    `, [ambassadorId]);

    if (!ambassador) {
      return null;
    }

    const [
      summary,
      goalPerformance,
      hourlyPerformance,
      operatorBreakdown,
      timeline,
      cohortComparison,
      trendData,
    ] = await Promise.all([
      this.getAmbassadorSummary(ambassadorId, fromDate, toDate),
      this.getAmbassadorGoalPerformance(ambassadorId, fromDate, toDate),
      this.getAmbassadorHourlyPerformance(ambassadorId, fromDate, toDate),
      this.getAmbassadorOperatorBreakdown(ambassadorId, fromDate, toDate),
      this.getAmbassadorTimeline(ambassadorId, fromDate, toDate, timelinePeriod),
      this.getAmbassadorCohortComparison(ambassadorId, fromDate, toDate),
      this.getAmbassadorTrend(ambassadorId, fromDate, toDate),
    ]);

    // Calculate performance score
    const performanceScore = this.calculatePerformanceScore(
      summary.totalSignups,
      summary.validatedSignups,
      summary.eventsWorked,
      goalPerformance.overallAchievementPercent
    );

    return {
      ambassador: {
        id: ambassador.id,
        name: `${ambassador.first_name} ${ambassador.last_name}`,
        email: ambassador.email,
        skillLevel: ambassador.skill_level as AmbassadorSkillLevel,
        region: ambassador.home_region || undefined,
        compensationType: ambassador.compensation_type as 'per_signup' | 'hourly' | 'hybrid',
        leaderboardOptIn: ambassador.leaderboard_opt_in,
      },
      summary,
      goalPerformance,
      hourlyPerformance,
      operatorBreakdown,
      timeline,
      cohortComparison,
      trend: trendData,
      performanceScore,
      filters: { fromDate, toDate },
      generatedAt: new Date(),
    };
  }

  /**
   * AC-AR-006.1: Get summary metrics
   */
  private async getAmbassadorSummary(
    ambassadorId: string,
    fromDate: string,
    toDate: string
  ): Promise<{
    totalSignups: number;
    validatedSignups: number;
    rejectedSignups: number;
    eventsWorked: number;
    avgSignupsPerEvent: number;
    totalHoursWorked?: number;
  }> {
    const result = await db.queryOne<{
      total_signups: string;
      validated_signups: string;
      rejected_signups: string;
      events_worked: string;
      total_hours: string;
    }>(`
      SELECT 
        COUNT(s.id) as total_signups,
        COUNT(s.id) FILTER (WHERE s.validation_status = 'validated') as validated_signups,
        COUNT(s.id) FILTER (WHERE s.validation_status = 'rejected') as rejected_signups,
        COUNT(DISTINCT s.event_id) as events_worked,
        COALESCE(SUM(
          CASE WHEN ea.check_out_time IS NOT NULL AND ea.check_in_time IS NOT NULL 
          THEN EXTRACT(EPOCH FROM (ea.check_out_time - ea.check_in_time)) / 3600.0 
          ELSE 0 END
        ), 0) as total_hours
      FROM signups s
      LEFT JOIN event_assignments ea ON ea.ambassador_id = s.ambassador_id AND ea.event_id = s.event_id
      WHERE s.ambassador_id = $1
        AND s.created_at BETWEEN $2 AND ($3::date + INTERVAL '1 day')
    `, [ambassadorId, fromDate, toDate]);

    const totalSignups = parseInt(result?.total_signups || '0');
    const eventsWorked = parseInt(result?.events_worked || '0');
    const totalHours = parseFloat(result?.total_hours || '0');

    return {
      totalSignups,
      validatedSignups: parseInt(result?.validated_signups || '0'),
      rejectedSignups: parseInt(result?.rejected_signups || '0'),
      eventsWorked,
      avgSignupsPerEvent: eventsWorked > 0 ? totalSignups / eventsWorked : 0,
      totalHoursWorked: totalHours > 0 ? totalHours : undefined,
    };
  }

  /**
   * AC-AR-006.2: Get goal achievement metrics
   */
  private async getAmbassadorGoalPerformance(
    ambassadorId: string,
    fromDate: string,
    toDate: string
  ): Promise<{
    eventsWithGoals: number;
    eventsMeetingGoal: number;
    eventsExceedingGoal: number;
    eventsUnderperforming: number;
    overallAchievementPercent: number;
  }> {
    const result = await db.queryOne<{
      events_with_goals: string;
      events_meeting_goal: string;
      events_exceeding_goal: string;
      events_underperforming: string;
      total_goal: string;
      total_signups: string;
    }>(`
      WITH event_performance AS (
        SELECT 
          e.id,
          e.signup_goal,
          COUNT(s.id) as signups,
          CASE 
            WHEN e.signup_goal > 0 THEN COUNT(s.id)::float / e.signup_goal * 100
            ELSE NULL
          END as achievement
        FROM events e
        JOIN signups s ON s.event_id = e.id AND s.ambassador_id = $1
        WHERE e.event_date BETWEEN $2 AND $3
        GROUP BY e.id, e.signup_goal
      )
      SELECT 
        COUNT(*) FILTER (WHERE signup_goal > 0) as events_with_goals,
        COUNT(*) FILTER (WHERE achievement >= 80 AND achievement < 120) as events_meeting_goal,
        COUNT(*) FILTER (WHERE achievement >= 120) as events_exceeding_goal,
        COUNT(*) FILTER (WHERE achievement < 80) as events_underperforming,
        COALESCE(SUM(signup_goal) FILTER (WHERE signup_goal > 0), 0) as total_goal,
        SUM(signups) as total_signups
      FROM event_performance
    `, [ambassadorId, fromDate, toDate]);

    const totalGoal = parseInt(result?.total_goal || '0');
    const totalSignups = parseInt(result?.total_signups || '0');

    return {
      eventsWithGoals: parseInt(result?.events_with_goals || '0'),
      eventsMeetingGoal: parseInt(result?.events_meeting_goal || '0'),
      eventsExceedingGoal: parseInt(result?.events_exceeding_goal || '0'),
      eventsUnderperforming: parseInt(result?.events_underperforming || '0'),
      overallAchievementPercent: totalGoal > 0 ? (totalSignups / totalGoal) * 100 : 0,
    };
  }

  /**
   * AC-AR-006.3: Get sign-ups per hour for hourly events
   */
  private async getAmbassadorHourlyPerformance(
    ambassadorId: string,
    fromDate: string,
    toDate: string
  ): Promise<{
    totalHourlyEvents: number;
    totalSignupsInHourlyEvents: number;
    totalHoursInHourlyEvents: number;
    avgSignupsPerHour: number;
  }> {
    const result = await db.queryOne<{
      hourly_events: string;
      hourly_signups: string;
      total_hours: string;
    }>(`
      SELECT 
        COUNT(DISTINCT e.id) as hourly_events,
        COUNT(s.id) as hourly_signups,
        COALESCE(SUM(
          EXTRACT(EPOCH FROM (ea.check_out_time - ea.check_in_time)) / 3600.0
        ), 0) as total_hours
      FROM events e
      JOIN signups s ON s.event_id = e.id AND s.ambassador_id = $1
      JOIN event_assignments ea ON ea.event_id = e.id AND ea.ambassador_id = $1
      WHERE e.event_date BETWEEN $2 AND $3
        AND ea.check_in_time IS NOT NULL
        AND ea.check_out_time IS NOT NULL
    `, [ambassadorId, fromDate, toDate]);

    const totalHours = parseFloat(result?.total_hours || '0');
    const hourlySignups = parseInt(result?.hourly_signups || '0');

    return {
      totalHourlyEvents: parseInt(result?.hourly_events || '0'),
      totalSignupsInHourlyEvents: hourlySignups,
      totalHoursInHourlyEvents: totalHours,
      avgSignupsPerHour: totalHours > 0 ? hourlySignups / totalHours : 0,
    };
  }

  /**
   * AC-AR-006.4: Get performance breakdown by operator
   */
  private async getAmbassadorOperatorBreakdown(
    ambassadorId: string,
    fromDate: string,
    toDate: string
  ): Promise<OperatorPerformanceBreakdown[]> {
    const results = await db.queryMany<{
      operator_id: string;
      operator_name: string;
      signups: string;
      validated_signups: string;
      revenue: string;
      events_count: string;
    }>(`
      SELECT 
        s.operator_id,
        COALESCE(s.operator_name, o.display_name, 'Unknown') as operator_name,
        COUNT(s.id) as signups,
        COUNT(s.id) FILTER (WHERE s.validation_status = 'validated') as validated_signups,
        COALESCE(SUM(s.cpa_applied), 0) as revenue,
        COUNT(DISTINCT s.event_id) as events_count
      FROM signups s
      LEFT JOIN operators o ON o.id = s.operator_id
      WHERE s.ambassador_id = $1
        AND s.created_at BETWEEN $2 AND ($3::date + INTERVAL '1 day')
      GROUP BY s.operator_id, s.operator_name, o.display_name
      ORDER BY signups DESC
    `, [ambassadorId, fromDate, toDate]);

    const maxSignups = results.length > 0 ? parseInt(results[0].signups) : 0;

    return results.map(row => {
      const signups = parseInt(row.signups);
      const validatedSignups = parseInt(row.validated_signups);

      return {
        operatorId: parseInt(row.operator_id),
        operatorName: row.operator_name,
        signups,
        validatedSignups,
        validationRate: signups > 0 ? (validatedSignups / signups) * 100 : 0,
        revenue: parseFloat(row.revenue),
        eventsCount: parseInt(row.events_count),
        isTopOperator: signups === maxSignups,
      };
    });
  }

  /**
   * AC-AR-006.5: Get timeline of signups (daily or weekly)
   */
  private async getAmbassadorTimeline(
    ambassadorId: string,
    fromDate: string,
    toDate: string,
    period: TimelinePeriod
  ): Promise<PerformanceTimelineEntry[]> {
    const dateFormat = period === 'weekly' 
      ? `DATE_TRUNC('week', s.created_at)` 
      : `DATE(s.created_at)`;

    const results = await db.queryMany<{
      period: string;
      signups: string;
      validated_signups: string;
      events_worked: string;
      total_goal: string;
    }>(`
      SELECT 
        ${dateFormat} as period,
        COUNT(s.id) as signups,
        COUNT(s.id) FILTER (WHERE s.validation_status = 'validated') as validated_signups,
        COUNT(DISTINCT s.event_id) as events_worked,
        COALESCE(SUM(DISTINCT e.signup_goal), 0) as total_goal
      FROM signups s
      LEFT JOIN events e ON e.id = s.event_id
      WHERE s.ambassador_id = $1
        AND s.created_at BETWEEN $2 AND ($3::date + INTERVAL '1 day')
      GROUP BY ${dateFormat}
      ORDER BY period
    `, [ambassadorId, fromDate, toDate]);

    let previousSignups = 0;
    return results.map(row => {
      const signups = parseInt(row.signups);
      const totalGoal = parseInt(row.total_goal);
      
      const trend: TrendDirection = signups > previousSignups 
        ? 'up' 
        : signups < previousSignups 
          ? 'down' 
          : 'stable';
      
      previousSignups = signups;

      return {
        period: row.period,
        signups,
        validatedSignups: parseInt(row.validated_signups),
        eventsWorked: parseInt(row.events_worked),
        goalAchievement: totalGoal > 0 ? (signups / totalGoal) * 100 : undefined,
        trend,
      };
    });
  }

  /**
   * AC-AR-006.6: Get cohort comparison
   */
  private async getAmbassadorCohortComparison(
    ambassadorId: string,
    fromDate: string,
    toDate: string
  ): Promise<CohortComparison> {
    // Get ambassador's skill level and region
    const ambassador = await db.queryOne<{
      skill_level: string;
      home_region: string;
    }>('SELECT skill_level, home_region FROM ambassadors WHERE id = $1', [ambassadorId]);

    // Get ambassador's signups
    const ambassadorStats = await db.queryOne<{ signups: string }>(`
      SELECT COUNT(*) as signups FROM signups 
      WHERE ambassador_id = $1 AND created_at BETWEEN $2 AND ($3::date + INTERVAL '1 day')
    `, [ambassadorId, fromDate, toDate]);
    const ambassadorSignups = parseInt(ambassadorStats?.signups || '0');

    // Skill level cohort
    const skillCohort = await db.queryOne<{
      cohort_size: string;
      avg_signups: string;
      median_signups: string;
      percentile: string;
    }>(`
      WITH cohort_members AS (
        SELECT 
          a.id,
          COUNT(s.id) as signups
        FROM ambassadors a
        LEFT JOIN signups s ON s.ambassador_id = a.id 
          AND s.created_at BETWEEN $2 AND ($3::date + INTERVAL '1 day')
        WHERE a.skill_level = $1 AND a.status = 'active'
        GROUP BY a.id
      )
      SELECT 
        COUNT(*) as cohort_size,
        AVG(signups) as avg_signups,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY signups) as median_signups,
        (SELECT PERCENT_RANK() OVER (ORDER BY signups) * 100 FROM cohort_members WHERE id = $4) as percentile
      FROM cohort_members
    `, [ambassador?.skill_level, fromDate, toDate, ambassadorId]);

    const skillAvg = parseFloat(skillCohort?.avg_signups || '0');
    const skillComparison = ambassadorSignups > skillAvg * 1.1 
      ? 'above' as const
      : ambassadorSignups < skillAvg * 0.9 
        ? 'below' as const
        : 'average' as const;

    let regionCohort = undefined;
    if (ambassador?.home_region) {
      const regionStats = await db.queryOne<{
        cohort_size: string;
        avg_signups: string;
        median_signups: string;
        percentile: string;
      }>(`
        WITH cohort_members AS (
          SELECT 
            a.id,
            COUNT(s.id) as signups
          FROM ambassadors a
          LEFT JOIN signups s ON s.ambassador_id = a.id 
            AND s.created_at BETWEEN $2 AND ($3::date + INTERVAL '1 day')
          WHERE a.home_region = $1 AND a.status = 'active'
          GROUP BY a.id
        )
        SELECT 
          COUNT(*) as cohort_size,
          AVG(signups) as avg_signups,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY signups) as median_signups,
          (SELECT PERCENT_RANK() OVER (ORDER BY signups) * 100 FROM cohort_members WHERE id = $4) as percentile
        FROM cohort_members
      `, [ambassador.home_region, fromDate, toDate, ambassadorId]);

      const regionAvg = parseFloat(regionStats?.avg_signups || '0');
      regionCohort = {
        cohortName: `${ambassador.home_region} Region`,
        cohortSize: parseInt(regionStats?.cohort_size || '0'),
        ambassadorValue: ambassadorSignups,
        cohortAverage: regionAvg,
        cohortMedian: parseFloat(regionStats?.median_signups || '0'),
        percentile: parseFloat(regionStats?.percentile || '0'),
        comparison: ambassadorSignups > regionAvg * 1.1 
          ? 'above' as const
          : ambassadorSignups < regionAvg * 0.9 
            ? 'below' as const
            : 'average' as const,
      };
    }

    return {
      skillLevelCohort: {
        cohortName: `${ambassador?.skill_level || 'Unknown'} Level`,
        cohortSize: parseInt(skillCohort?.cohort_size || '0'),
        ambassadorValue: ambassadorSignups,
        cohortAverage: skillAvg,
        cohortMedian: parseFloat(skillCohort?.median_signups || '0'),
        percentile: parseFloat(skillCohort?.percentile || '0'),
        comparison: skillComparison,
      },
      regionCohort,
    };
  }

  /**
   * Get performance trend status
   */
  private async getAmbassadorTrend(
    ambassadorId: string,
    fromDate: string,
    toDate: string
  ): Promise<{
    status: PerformanceTrendStatus;
    percentChange: number;
    comparisonPeriod: string;
  }> {
    // Calculate previous period
    const from = new Date(fromDate);
    const to = new Date(toDate);
    const durationMs = to.getTime() - from.getTime();
    const durationDays = Math.ceil(durationMs / (1000 * 60 * 60 * 24));
    
    const prevTo = new Date(from.getTime() - 1);
    const prevFrom = new Date(prevTo.getTime() - durationMs);
    
    const prevFromDate = prevFrom.toISOString().split('T')[0];
    const prevToDate = prevTo.toISOString().split('T')[0];

    const result = await db.queryOne<{
      current_signups: string;
      previous_signups: string;
    }>(`
      SELECT 
        (SELECT COUNT(*) FROM signups WHERE ambassador_id = $1 
          AND created_at BETWEEN $2 AND ($3::date + INTERVAL '1 day')) as current_signups,
        (SELECT COUNT(*) FROM signups WHERE ambassador_id = $1 
          AND created_at BETWEEN $4 AND ($5::date + INTERVAL '1 day')) as previous_signups
    `, [ambassadorId, fromDate, toDate, prevFromDate, prevToDate]);

    const current = parseInt(result?.current_signups || '0');
    const previous = parseInt(result?.previous_signups || '0');
    const percentChange = previous > 0 ? ((current - previous) / previous) * 100 : 0;

    let status: PerformanceTrendStatus = 'stable';
    if (percentChange > 10) status = 'improving';
    else if (percentChange < -10) status = 'declining';

    return {
      status,
      percentChange,
      comparisonPeriod: `vs previous ${durationDays} days`,
    };
  }

  // ============================================
  // COHORT ANALYSIS
  // ============================================

  /**
   * Get cohort analysis by skill level or region
   */
  async getCohortAnalysis(filters: CohortAnalysisFilters): Promise<CohortAnalysisResponse> {
    const { fromDate, toDate, groupBy, metric = 'signups' } = filters;

    logger.info({ filters }, 'Fetching cohort analysis');

    const groupColumn = groupBy === 'skill_level' ? 'a.skill_level' : 'a.home_region';

    const results = await db.queryMany<{
      cohort_name: string;
      cohort_size: string;
      total_signups: string;
      avg_signups: string;
      median_signups: string;
      min_signups: string;
      max_signups: string;
      avg_performance_score: string;
      avg_goal_achievement: string;
      total_hours: string;
    }>(`
      WITH ambassador_metrics AS (
        SELECT 
          a.id,
          ${groupColumn} as cohort_name,
          COUNT(s.id) as signups,
          CASE 
            WHEN COUNT(s.id) > 0 THEN
              (COUNT(s.id) FILTER (WHERE s.validation_status = 'validated')::float / NULLIF(COUNT(s.id), 0) * 100 * 0.4) +
              (LEAST(COUNT(s.id) / NULLIF(COUNT(DISTINCT s.event_id), 0), 20) * 5 * 0.4) +
              (LEAST(COUNT(DISTINCT s.event_id), 10) * 2 * 0.2)
            ELSE 0
          END as performance_score,
          CASE 
            WHEN COALESCE(SUM(e.signup_goal), 0) > 0 
            THEN (COUNT(s.id)::float / SUM(e.signup_goal) * 100)
            ELSE NULL
          END as goal_achievement,
          COALESCE(SUM(
            CASE WHEN ea.check_out_time IS NOT NULL AND ea.check_in_time IS NOT NULL 
            THEN EXTRACT(EPOCH FROM (ea.check_out_time - ea.check_in_time)) / 3600.0 
            ELSE 0 END
          ), 0) as total_hours
        FROM ambassadors a
        LEFT JOIN signups s ON s.ambassador_id = a.id 
          AND s.created_at BETWEEN $1 AND ($2::date + INTERVAL '1 day')
        LEFT JOIN events e ON e.id = s.event_id
        LEFT JOIN event_assignments ea ON ea.ambassador_id = a.id AND ea.event_id = e.id
        WHERE a.status = 'active'
        GROUP BY a.id, ${groupColumn}
      )
      SELECT 
        COALESCE(cohort_name, 'Unknown') as cohort_name,
        COUNT(*) as cohort_size,
        SUM(signups) as total_signups,
        AVG(signups) as avg_signups,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY signups) as median_signups,
        MIN(signups) as min_signups,
        MAX(signups) as max_signups,
        AVG(performance_score) as avg_performance_score,
        AVG(goal_achievement) as avg_goal_achievement,
        SUM(total_hours) as total_hours
      FROM ambassador_metrics
      GROUP BY cohort_name
      ORDER BY total_signups DESC
    `, [fromDate, toDate]);

    const cohorts: CohortMetrics[] = await Promise.all(
      results.map(async row => {
        // Get top performers for each cohort
        const topPerformers = await db.queryMany<{
          ambassador_id: string;
          first_name: string;
          last_name: string;
          signups: string;
        }>(`
          SELECT a.id as ambassador_id, a.first_name, a.last_name, COUNT(s.id) as signups
          FROM ambassadors a
          JOIN signups s ON s.ambassador_id = a.id 
            AND s.created_at BETWEEN $1 AND ($2::date + INTERVAL '1 day')
          WHERE ${groupColumn} = $3 AND a.status = 'active'
          GROUP BY a.id, a.first_name, a.last_name
          ORDER BY signups DESC LIMIT 3
        `, [fromDate, toDate, row.cohort_name]);

        const totalHours = parseFloat(row.total_hours);
        const totalSignups = parseInt(row.total_signups);

        return {
          cohortName: row.cohort_name,
          cohortSize: parseInt(row.cohort_size),
          totalSignups,
          avgSignups: parseFloat(row.avg_signups),
          medianSignups: parseFloat(row.median_signups),
          minSignups: parseInt(row.min_signups),
          maxSignups: parseInt(row.max_signups),
          avgPerformanceScore: parseFloat(row.avg_performance_score || '0'),
          avgGoalAchievement: parseFloat(row.avg_goal_achievement || '0'),
          avgSignupsPerHour: totalHours > 0 ? totalSignups / totalHours : 0,
          topPerformers: topPerformers.map(p => ({
            ambassadorId: p.ambassador_id,
            ambassadorName: `${p.first_name} ${p.last_name}`,
            value: parseInt(p.signups),
          })),
        };
      })
    );

    const totalAmbassadors = cohorts.reduce((sum, c) => sum + c.cohortSize, 0);
    const avgMetricValue = totalAmbassadors > 0 
      ? cohorts.reduce((sum, c) => sum + c.totalSignups, 0) / totalAmbassadors 
      : 0;

    return {
      cohorts,
      summary: {
        totalCohorts: cohorts.length,
        totalAmbassadors,
        avgMetricValue,
        topCohortName: cohorts[0]?.cohortName || 'N/A',
        topCohortValue: cohorts[0]?.totalSignups || 0,
      },
      filters,
      generatedAt: new Date(),
    };
  }

  // ============================================
  // TREND ANALYSIS
  // ============================================

  /**
   * Get trend analysis over multiple periods
   */
  async getTrendAnalysis(filters: TrendAnalysisFilters): Promise<TrendAnalysisResponse> {
    const { ambassadorId, skillLevel, region, periods = 6, periodType = 'week' } = filters;

    logger.info({ filters }, 'Fetching trend analysis');

    const intervalSql = periodType === 'week' ? '7 days' : '1 month';
    const truncFunc = periodType === 'week' ? 'week' : 'month';

    // Build filters
    let whereClause = 'WHERE a.status = \'active\'';
    const params: string[] = [];
    let paramIndex = 1;

    if (ambassadorId) {
      whereClause += ` AND a.id = $${paramIndex++}`;
      params.push(ambassadorId);
    }
    if (skillLevel) {
      whereClause += ` AND a.skill_level = $${paramIndex++}`;
      params.push(skillLevel);
    }
    if (region) {
      whereClause += ` AND a.home_region = $${paramIndex++}`;
      params.push(region);
    }

    const results = await db.queryMany<{
      period_start: string;
      period_end: string;
      signups: string;
      events_worked: string;
      ambassadors_active: string;
      total_goal: string;
    }>(`
      WITH periods AS (
        SELECT 
          DATE_TRUNC('${truncFunc}', NOW() - (n * INTERVAL '${intervalSql}')) as period_start,
          DATE_TRUNC('${truncFunc}', NOW() - (n * INTERVAL '${intervalSql}')) + INTERVAL '${intervalSql}' - INTERVAL '1 day' as period_end
        FROM generate_series(0, ${periods - 1}) n
      )
      SELECT 
        p.period_start::date::text,
        p.period_end::date::text,
        COUNT(s.id) as signups,
        COUNT(DISTINCT s.event_id) as events_worked,
        COUNT(DISTINCT s.ambassador_id) as ambassadors_active,
        COALESCE(SUM(DISTINCT e.signup_goal), 0) as total_goal
      FROM periods p
      LEFT JOIN ambassadors a ON true
      LEFT JOIN signups s ON s.ambassador_id = a.id 
        AND s.created_at BETWEEN p.period_start AND p.period_end
      LEFT JOIN events e ON e.id = s.event_id
      ${whereClause}
      GROUP BY p.period_start, p.period_end
      ORDER BY p.period_start ASC
    `, params);

    const trends: TrendPeriod[] = [];
    let previousSignups = 0;

    for (const row of results) {
      const signups = parseInt(row.signups);
      const ambassadorsActive = parseInt(row.ambassadors_active);
      const totalGoal = parseInt(row.total_goal);

      const changeFromPrevious = previousSignups > 0 ? {
        signupsChange: signups - previousSignups,
        signupsChangePercent: ((signups - previousSignups) / previousSignups) * 100,
        trend: (signups > previousSignups ? 'up' : signups < previousSignups ? 'down' : 'stable') as TrendDirection,
      } : undefined;

      trends.push({
        periodStart: row.period_start,
        periodEnd: row.period_end,
        periodLabel: `${periodType === 'week' ? 'Week of ' : ''}${row.period_start}`,
        signups,
        eventsWorked: parseInt(row.events_worked),
        ambassadorsActive,
        avgSignupsPerAmbassador: ambassadorsActive > 0 ? signups / ambassadorsActive : 0,
        goalAchievementPercent: totalGoal > 0 ? (signups / totalGoal) * 100 : 0,
        changeFromPrevious,
      });

      previousSignups = signups;
    }

    // Calculate overall trend
    const firstSignups = trends[0]?.signups || 0;
    const lastSignups = trends[trends.length - 1]?.signups || 0;
    const percentChangeFirstToLast = firstSignups > 0 
      ? ((lastSignups - firstSignups) / firstSignups) * 100 
      : 0;

    let overallTrend: PerformanceTrendStatus = 'stable';
    if (percentChangeFirstToLast > 10) overallTrend = 'improving';
    else if (percentChangeFirstToLast < -10) overallTrend = 'declining';

    return {
      trends,
      overallTrend,
      percentChangeFirstToLast,
      projectedNextPeriod: lastSignups > 0 && percentChangeFirstToLast !== 0
        ? Math.round(lastSignups * (1 + percentChangeFirstToLast / 100))
        : undefined,
      filters,
      generatedAt: new Date(),
    };
  }

  // ============================================
  // PRIVACY CONTROLS
  // ============================================

  /**
   * Update ambassador leaderboard opt-in preference
   */
  async updateLeaderboardOptIn(input: LeaderboardOptInUpdate): Promise<boolean> {
    const { ambassadorId, optIn } = input;

    logger.info({ ambassadorId, optIn }, 'Updating leaderboard opt-in');

    const result = await db.query(
      'UPDATE ambassadors SET leaderboard_opt_in = $1, updated_at = NOW() WHERE id = $2',
      [optIn, ambassadorId]
    );

    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Get ambassador privacy settings
   */
  async getPrivacySettings(ambassadorId: string): Promise<{
    leaderboardOptIn: boolean;
  } | null> {
    const result = await db.queryOne<{ leaderboard_opt_in: boolean }>(`
      SELECT COALESCE(leaderboard_opt_in, true) as leaderboard_opt_in
      FROM ambassadors WHERE id = $1
    `, [ambassadorId]);

    if (!result) return null;

    return {
      leaderboardOptIn: result.leaderboard_opt_in,
    };
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private getMetricColumn(metric: LeaderboardMetric): string {
    const columns: Record<LeaderboardMetric, string> = {
      signups: 'total_signups',
      performance_score: 'performance_score',
      goal_achievement: 'goal_achievement',
      signups_per_hour: 'CASE WHEN total_hours > 0 THEN total_signups::float / total_hours ELSE 0 END',
    };
    return columns[metric];
  }

  private getMetricLabel(metric: LeaderboardMetric): string {
    const labels: Record<LeaderboardMetric, string> = {
      signups: 'Total Sign-ups',
      performance_score: 'Performance Score',
      goal_achievement: 'Goal Achievement %',
      signups_per_hour: 'Sign-ups/Hour',
    };
    return labels[metric];
  }

  private getMetricValue(
    metric: LeaderboardMetric,
    data: {
      totalSignups: number;
      performanceScore: number;
      goalAchievement?: number;
      totalHours: number;
    }
  ): number {
    switch (metric) {
      case 'signups':
        return data.totalSignups;
      case 'performance_score':
        return data.performanceScore;
      case 'goal_achievement':
        return data.goalAchievement || 0;
      case 'signups_per_hour':
        return data.totalHours > 0 ? data.totalSignups / data.totalHours : 0;
    }
  }

  private calculatePerformanceScore(
    totalSignups: number,
    validatedSignups: number,
    eventsWorked: number,
    goalAchievement: number
  ): number {
    // Weighted score calculation:
    // 40% - Validation rate
    // 30% - Signups per event (capped)
    // 20% - Goal achievement
    // 10% - Volume bonus
    
    const validationRate = totalSignups > 0 ? (validatedSignups / totalSignups) * 100 : 0;
    const signupsPerEvent = eventsWorked > 0 ? Math.min(totalSignups / eventsWorked, 20) : 0;
    const volumeBonus = Math.min(totalSignups / 10, 10);

    return (
      (validationRate * 0.4) +
      (signupsPerEvent * 5 * 0.3) +
      (Math.min(goalAchievement, 150) / 1.5 * 0.2) +
      (volumeBonus * 0.1)
    );
  }
}

export const leaderboardService = new LeaderboardService();
