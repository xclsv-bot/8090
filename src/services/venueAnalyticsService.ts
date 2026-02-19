/**
 * Venue Analytics Service
 * WO-72: REQ-AR-007 - Venue Performance Analysis
 * Provides comprehensive venue performance metrics with consistency scoring
 */

import { db } from './database.js';
import { logger } from '../utils/logger.js';
import type {
  VenuePerformanceDashboard,
  VenuePerformanceFilters,
  VenueMetricsDetail,
  VenueConsistencyAnalysis,
  VenueEventHistory,
  TrendDirection,
} from '../types/dashboard.js';

// Minimum events required for reliable analysis
const MIN_EVENTS_FOR_ANALYSIS = 3;

class VenueAnalyticsService {
  // ============================================
  // VENUE PERFORMANCE DASHBOARD (REQ-AR-007)
  // ============================================

  /**
   * Get comprehensive venue performance dashboard
   * AC-AR-007.1 - AC-AR-007.6
   */
  async getVenuePerformanceDashboard(
    filters: VenuePerformanceFilters
  ): Promise<VenuePerformanceDashboard> {
    const { fromDate, toDate, region, minEvents, sortBy, sortOrder, limit, offset } = filters;

    logger.info({ filters }, 'Fetching venue performance dashboard');

    const [
      summary,
      venues,
      topVenues,
      bottomVenues,
      consistencyAnalysis,
    ] = await Promise.all([
      this.getVenueSummaryMetrics(fromDate, toDate, region),
      this.getVenuePerformanceList(filters),
      this.getTopPerformingVenues(fromDate, toDate, region, 10),
      this.getBottomPerformingVenues(fromDate, toDate, region, 10),
      this.getOverallConsistencyAnalysis(fromDate, toDate, region),
    ]);

    return {
      summary,
      venues,
      topVenues,
      bottomVenues,
      consistencyAnalysis,
      filters: {
        fromDate,
        toDate,
        region,
        minEvents,
      },
      generatedAt: new Date(),
    };
  }

  /**
   * Get summary metrics across all venues
   */
  private async getVenueSummaryMetrics(
    fromDate: string,
    toDate: string,
    region?: string
  ): Promise<{
    totalVenues: number;
    totalEvents: number;
    totalSignups: number;
    totalRevenue: number;
    avgSignupsPerEvent: number;
    avgProfitMargin: number;
    venuesWithReliableData: number;
    avgPerformanceScore: number;
  }> {
    const regionFilter = region ? `AND e.state = $3` : '';
    const params: string[] = [fromDate, toDate];
    if (region) params.push(region);

    const result = await db.queryOne<{
      total_venues: string;
      total_events: string;
      total_signups: string;
      total_revenue: string;
      total_expenses: string;
      venues_with_data: string;
      avg_performance_score: string;
    }>(`
      WITH venue_stats AS (
        SELECT 
          e.location,
          COUNT(DISTINCT e.id) as event_count,
          COUNT(s.id) as signups,
          COALESCE(SUM(s.cpa_applied), 0) as revenue,
          COALESCE(
            (SELECT SUM(exp.amount) FROM expenses exp WHERE exp.event_id = ANY(ARRAY_AGG(e.id))),
            0
          ) as expenses
        FROM events e
        LEFT JOIN signups s ON s.event_id = e.id
        WHERE e.event_date BETWEEN $1 AND $2 
          AND e.location IS NOT NULL 
          AND e.location != '' 
          ${regionFilter}
        GROUP BY e.location
      )
      SELECT 
        COUNT(*) as total_venues,
        SUM(event_count) as total_events,
        SUM(signups) as total_signups,
        SUM(revenue) as total_revenue,
        SUM(expenses) as total_expenses,
        COUNT(*) FILTER (WHERE event_count >= ${MIN_EVENTS_FOR_ANALYSIS}) as venues_with_data,
        AVG(CASE 
          WHEN event_count > 0 THEN (signups::float / event_count) * 10
          ELSE 0 
        END) as avg_performance_score
      FROM venue_stats
    `, params);

    const totalRevenue = parseFloat(result?.total_revenue || '0');
    const totalExpenses = parseFloat(result?.total_expenses || '0');

    return {
      totalVenues: parseInt(result?.total_venues || '0'),
      totalEvents: parseInt(result?.total_events || '0'),
      totalSignups: parseInt(result?.total_signups || '0'),
      totalRevenue,
      avgSignupsPerEvent: parseInt(result?.total_events || '0') > 0 
        ? parseInt(result?.total_signups || '0') / parseInt(result?.total_events || '0')
        : 0,
      avgProfitMargin: totalRevenue > 0 
        ? ((totalRevenue - totalExpenses) / totalRevenue) * 100 
        : 0,
      venuesWithReliableData: parseInt(result?.venues_with_data || '0'),
      avgPerformanceScore: parseFloat(result?.avg_performance_score || '0'),
    };
  }

  /**
   * Get detailed venue performance list
   * AC-AR-007.1, AC-AR-007.2, AC-AR-007.3, AC-AR-007.4
   */
  private async getVenuePerformanceList(
    filters: VenuePerformanceFilters
  ): Promise<VenueMetricsDetail[]> {
    const { fromDate, toDate, region, minEvents = 1, sortBy = 'signups', sortOrder = 'desc', limit = 50, offset = 0 } = filters;

    const regionFilter = region ? `AND e.state = $3` : '';
    const params: string[] = [fromDate, toDate];
    if (region) params.push(region);

    // Map sortBy to calculated fields
    const sortColumn = {
      signups: 'total_signups',
      revenue: 'total_revenue',
      avgSignups: 'avg_signups_per_event',
      events: 'event_count',
      score: 'performance_score',
      consistency: 'consistency_score',
      profitMargin: 'profit_margin',
    }[sortBy] || 'total_signups';

    const results = await db.queryMany<{
      location: string;
      state: string;
      city: string;
      event_count: string;
      total_signups: string;
      validated_signups: string;
      total_revenue: string;
      total_expenses: string;
      avg_signups_per_event: string;
      min_signups: string;
      max_signups: string;
      stddev_signups: string;
      avg_event_performance_score: string;
      first_event: string;
      last_event: string;
    }>(`
      WITH event_signups AS (
        SELECT 
          e.location,
          e.state,
          e.city,
          e.id as event_id,
          e.event_date,
          e.performance_score as event_performance_score,
          COUNT(s.id) as signups,
          COUNT(s.id) FILTER (WHERE s.validation_status = 'validated') as validated,
          COALESCE(SUM(s.cpa_applied), 0) as revenue
        FROM events e
        LEFT JOIN signups s ON s.event_id = e.id
        WHERE e.event_date BETWEEN $1 AND $2 
          AND e.location IS NOT NULL 
          AND e.location != '' 
          ${regionFilter}
        GROUP BY e.location, e.state, e.city, e.id, e.event_date, e.performance_score
      )
      SELECT 
        location,
        MAX(state) as state,
        MAX(city) as city,
        COUNT(DISTINCT event_id) as event_count,
        SUM(signups) as total_signups,
        SUM(validated) as validated_signups,
        SUM(revenue) as total_revenue,
        COALESCE(
          (SELECT SUM(exp.amount) FROM expenses exp WHERE exp.event_id IN (SELECT event_id FROM event_signups e2 WHERE e2.location = event_signups.location)),
          0
        ) as total_expenses,
        AVG(signups) as avg_signups_per_event,
        MIN(signups) as min_signups,
        MAX(signups) as max_signups,
        STDDEV(signups) as stddev_signups,
        AVG(event_performance_score) as avg_event_performance_score,
        MIN(event_date) as first_event,
        MAX(event_date) as last_event
      FROM event_signups
      GROUP BY location
      HAVING COUNT(DISTINCT event_id) >= ${minEvents}
      ORDER BY ${sortColumn} ${sortOrder.toUpperCase()}
      LIMIT ${limit} OFFSET ${offset}
    `, params);

    return results.map(row => {
      const eventCount = parseInt(row.event_count);
      const totalRevenue = parseFloat(row.total_revenue);
      const totalExpenses = parseFloat(row.total_expenses);
      const avgSignups = parseFloat(row.avg_signups_per_event);
      const stddev = parseFloat(row.stddev_signups || '0');

      // AC-AR-007.5: Calculate consistency score based on standard deviation
      // Lower standard deviation = more consistent = higher score
      // Consistency score = 100 - (coefficient of variation * 100), capped at 0-100
      const coefficientOfVariation = avgSignups > 0 ? (stddev / avgSignups) : 0;
      const consistencyScore = Math.max(0, Math.min(100, 100 - (coefficientOfVariation * 100)));

      // AC-AR-007.3: Performance score as average of event performance scores
      const performanceScore = parseFloat(row.avg_event_performance_score || '0');

      // AC-AR-007.6: Flag if insufficient data
      const hasReliableData = eventCount >= MIN_EVENTS_FOR_ANALYSIS;

      return {
        venueId: row.location, // Using location as venue ID
        venueName: row.location,
        location: row.location,
        city: row.city || '',
        region: row.state || '',
        eventCount,
        totalSignups: parseInt(row.total_signups),
        validatedSignups: parseInt(row.validated_signups),
        avgSignupsPerEvent: avgSignups,
        minSignups: parseInt(row.min_signups),
        maxSignups: parseInt(row.max_signups),
        signupsStandardDeviation: stddev,
        totalRevenue,
        totalExpenses,
        avgProfitMargin: totalRevenue > 0 
          ? ((totalRevenue - totalExpenses) / totalRevenue) * 100 
          : 0,
        performanceScore,
        consistencyScore,
        hasReliableData,
        insufficientDataMessage: !hasReliableData 
          ? `Insufficient data for reliable analysis (requires at least ${MIN_EVENTS_FOR_ANALYSIS} events, has ${eventCount})` 
          : undefined,
        firstEventDate: row.first_event,
        lastEventDate: row.last_event,
      };
    });
  }

  /**
   * Get top performing venues
   */
  private async getTopPerformingVenues(
    fromDate: string,
    toDate: string,
    region?: string,
    limit = 10
  ): Promise<VenueMetricsDetail[]> {
    return this.getVenuePerformanceList({
      fromDate,
      toDate,
      region,
      minEvents: MIN_EVENTS_FOR_ANALYSIS,
      sortBy: 'score',
      sortOrder: 'desc',
      limit,
      offset: 0,
    });
  }

  /**
   * Get bottom performing venues
   */
  private async getBottomPerformingVenues(
    fromDate: string,
    toDate: string,
    region?: string,
    limit = 10
  ): Promise<VenueMetricsDetail[]> {
    return this.getVenuePerformanceList({
      fromDate,
      toDate,
      region,
      minEvents: MIN_EVENTS_FOR_ANALYSIS,
      sortBy: 'score',
      sortOrder: 'asc',
      limit,
      offset: 0,
    });
  }

  /**
   * Get overall consistency analysis across venues
   */
  private async getOverallConsistencyAnalysis(
    fromDate: string,
    toDate: string,
    region?: string
  ): Promise<VenueConsistencyAnalysis> {
    const regionFilter = region ? `AND e.state = $3` : '';
    const params: string[] = [fromDate, toDate];
    if (region) params.push(region);

    const result = await db.queryOne<{
      avg_consistency: string;
      highly_consistent: string;
      moderately_consistent: string;
      inconsistent: string;
      total_analyzed: string;
    }>(`
      WITH venue_consistency AS (
        SELECT 
          e.location,
          AVG(signup_count) as avg_signups,
          STDDEV(signup_count) as std_signups,
          COUNT(*) as event_count
        FROM events e
        LEFT JOIN (
          SELECT event_id, COUNT(*) as signup_count 
          FROM signups GROUP BY event_id
        ) s ON s.event_id = e.id
        WHERE e.event_date BETWEEN $1 AND $2 
          AND e.location IS NOT NULL 
          AND e.location != '' 
          ${regionFilter}
        GROUP BY e.location
        HAVING COUNT(*) >= ${MIN_EVENTS_FOR_ANALYSIS}
      ),
      consistency_scores AS (
        SELECT 
          location,
          CASE 
            WHEN avg_signups > 0 THEN GREATEST(0, LEAST(100, 100 - ((std_signups / avg_signups) * 100)))
            ELSE 0 
          END as consistency_score
        FROM venue_consistency
      )
      SELECT 
        AVG(consistency_score) as avg_consistency,
        COUNT(*) FILTER (WHERE consistency_score >= 80) as highly_consistent,
        COUNT(*) FILTER (WHERE consistency_score >= 50 AND consistency_score < 80) as moderately_consistent,
        COUNT(*) FILTER (WHERE consistency_score < 50) as inconsistent,
        COUNT(*) as total_analyzed
      FROM consistency_scores
    `, params);

    return {
      avgConsistencyScore: parseFloat(result?.avg_consistency || '0'),
      highlyConsistentVenues: parseInt(result?.highly_consistent || '0'),
      moderatelyConsistentVenues: parseInt(result?.moderately_consistent || '0'),
      inconsistentVenues: parseInt(result?.inconsistent || '0'),
      totalVenuesAnalyzed: parseInt(result?.total_analyzed || '0'),
      thresholds: {
        highlyConsistent: 80,
        moderatelyConsistent: 50,
      },
    };
  }

  // ============================================
  // SINGLE VENUE DETAIL
  // ============================================

  /**
   * Get detailed performance for a single venue
   */
  async getVenueDetail(
    venueName: string,
    fromDate: string,
    toDate: string
  ): Promise<VenueMetricsDetail & {
    eventHistory: VenueEventHistory[];
    operatorBreakdown: { operatorId: number; operatorName: string; signups: number; revenue: number }[];
    ambassadorBreakdown: { ambassadorId: string; ambassadorName: string; signups: number; avgPerEvent: number }[];
    monthlyTrend: { month: string; events: number; signups: number; revenue: number }[];
  }> {
    // Get basic venue metrics
    const venues = await this.getVenuePerformanceList({
      fromDate,
      toDate,
      minEvents: 1,
      sortBy: 'signups',
      sortOrder: 'desc',
      limit: 1000, // Get all to find our venue
      offset: 0,
    });

    const venueMetrics = venues.find(v => v.venueName === venueName);
    if (!venueMetrics) {
      throw new Error(`Venue not found: ${venueName}`);
    }

    // Get event history
    const eventHistory = await db.queryMany<{
      event_id: string;
      event_title: string;
      event_date: string;
      signup_count: string;
      validated_count: string;
      revenue: string;
      ambassador_count: string;
      performance_score: string;
    }>(`
      SELECT 
        e.id as event_id,
        e.title as event_title,
        e.event_date,
        COUNT(s.id) as signup_count,
        COUNT(s.id) FILTER (WHERE s.validation_status = 'validated') as validated_count,
        COALESCE(SUM(s.cpa_applied), 0) as revenue,
        COUNT(DISTINCT s.ambassador_id) as ambassador_count,
        e.performance_score
      FROM events e
      LEFT JOIN signups s ON s.event_id = e.id
      WHERE e.location = $1 AND e.event_date BETWEEN $2 AND $3
      GROUP BY e.id, e.title, e.event_date, e.performance_score
      ORDER BY e.event_date DESC
    `, [venueName, fromDate, toDate]);

    // Get operator breakdown
    const operatorBreakdown = await db.queryMany<{
      operator_id: string;
      operator_name: string;
      signup_count: string;
      revenue: string;
    }>(`
      SELECT 
        s.operator_id,
        COALESCE(s.operator_name, o.display_name, 'Unknown') as operator_name,
        COUNT(s.id) as signup_count,
        COALESCE(SUM(s.cpa_applied), 0) as revenue
      FROM signups s
      LEFT JOIN operators o ON o.id = s.operator_id
      LEFT JOIN events e ON e.id = s.event_id
      WHERE e.location = $1 AND e.event_date BETWEEN $2 AND $3
      GROUP BY s.operator_id, s.operator_name, o.display_name
      ORDER BY signup_count DESC
    `, [venueName, fromDate, toDate]);

    // Get ambassador breakdown
    const ambassadorBreakdown = await db.queryMany<{
      ambassador_id: string;
      first_name: string;
      last_name: string;
      signup_count: string;
      event_count: string;
    }>(`
      SELECT 
        a.id as ambassador_id,
        a.first_name,
        a.last_name,
        COUNT(s.id) as signup_count,
        COUNT(DISTINCT s.event_id) as event_count
      FROM ambassadors a
      JOIN signups s ON s.ambassador_id = a.id
      JOIN events e ON e.id = s.event_id
      WHERE e.location = $1 AND e.event_date BETWEEN $2 AND $3
      GROUP BY a.id, a.first_name, a.last_name
      ORDER BY signup_count DESC
      LIMIT 20
    `, [venueName, fromDate, toDate]);

    // Get monthly trend
    const monthlyTrend = await db.queryMany<{
      month: string;
      event_count: string;
      signup_count: string;
      revenue: string;
    }>(`
      SELECT 
        TO_CHAR(e.event_date, 'YYYY-MM') as month,
        COUNT(DISTINCT e.id) as event_count,
        COUNT(s.id) as signup_count,
        COALESCE(SUM(s.cpa_applied), 0) as revenue
      FROM events e
      LEFT JOIN signups s ON s.event_id = e.id
      WHERE e.location = $1 AND e.event_date BETWEEN $2 AND $3
      GROUP BY TO_CHAR(e.event_date, 'YYYY-MM')
      ORDER BY month
    `, [venueName, fromDate, toDate]);

    return {
      ...venueMetrics,
      eventHistory: eventHistory.map(row => ({
        eventId: row.event_id,
        eventTitle: row.event_title,
        eventDate: row.event_date,
        signups: parseInt(row.signup_count),
        validatedSignups: parseInt(row.validated_count),
        revenue: parseFloat(row.revenue),
        ambassadorCount: parseInt(row.ambassador_count),
        performanceScore: parseFloat(row.performance_score || '0'),
      })),
      operatorBreakdown: operatorBreakdown.map(row => ({
        operatorId: parseInt(row.operator_id),
        operatorName: row.operator_name,
        signups: parseInt(row.signup_count),
        revenue: parseFloat(row.revenue),
      })),
      ambassadorBreakdown: ambassadorBreakdown.map(row => {
        const signups = parseInt(row.signup_count);
        const events = parseInt(row.event_count);
        return {
          ambassadorId: row.ambassador_id,
          ambassadorName: `${row.first_name} ${row.last_name}`,
          signups,
          avgPerEvent: events > 0 ? signups / events : 0,
        };
      }),
      monthlyTrend: monthlyTrend.map(row => ({
        month: row.month,
        events: parseInt(row.event_count),
        signups: parseInt(row.signup_count),
        revenue: parseFloat(row.revenue),
      })),
    };
  }

  // ============================================
  // VENUE COMPARISON
  // ============================================

  /**
   * Compare multiple venues side by side
   */
  async compareVenues(
    venueNames: string[],
    fromDate: string,
    toDate: string
  ): Promise<{
    venues: VenueMetricsDetail[];
    comparisonMetrics: {
      metric: string;
      values: { venue: string; value: number; rank: number }[];
    }[];
  }> {
    const allVenues = await this.getVenuePerformanceList({
      fromDate,
      toDate,
      minEvents: 1,
      sortBy: 'signups',
      sortOrder: 'desc',
      limit: 1000,
      offset: 0,
    });

    const venues = allVenues.filter(v => venueNames.includes(v.venueName));

    // Build comparison metrics
    const metrics = [
      { key: 'totalSignups', label: 'Total Signups' },
      { key: 'avgSignupsPerEvent', label: 'Avg Signups/Event' },
      { key: 'totalRevenue', label: 'Total Revenue' },
      { key: 'performanceScore', label: 'Performance Score' },
      { key: 'consistencyScore', label: 'Consistency Score' },
      { key: 'avgProfitMargin', label: 'Profit Margin' },
    ];

    const comparisonMetrics = metrics.map(({ key, label }) => {
      const values = venues
        .map(v => ({
          venue: v.venueName,
          value: (v as any)[key] as number,
          rank: 0,
        }))
        .sort((a, b) => b.value - a.value)
        .map((item, index) => ({ ...item, rank: index + 1 }));

      return { metric: label, values };
    });

    return { venues, comparisonMetrics };
  }

  // ============================================
  // VENUE RECOMMENDATIONS
  // ============================================

  /**
   * Get venue recommendations based on performance
   */
  async getVenueRecommendations(
    fromDate: string,
    toDate: string,
    region?: string
  ): Promise<{
    expandUsage: VenueMetricsDetail[];
    needsAttention: VenueMetricsDetail[];
    newVenueOpportunities: { region: string; avgPerformance: number; venueCount: number }[];
  }> {
    // Get all venues with reliable data
    const venues = await this.getVenuePerformanceList({
      fromDate,
      toDate,
      region,
      minEvents: MIN_EVENTS_FOR_ANALYSIS,
      sortBy: 'score',
      sortOrder: 'desc',
      limit: 1000,
      offset: 0,
    });

    // Calculate median performance score
    const scores = venues.map(v => v.performanceScore).sort((a, b) => a - b);
    const medianScore = scores[Math.floor(scores.length / 2)] || 0;

    // High performers that could handle more events
    const expandUsage = venues
      .filter(v => v.performanceScore > medianScore * 1.2 && v.consistencyScore >= 70)
      .slice(0, 10);

    // Low performers that need attention
    const needsAttention = venues
      .filter(v => v.performanceScore < medianScore * 0.8 || v.consistencyScore < 50)
      .slice(0, 10);

    // Find regions with high performance for new venue opportunities
    const regionPerformance = await db.queryMany<{
      state: string;
      avg_performance: string;
      venue_count: string;
    }>(`
      SELECT 
        e.state,
        AVG(signup_count)::float as avg_performance,
        COUNT(DISTINCT e.location) as venue_count
      FROM events e
      LEFT JOIN (
        SELECT event_id, COUNT(*) as signup_count 
        FROM signups GROUP BY event_id
      ) s ON s.event_id = e.id
      WHERE e.event_date BETWEEN $1 AND $2 
        AND e.state IS NOT NULL
        ${region ? 'AND e.state = $3' : ''}
      GROUP BY e.state
      HAVING COUNT(DISTINCT e.id) >= 5
      ORDER BY avg_performance DESC
    `, region ? [fromDate, toDate, region] : [fromDate, toDate]);

    return {
      expandUsage,
      needsAttention,
      newVenueOpportunities: regionPerformance.map(row => ({
        region: row.state,
        avgPerformance: parseFloat(row.avg_performance),
        venueCount: parseInt(row.venue_count),
      })),
    };
  }
}

export const venueAnalyticsService = new VenueAnalyticsService();
