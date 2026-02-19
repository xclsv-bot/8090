/**
 * Dashboard Service
 * WO-72: Real-time Analytics Dashboards and Performance Tracking APIs
 * Provides comprehensive analytics for event performance, goal tracking, and real-time metrics
 */

import { db } from './database.js';
import { logger } from '../utils/logger.js';
import { eventPublisher } from './eventPublisher.js';
import type {
  EventPerformanceDashboard,
  EventPerformanceFilters,
  GoalVsActualSummary,
  EventGoalPerformance,
  AmbassadorGoalPerformance,
  RealtimeSignupTracking,
  SignupsByHour,
  PerformanceIndicator,
  TrendDirection,
} from '../types/dashboard.js';
import type { DashboardEvent } from '../types/events.js';

class DashboardService {
  // ============================================
  // EVENT PERFORMANCE DASHBOARD (REQ-AR-003)
  // ============================================

  /**
   * Get comprehensive event performance dashboard data
   */
  async getEventPerformanceDashboard(
    filters: EventPerformanceFilters
  ): Promise<EventPerformanceDashboard> {
    const { fromDate, toDate, region, operatorId, eventType, sortBy, sortOrder, limit, offset } = filters;

    logger.info({ filters }, 'Fetching event performance dashboard');

    const [
      summary,
      events,
      goalAnalysis,
      regionBreakdown,
      operatorBreakdown,
      trendData,
    ] = await Promise.all([
      this.getEventSummaryMetrics(fromDate, toDate, region, operatorId),
      this.getEventPerformanceList(filters),
      this.getGoalVsActualSummary(fromDate, toDate, region, operatorId),
      this.getPerformanceByRegion(fromDate, toDate),
      this.getPerformanceByOperator(fromDate, toDate, region),
      this.getPerformanceTrend(fromDate, toDate, region, operatorId),
    ]);

    return {
      summary,
      events,
      goalAnalysis,
      regionBreakdown,
      operatorBreakdown,
      trendData,
      filters: {
        fromDate,
        toDate,
        region,
        operatorId,
        eventType,
      },
      generatedAt: new Date(),
    };
  }

  /**
   * Get summary metrics for events in date range
   */
  private async getEventSummaryMetrics(
    fromDate: string,
    toDate: string,
    region?: string,
    operatorId?: number
  ): Promise<{
    totalEvents: number;
    totalSignups: number;
    totalRevenue: number;
    avgSignupsPerEvent: number;
    avgRevenue: number;
    goalAchievementRate: number;
    validationRate: number;
    topPerformingEventId?: string;
  }> {
    const regionFilter = region ? `AND e.state = $3` : '';
    const operatorFilter = operatorId ? `AND s.operator_id = ${region ? '$4' : '$3'}` : '';
    
    const params: (string | number)[] = [fromDate, toDate];
    if (region) params.push(region);
    if (operatorId) params.push(operatorId);

    const result = await db.queryOne<{
      total_events: string;
      total_signups: string;
      total_validated: string;
      total_revenue: string;
      avg_signups: string;
      total_goal: string;
      top_event_id: string;
    }>(`
      SELECT 
        COUNT(DISTINCT e.id) as total_events,
        COUNT(s.id) as total_signups,
        COUNT(s.id) FILTER (WHERE s.validation_status = 'validated') as total_validated,
        COALESCE(SUM(s.cpa_applied), 0) as total_revenue,
        AVG(signup_count) as avg_signups,
        COALESCE(SUM(e.signup_goal), 0) as total_goal,
        (
          SELECT e2.id FROM events e2
          LEFT JOIN signups s2 ON s2.event_id = e2.id
          WHERE e2.event_date BETWEEN $1 AND $2 ${regionFilter.replace('e.', 'e2.')}
          GROUP BY e2.id ORDER BY COUNT(s2.id) DESC LIMIT 1
        ) as top_event_id
      FROM events e
      LEFT JOIN signups s ON s.event_id = e.id
      LEFT JOIN (
        SELECT event_id, COUNT(*) as signup_count 
        FROM signups GROUP BY event_id
      ) sc ON sc.event_id = e.id
      WHERE e.event_date BETWEEN $1 AND $2 ${regionFilter} ${operatorFilter}
    `, params);

    const totalSignups = parseInt(result?.total_signups || '0');
    const totalValidated = parseInt(result?.total_validated || '0');
    const totalGoal = parseInt(result?.total_goal || '0');
    const totalEvents = parseInt(result?.total_events || '0');

    return {
      totalEvents,
      totalSignups,
      totalRevenue: parseFloat(result?.total_revenue || '0'),
      avgSignupsPerEvent: parseFloat(result?.avg_signups || '0'),
      avgRevenue: totalEvents > 0 ? parseFloat(result?.total_revenue || '0') / totalEvents : 0,
      goalAchievementRate: totalGoal > 0 ? (totalSignups / totalGoal) * 100 : 0,
      validationRate: totalSignups > 0 ? (totalValidated / totalSignups) * 100 : 0,
      topPerformingEventId: result?.top_event_id || undefined,
    };
  }

  /**
   * Get list of events with performance metrics
   */
  private async getEventPerformanceList(
    filters: EventPerformanceFilters
  ): Promise<EventGoalPerformance[]> {
    const { fromDate, toDate, region, operatorId, sortBy = 'signups', sortOrder = 'desc', limit = 50, offset = 0 } = filters;

    const regionFilter = region ? `AND e.state = $3` : '';
    const operatorFilter = operatorId ? `AND s.operator_id = ${region ? '$4' : '$3'}` : '';
    
    const params: (string | number)[] = [fromDate, toDate];
    if (region) params.push(region);
    if (operatorId) params.push(operatorId);

    // Map sortBy to column names
    const sortColumn = {
      signups: 'signup_count',
      revenue: 'total_revenue',
      achievement: 'achievement_percent',
      date: 'e.event_date',
    }[sortBy] || 'signup_count';

    const results = await db.queryMany<{
      id: string;
      title: string;
      event_date: string;
      location: string;
      state: string;
      signup_goal: string;
      signup_count: string;
      validated_count: string;
      total_revenue: string;
      ambassador_count: string;
      status: string;
    }>(`
      SELECT 
        e.id,
        e.title,
        e.event_date,
        e.location,
        e.state,
        COALESCE(e.signup_goal, 0) as signup_goal,
        COUNT(s.id) as signup_count,
        COUNT(s.id) FILTER (WHERE s.validation_status = 'validated') as validated_count,
        COALESCE(SUM(s.cpa_applied), 0) as total_revenue,
        COUNT(DISTINCT s.ambassador_id) as ambassador_count,
        e.status
      FROM events e
      LEFT JOIN signups s ON s.event_id = e.id
      WHERE e.event_date BETWEEN $1 AND $2 ${regionFilter} ${operatorFilter}
      GROUP BY e.id, e.title, e.event_date, e.location, e.state, e.signup_goal, e.status
      ORDER BY ${sortColumn} ${sortOrder.toUpperCase()}
      LIMIT ${limit} OFFSET ${offset}
    `, params);

    return results.map(row => {
      const signupGoal = parseInt(row.signup_goal);
      const signupCount = parseInt(row.signup_count);
      const achievementPercent = signupGoal > 0 ? (signupCount / signupGoal) * 100 : null;

      return {
        eventId: row.id,
        eventTitle: row.title,
        eventDate: row.event_date,
        location: row.location,
        region: row.state,
        signupGoal,
        actualSignups: signupCount,
        validatedSignups: parseInt(row.validated_count),
        achievementPercent,
        performanceIndicator: this.getPerformanceIndicator(achievementPercent),
        totalRevenue: parseFloat(row.total_revenue),
        ambassadorCount: parseInt(row.ambassador_count),
        avgSignupsPerAmbassador: parseInt(row.ambassador_count) > 0 
          ? signupCount / parseInt(row.ambassador_count) 
          : 0,
        status: row.status,
      };
    });
  }

  // ============================================
  // GOAL VS ACTUAL ANALYSIS (REQ-AR-003)
  // ============================================

  /**
   * Get aggregated goal vs actual summary
   */
  async getGoalVsActualSummary(
    fromDate: string,
    toDate: string,
    region?: string,
    operatorId?: number
  ): Promise<GoalVsActualSummary> {
    const regionFilter = region ? `AND e.state = $3` : '';
    const operatorFilter = operatorId ? `AND s.operator_id = ${region ? '$4' : '$3'}` : '';
    
    const params: (string | number)[] = [fromDate, toDate];
    if (region) params.push(region);
    if (operatorId) params.push(operatorId);

    const result = await db.queryOne<{
      total_goal: string;
      total_actual: string;
      events_with_goals: string;
      events_meeting_goal: string;
      events_exceeding_goal: string;
      events_underperforming: string;
    }>(`
      WITH event_performance AS (
        SELECT 
          e.id,
          COALESCE(e.signup_goal, 0) as goal,
          COUNT(s.id) as actual
        FROM events e
        LEFT JOIN signups s ON s.event_id = e.id
        WHERE e.event_date BETWEEN $1 AND $2 
          AND e.signup_goal IS NOT NULL AND e.signup_goal > 0
          ${regionFilter} ${operatorFilter}
        GROUP BY e.id, e.signup_goal
      )
      SELECT 
        SUM(goal) as total_goal,
        SUM(actual) as total_actual,
        COUNT(*) as events_with_goals,
        COUNT(*) FILTER (WHERE actual >= goal * 0.8 AND actual < goal * 1.2) as events_meeting_goal,
        COUNT(*) FILTER (WHERE actual >= goal * 1.2) as events_exceeding_goal,
        COUNT(*) FILTER (WHERE actual < goal * 0.8) as events_underperforming
      FROM event_performance
    `, params);

    const totalGoal = parseInt(result?.total_goal || '0');
    const totalActual = parseInt(result?.total_actual || '0');
    const eventsWithGoals = parseInt(result?.events_with_goals || '0');

    return {
      totalGoal,
      totalActual,
      overallAchievementPercent: totalGoal > 0 ? (totalActual / totalGoal) * 100 : 0,
      eventsWithGoals,
      eventsMeetingGoal: parseInt(result?.events_meeting_goal || '0'),
      eventsExceedingGoal: parseInt(result?.events_exceeding_goal || '0'),
      eventsUnderperforming: parseInt(result?.events_underperforming || '0'),
      performanceIndicator: this.getPerformanceIndicator(
        totalGoal > 0 ? (totalActual / totalGoal) * 100 : null
      ),
    };
  }

  /**
   * Get ambassador goal performance across events
   */
  async getAmbassadorGoalPerformance(
    fromDate: string,
    toDate: string,
    sortBy: 'achievement' | 'signups' | 'events' = 'achievement',
    sortOrder: 'asc' | 'desc' = 'desc',
    limit = 50
  ): Promise<AmbassadorGoalPerformance[]> {
    const sortColumn = {
      achievement: 'avg_achievement',
      signups: 'total_signups',
      events: 'event_count',
    }[sortBy];

    const results = await db.queryMany<{
      ambassador_id: string;
      first_name: string;
      last_name: string;
      event_count: string;
      total_goal: string;
      total_signups: string;
      validated_signups: string;
      events_meeting_goal: string;
    }>(`
      WITH ambassador_events AS (
        SELECT 
          a.id as ambassador_id,
          a.first_name,
          a.last_name,
          e.id as event_id,
          COALESCE(e.signup_goal, 0) as event_goal,
          COUNT(s.id) as signups,
          COUNT(s.id) FILTER (WHERE s.validation_status = 'validated') as validated
        FROM ambassadors a
        JOIN signups s ON s.ambassador_id = a.id
        JOIN events e ON e.id = s.event_id
        WHERE e.event_date BETWEEN $1 AND $2
        GROUP BY a.id, a.first_name, a.last_name, e.id, e.signup_goal
      )
      SELECT 
        ambassador_id,
        first_name,
        last_name,
        COUNT(DISTINCT event_id) as event_count,
        SUM(event_goal) as total_goal,
        SUM(signups) as total_signups,
        SUM(validated) as validated_signups,
        COUNT(*) FILTER (WHERE event_goal > 0 AND signups >= event_goal * 0.8) as events_meeting_goal
      FROM ambassador_events
      GROUP BY ambassador_id, first_name, last_name
      HAVING COUNT(DISTINCT event_id) >= 1
      ORDER BY 
        CASE WHEN SUM(event_goal) > 0 THEN SUM(signups)::float / SUM(event_goal) * 100 ELSE 0 END ${sortOrder.toUpperCase()}
      LIMIT $3
    `, [fromDate, toDate, limit]);

    return results.map(row => {
      const totalGoal = parseInt(row.total_goal);
      const totalSignups = parseInt(row.total_signups);
      const avgAchievement = totalGoal > 0 ? (totalSignups / totalGoal) * 100 : null;

      return {
        ambassadorId: row.ambassador_id,
        ambassadorName: `${row.first_name} ${row.last_name}`,
        eventCount: parseInt(row.event_count),
        totalGoal,
        totalSignups,
        validatedSignups: parseInt(row.validated_signups),
        avgAchievementPercent: avgAchievement,
        eventsMeetingGoal: parseInt(row.events_meeting_goal),
        performanceIndicator: this.getPerformanceIndicator(avgAchievement),
      };
    });
  }

  // ============================================
  // REAL-TIME SIGN-UP TRACKING
  // ============================================

  /**
   * Get real-time signup tracking data for today
   */
  async getRealtimeSignupTracking(): Promise<RealtimeSignupTracking> {
    const [
      todayMetrics,
      signupsByHour,
      activeEvents,
      activeAmbassadors,
      recentSignups,
      comparisonMetrics,
    ] = await Promise.all([
      this.getTodaySignupMetrics(),
      this.getSignupsByHour(),
      this.getActiveEventsCount(),
      this.getActiveAmbassadorsCount(),
      this.getRecentSignups(10),
      this.getComparisonMetrics(),
    ]);

    return {
      ...todayMetrics,
      signupsByHour,
      activeEvents,
      activeAmbassadors,
      recentSignups,
      comparison: comparisonMetrics,
      lastUpdated: new Date(),
    };
  }

  private async getTodaySignupMetrics(): Promise<{
    signupsToday: number;
    signupsThisHour: number;
    validatedToday: number;
    pendingToday: number;
    rejectedToday: number;
    revenueToday: number;
    validationRate: number;
  }> {
    const result = await db.queryOne<{
      total: string;
      this_hour: string;
      validated: string;
      pending: string;
      rejected: string;
      revenue: string;
    }>(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('hour', NOW())) as this_hour,
        COUNT(*) FILTER (WHERE validation_status = 'validated') as validated,
        COUNT(*) FILTER (WHERE validation_status = 'pending') as pending,
        COUNT(*) FILTER (WHERE validation_status = 'rejected') as rejected,
        COALESCE(SUM(cpa_applied), 0) as revenue
      FROM signups
      WHERE DATE(created_at) = CURRENT_DATE
    `);

    const total = parseInt(result?.total || '0');
    const validated = parseInt(result?.validated || '0');

    return {
      signupsToday: total,
      signupsThisHour: parseInt(result?.this_hour || '0'),
      validatedToday: validated,
      pendingToday: parseInt(result?.pending || '0'),
      rejectedToday: parseInt(result?.rejected || '0'),
      revenueToday: parseFloat(result?.revenue || '0'),
      validationRate: total > 0 ? (validated / total) * 100 : 0,
    };
  }

  private async getSignupsByHour(): Promise<SignupsByHour[]> {
    const results = await db.queryMany<{
      hour: string;
      count: string;
      validated: string;
      revenue: string;
    }>(`
      SELECT 
        EXTRACT(HOUR FROM created_at) as hour,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE validation_status = 'validated') as validated,
        COALESCE(SUM(cpa_applied), 0) as revenue
      FROM signups
      WHERE DATE(created_at) = CURRENT_DATE
      GROUP BY EXTRACT(HOUR FROM created_at)
      ORDER BY hour
    `);

    // Fill in all 24 hours
    const hourMap = new Map<number, SignupsByHour>();
    for (let h = 0; h < 24; h++) {
      hourMap.set(h, { hour: h, signups: 0, validated: 0, revenue: 0 });
    }

    for (const row of results) {
      const hour = parseInt(row.hour);
      hourMap.set(hour, {
        hour,
        signups: parseInt(row.count),
        validated: parseInt(row.validated),
        revenue: parseFloat(row.revenue),
      });
    }

    return Array.from(hourMap.values());
  }

  private async getActiveEventsCount(): Promise<number> {
    const result = await db.queryOne<{ count: string }>(`
      SELECT COUNT(*) as count FROM events 
      WHERE event_date = CURRENT_DATE AND status = 'active'
    `);
    return parseInt(result?.count || '0');
  }

  private async getActiveAmbassadorsCount(): Promise<number> {
    const result = await db.queryOne<{ count: string }>(`
      SELECT COUNT(DISTINCT ambassador_id) as count 
      FROM signups 
      WHERE DATE(created_at) = CURRENT_DATE
    `);
    return parseInt(result?.count || '0');
  }

  private async getRecentSignups(limit: number): Promise<{
    id: string;
    customerName: string;
    operatorName: string;
    ambassadorName: string;
    eventTitle: string;
    createdAt: Date;
    validationStatus: string;
  }[]> {
    const results = await db.queryMany<{
      id: string;
      customer_name: string;
      operator_name: string;
      ambassador_first: string;
      ambassador_last: string;
      event_title: string;
      created_at: string;
      validation_status: string;
    }>(`
      SELECT 
        s.id,
        CONCAT(s.customer_first_name, ' ', LEFT(s.customer_last_name, 1), '.') as customer_name,
        COALESCE(s.operator_name, o.display_name, 'Unknown') as operator_name,
        a.first_name as ambassador_first,
        a.last_name as ambassador_last,
        e.title as event_title,
        s.created_at,
        s.validation_status
      FROM signups s
      LEFT JOIN operators o ON o.id = s.operator_id
      LEFT JOIN ambassadors a ON a.id = s.ambassador_id
      LEFT JOIN events e ON e.id = s.event_id
      WHERE DATE(s.created_at) = CURRENT_DATE
      ORDER BY s.created_at DESC
      LIMIT $1
    `, [limit]);

    return results.map(row => ({
      id: row.id,
      customerName: row.customer_name,
      operatorName: row.operator_name,
      ambassadorName: `${row.ambassador_first} ${row.ambassador_last}`,
      eventTitle: row.event_title || 'N/A',
      createdAt: new Date(row.created_at),
      validationStatus: row.validation_status,
    }));
  }

  private async getComparisonMetrics(): Promise<{
    yesterdaySignups: number;
    lastWeekSameDaySignups: number;
    signupsTrend: TrendDirection;
    percentChangeFromYesterday: number;
  }> {
    const result = await db.queryOne<{
      today: string;
      yesterday: string;
      last_week: string;
    }>(`
      SELECT 
        (SELECT COUNT(*) FROM signups WHERE DATE(created_at) = CURRENT_DATE) as today,
        (SELECT COUNT(*) FROM signups WHERE DATE(created_at) = CURRENT_DATE - INTERVAL '1 day') as yesterday,
        (SELECT COUNT(*) FROM signups WHERE DATE(created_at) = CURRENT_DATE - INTERVAL '7 days') as last_week
    `);

    const today = parseInt(result?.today || '0');
    const yesterday = parseInt(result?.yesterday || '0');
    const lastWeek = parseInt(result?.last_week || '0');
    const percentChange = yesterday > 0 ? ((today - yesterday) / yesterday) * 100 : 0;

    return {
      yesterdaySignups: yesterday,
      lastWeekSameDaySignups: lastWeek,
      signupsTrend: today > yesterday ? 'up' : today < yesterday ? 'down' : 'stable',
      percentChangeFromYesterday: percentChange,
    };
  }

  // ============================================
  // PERFORMANCE BREAKDOWN
  // ============================================

  private async getPerformanceByRegion(
    fromDate: string,
    toDate: string
  ): Promise<{
    region: string;
    events: number;
    signups: number;
    revenue: number;
    goalAchievement: number;
  }[]> {
    const results = await db.queryMany<{
      state: string;
      events: string;
      signups: string;
      revenue: string;
      total_goal: string;
    }>(`
      SELECT 
        COALESCE(e.state, 'Unknown') as state,
        COUNT(DISTINCT e.id) as events,
        COUNT(s.id) as signups,
        COALESCE(SUM(s.cpa_applied), 0) as revenue,
        COALESCE(SUM(e.signup_goal), 0) as total_goal
      FROM events e
      LEFT JOIN signups s ON s.event_id = e.id
      WHERE e.event_date BETWEEN $1 AND $2
      GROUP BY e.state
      ORDER BY signups DESC
    `, [fromDate, toDate]);

    return results.map(row => {
      const signups = parseInt(row.signups);
      const totalGoal = parseInt(row.total_goal);
      return {
        region: row.state,
        events: parseInt(row.events),
        signups,
        revenue: parseFloat(row.revenue),
        goalAchievement: totalGoal > 0 ? (signups / totalGoal) * 100 : 0,
      };
    });
  }

  private async getPerformanceByOperator(
    fromDate: string,
    toDate: string,
    region?: string
  ): Promise<{
    operatorId: number;
    operatorName: string;
    signups: number;
    revenue: number;
    validationRate: number;
  }[]> {
    const regionFilter = region ? `AND e.state = $3` : '';
    const params: string[] = [fromDate, toDate];
    if (region) params.push(region);

    const results = await db.queryMany<{
      operator_id: string;
      operator_name: string;
      signups: string;
      validated: string;
      revenue: string;
    }>(`
      SELECT 
        s.operator_id,
        COALESCE(s.operator_name, o.display_name, 'Unknown') as operator_name,
        COUNT(s.id) as signups,
        COUNT(s.id) FILTER (WHERE s.validation_status = 'validated') as validated,
        COALESCE(SUM(s.cpa_applied), 0) as revenue
      FROM signups s
      LEFT JOIN operators o ON o.id = s.operator_id
      LEFT JOIN events e ON e.id = s.event_id
      WHERE e.event_date BETWEEN $1 AND $2 ${regionFilter}
      GROUP BY s.operator_id, s.operator_name, o.display_name
      ORDER BY signups DESC
    `, params);

    return results.map(row => {
      const signups = parseInt(row.signups);
      const validated = parseInt(row.validated);
      return {
        operatorId: parseInt(row.operator_id),
        operatorName: row.operator_name,
        signups,
        revenue: parseFloat(row.revenue),
        validationRate: signups > 0 ? (validated / signups) * 100 : 0,
      };
    });
  }

  private async getPerformanceTrend(
    fromDate: string,
    toDate: string,
    region?: string,
    operatorId?: number
  ): Promise<{
    date: string;
    events: number;
    signups: number;
    revenue: number;
    goalAchievement: number;
  }[]> {
    const regionFilter = region ? `AND e.state = $3` : '';
    const operatorFilter = operatorId ? `AND s.operator_id = ${region ? '$4' : '$3'}` : '';
    
    const params: (string | number)[] = [fromDate, toDate];
    if (region) params.push(region);
    if (operatorId) params.push(operatorId);

    const results = await db.queryMany<{
      date: string;
      events: string;
      signups: string;
      revenue: string;
      total_goal: string;
    }>(`
      SELECT 
        e.event_date as date,
        COUNT(DISTINCT e.id) as events,
        COUNT(s.id) as signups,
        COALESCE(SUM(s.cpa_applied), 0) as revenue,
        COALESCE(SUM(e.signup_goal), 0) as total_goal
      FROM events e
      LEFT JOIN signups s ON s.event_id = e.id
      WHERE e.event_date BETWEEN $1 AND $2 ${regionFilter} ${operatorFilter}
      GROUP BY e.event_date
      ORDER BY e.event_date
    `, params);

    return results.map(row => {
      const signups = parseInt(row.signups);
      const totalGoal = parseInt(row.total_goal);
      return {
        date: row.date,
        events: parseInt(row.events),
        signups,
        revenue: parseFloat(row.revenue),
        goalAchievement: totalGoal > 0 ? (signups / totalGoal) * 100 : 0,
      };
    });
  }

  // ============================================
  // WEBSOCKET BROADCAST
  // ============================================

  /**
   * Broadcast real-time signup update to subscribed clients
   */
  async broadcastSignupUpdate(signupData: {
    id: string;
    operatorId: number;
    ambassadorId: string;
    eventId?: string;
    validationStatus: string;
    cpaApplied?: number;
  }): Promise<void> {
    try {
      // Get updated real-time metrics
      const metrics = await this.getRealtimeSignupTracking();

      eventPublisher.publish({
        type: 'dashboard.signup_update',
        payload: {
          signup: signupData,
          metrics: {
            signupsToday: metrics.signupsToday,
            signupsThisHour: metrics.signupsThisHour,
            revenueToday: metrics.revenueToday,
            validationRate: metrics.validationRate,
          },
        },
      } as Omit<DashboardEvent, 'id' | 'timestamp'>);
    } catch (error) {
      logger.error({ error }, 'Failed to broadcast signup update');
    }
  }

  /**
   * Broadcast dashboard metrics refresh
   */
  async broadcastMetricsRefresh(): Promise<void> {
    try {
      const metrics = await this.getRealtimeSignupTracking();
      
      eventPublisher.publish({
        type: 'dashboard.metrics_refresh',
        payload: metrics as unknown as Record<string, unknown>,
      } as Omit<DashboardEvent, 'id' | 'timestamp'>);
    } catch (error) {
      logger.error({ error }, 'Failed to broadcast metrics refresh');
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  /**
   * Determine performance indicator based on achievement percentage
   * AC-AR-003.2: Below 80% = underperforming
   * AC-AR-003.3: Above 120% = exceptional
   */
  private getPerformanceIndicator(achievementPercent: number | null): PerformanceIndicator {
    if (achievementPercent === null) return 'no_goal';
    if (achievementPercent < 80) return 'underperforming';
    if (achievementPercent >= 120) return 'exceptional';
    return 'meeting_goal';
  }
}

export const dashboardService = new DashboardService();
