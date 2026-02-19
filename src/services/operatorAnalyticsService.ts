/**
 * Operator Analytics Service
 * WO-72: REQ-AR-004 - Operator Performance Dashboard
 * Provides comprehensive operator performance metrics including volume, drop-off rates, and trends
 */

import { db } from './database.js';
import { logger } from '../utils/logger.js';
import type {
  OperatorPerformanceDashboard,
  OperatorPerformanceFilters,
  OperatorMetricsDetail,
  OperatorTrendData,
  OperatorDropOffAnalysis,
  OperatorLocationBreakdown,
  TrendDirection,
} from '../types/dashboard.js';

class OperatorAnalyticsService {
  // Average drop-off rate threshold for flagging (10 percentage points worse than average)
  private readonly DROP_OFF_FLAG_THRESHOLD = 10;

  // ============================================
  // OPERATOR PERFORMANCE DASHBOARD (REQ-AR-004)
  // ============================================

  /**
   * Get comprehensive operator performance dashboard
   * AC-AR-004.1 - AC-AR-004.6
   */
  async getOperatorPerformanceDashboard(
    filters: OperatorPerformanceFilters
  ): Promise<OperatorPerformanceDashboard> {
    const { fromDate, toDate, region, operatorIds, groupByLocation, sortBy, sortOrder, limit, offset } = filters;

    logger.info({ filters }, 'Fetching operator performance dashboard');

    const [
      summary,
      operators,
      dropOffAnalysis,
      locationBreakdown,
      trendData,
    ] = await Promise.all([
      this.getOperatorSummaryMetrics(fromDate, toDate, region, operatorIds),
      this.getOperatorPerformanceList(filters),
      this.getDropOffAnalysis(fromDate, toDate, region),
      groupByLocation ? this.getOperatorsByLocation(fromDate, toDate, region) : Promise.resolve([]),
      this.getOperatorTrendData(fromDate, toDate, region, operatorIds),
    ]);

    return {
      summary,
      operators,
      dropOffAnalysis,
      locationBreakdown,
      trendData,
      filters: {
        fromDate,
        toDate,
        region,
        operatorIds,
        groupByLocation,
      },
      generatedAt: new Date(),
    };
  }

  /**
   * Get summary metrics for all operators
   */
  private async getOperatorSummaryMetrics(
    fromDate: string,
    toDate: string,
    region?: string,
    operatorIds?: number[]
  ): Promise<{
    totalOperators: number;
    totalSignups: number;
    totalRevenue: number;
    avgSignupsPerOperator: number;
    avgDropOffRate: number;
    flaggedOperatorCount: number;
  }> {
    const regionFilter = region ? `AND e.state = $3` : '';
    const operatorFilter = operatorIds?.length 
      ? `AND s.operator_id = ANY(${region ? '$4' : '$3'}::int[])` 
      : '';
    
    const params: (string | number | number[])[] = [fromDate, toDate];
    if (region) params.push(region);
    if (operatorIds?.length) params.push(operatorIds);

    // Get signup metrics
    const signupResult = await db.queryOne<{
      total_operators: string;
      total_signups: string;
      total_revenue: string;
    }>(`
      SELECT 
        COUNT(DISTINCT s.operator_id) as total_operators,
        COUNT(s.id) as total_signups,
        COALESCE(SUM(s.cpa_applied), 0) as total_revenue
      FROM signups s
      LEFT JOIN events e ON e.id = s.event_id
      WHERE DATE(s.created_at) BETWEEN $1 AND $2 ${regionFilter} ${operatorFilter}
    `, params);

    // Get drop-off metrics from monthly validation data
    const dropOffResult = await db.queryOne<{
      avg_drop_off: string;
      flagged_count: string;
    }>(`
      WITH operator_drop_offs AS (
        SELECT 
          s.operator_id,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE s.validation_status = 'rejected' OR s.validation_status = 'invalid') as dropped
        FROM signups s
        LEFT JOIN events e ON e.id = s.event_id
        WHERE DATE(s.created_at) BETWEEN $1 AND $2 ${regionFilter} ${operatorFilter}
        GROUP BY s.operator_id
        HAVING COUNT(*) >= 10
      ),
      avg_stats AS (
        SELECT AVG(dropped::float / NULLIF(total, 0) * 100) as avg_rate
        FROM operator_drop_offs
      )
      SELECT 
        COALESCE(a.avg_rate, 0) as avg_drop_off,
        COUNT(*) FILTER (
          WHERE (o.dropped::float / NULLIF(o.total, 0) * 100) > (a.avg_rate + ${this.DROP_OFF_FLAG_THRESHOLD})
        ) as flagged_count
      FROM operator_drop_offs o, avg_stats a
      GROUP BY a.avg_rate
    `, params);

    const totalOperators = parseInt(signupResult?.total_operators || '0');
    const totalSignups = parseInt(signupResult?.total_signups || '0');

    return {
      totalOperators,
      totalSignups,
      totalRevenue: parseFloat(signupResult?.total_revenue || '0'),
      avgSignupsPerOperator: totalOperators > 0 ? totalSignups / totalOperators : 0,
      avgDropOffRate: parseFloat(dropOffResult?.avg_drop_off || '0'),
      flaggedOperatorCount: parseInt(dropOffResult?.flagged_count || '0'),
    };
  }

  /**
   * Get detailed operator performance list
   * AC-AR-004.1, AC-AR-004.2, AC-AR-004.3
   */
  private async getOperatorPerformanceList(
    filters: OperatorPerformanceFilters
  ): Promise<OperatorMetricsDetail[]> {
    const { fromDate, toDate, region, operatorIds, sortBy = 'signups', sortOrder = 'desc', limit = 50, offset = 0 } = filters;

    const regionFilter = region ? `AND e.state = $3` : '';
    const operatorFilter = operatorIds?.length 
      ? `AND s.operator_id = ANY(${region ? '$4' : '$3'}::int[])` 
      : '';
    
    const params: (string | number | number[])[] = [fromDate, toDate];
    if (region) params.push(region);
    if (operatorIds?.length) params.push(operatorIds);

    // Map sortBy to column names
    const sortColumn = {
      signups: 'signup_count',
      revenue: 'total_revenue',
      dropOff: 'drop_off_rate',
      validation: 'validation_rate',
    }[sortBy] || 'signup_count';

    const results = await db.queryMany<{
      operator_id: string;
      operator_name: string;
      signup_count: string;
      validated_count: string;
      rejected_count: string;
      pending_count: string;
      total_revenue: string;
      event_count: string;
      region_count: string;
    }>(`
      SELECT 
        s.operator_id,
        COALESCE(s.operator_name, o.display_name, 'Unknown') as operator_name,
        COUNT(s.id) as signup_count,
        COUNT(s.id) FILTER (WHERE s.validation_status = 'validated') as validated_count,
        COUNT(s.id) FILTER (WHERE s.validation_status = 'rejected' OR s.validation_status = 'invalid') as rejected_count,
        COUNT(s.id) FILTER (WHERE s.validation_status = 'pending') as pending_count,
        COALESCE(SUM(s.cpa_applied), 0) as total_revenue,
        COUNT(DISTINCT s.event_id) as event_count,
        COUNT(DISTINCT e.state) as region_count
      FROM signups s
      LEFT JOIN operators o ON o.id = s.operator_id
      LEFT JOIN events e ON e.id = s.event_id
      WHERE DATE(s.created_at) BETWEEN $1 AND $2 ${regionFilter} ${operatorFilter}
      GROUP BY s.operator_id, s.operator_name, o.display_name
      ORDER BY ${sortColumn} ${sortOrder.toUpperCase()}
      LIMIT ${limit} OFFSET ${offset}
    `, params);

    // Calculate average drop-off for flagging
    const avgDropOff = await this.getAverageDropOffRate(fromDate, toDate, region);

    return results.map(row => {
      const signupCount = parseInt(row.signup_count);
      const validatedCount = parseInt(row.validated_count);
      const rejectedCount = parseInt(row.rejected_count);
      
      const validationRate = signupCount > 0 ? (validatedCount / signupCount) * 100 : 0;
      const dropOffRate = signupCount > 0 ? (rejectedCount / signupCount) * 100 : 0;
      
      // AC-AR-004.4: Flag if drop-off rate is >10 percentage points worse than average
      const isFlagged = dropOffRate > (avgDropOff + this.DROP_OFF_FLAG_THRESHOLD);

      return {
        operatorId: parseInt(row.operator_id),
        operatorName: row.operator_name,
        signupVolume: signupCount,
        validatedSignups: validatedCount,
        rejectedSignups: rejectedCount,
        pendingSignups: parseInt(row.pending_count),
        revenueContribution: parseFloat(row.total_revenue),
        validationRate,
        dropOffRate,
        eventCount: parseInt(row.event_count),
        regionCount: parseInt(row.region_count),
        isFlagged,
        flagReason: isFlagged ? `Drop-off rate ${dropOffRate.toFixed(1)}% exceeds average by more than ${this.DROP_OFF_FLAG_THRESHOLD}%` : undefined,
        performanceTrend: 'stable' as TrendDirection, // Will be populated by trend analysis
      };
    });
  }

  /**
   * Get drop-off analysis with operator comparison
   * AC-AR-004.3, AC-AR-004.4
   */
  private async getDropOffAnalysis(
    fromDate: string,
    toDate: string,
    region?: string
  ): Promise<OperatorDropOffAnalysis> {
    const regionFilter = region ? `AND e.state = $3` : '';
    const params: string[] = [fromDate, toDate];
    if (region) params.push(region);

    const result = await db.queryOne<{
      avg_drop_off: string;
      min_drop_off: string;
      max_drop_off: string;
      std_dev: string;
      total_operators: string;
      flagged_operators: string;
    }>(`
      WITH operator_rates AS (
        SELECT 
          s.operator_id,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE s.validation_status = 'rejected' OR s.validation_status = 'invalid') as dropped,
          (COUNT(*) FILTER (WHERE s.validation_status = 'rejected' OR s.validation_status = 'invalid')::float / NULLIF(COUNT(*), 0) * 100) as drop_rate
        FROM signups s
        LEFT JOIN events e ON e.id = s.event_id
        WHERE DATE(s.created_at) BETWEEN $1 AND $2 ${regionFilter}
        GROUP BY s.operator_id
        HAVING COUNT(*) >= 10
      )
      SELECT 
        AVG(drop_rate) as avg_drop_off,
        MIN(drop_rate) as min_drop_off,
        MAX(drop_rate) as max_drop_off,
        STDDEV(drop_rate) as std_dev,
        COUNT(*) as total_operators,
        COUNT(*) FILTER (WHERE drop_rate > AVG(drop_rate) OVER() + ${this.DROP_OFF_FLAG_THRESHOLD}) as flagged_operators
      FROM operator_rates
    `, params);

    // Get top operators by drop-off (for investigation)
    const worstOperators = await db.queryMany<{
      operator_id: string;
      operator_name: string;
      drop_rate: string;
      total: string;
    }>(`
      SELECT 
        s.operator_id,
        COALESCE(s.operator_name, o.display_name, 'Unknown') as operator_name,
        (COUNT(*) FILTER (WHERE s.validation_status = 'rejected' OR s.validation_status = 'invalid')::float / NULLIF(COUNT(*), 0) * 100) as drop_rate,
        COUNT(*) as total
      FROM signups s
      LEFT JOIN operators o ON o.id = s.operator_id
      LEFT JOIN events e ON e.id = s.event_id
      WHERE DATE(s.created_at) BETWEEN $1 AND $2 ${regionFilter}
      GROUP BY s.operator_id, s.operator_name, o.display_name
      HAVING COUNT(*) >= 10
      ORDER BY drop_rate DESC
      LIMIT 10
    `, params);

    const avgDropOff = parseFloat(result?.avg_drop_off || '0');

    return {
      averageDropOffRate: avgDropOff,
      minDropOffRate: parseFloat(result?.min_drop_off || '0'),
      maxDropOffRate: parseFloat(result?.max_drop_off || '0'),
      standardDeviation: parseFloat(result?.std_dev || '0'),
      totalOperatorsAnalyzed: parseInt(result?.total_operators || '0'),
      flaggedOperatorsCount: parseInt(result?.flagged_operators || '0'),
      flagThreshold: avgDropOff + this.DROP_OFF_FLAG_THRESHOLD,
      worstPerformers: worstOperators.map(row => ({
        operatorId: parseInt(row.operator_id),
        operatorName: row.operator_name,
        dropOffRate: parseFloat(row.drop_rate),
        signupVolume: parseInt(row.total),
        deviationFromAverage: parseFloat(row.drop_rate) - avgDropOff,
      })),
    };
  }

  /**
   * Get operator performance grouped by location/region
   * AC-AR-004.5
   */
  private async getOperatorsByLocation(
    fromDate: string,
    toDate: string,
    region?: string
  ): Promise<OperatorLocationBreakdown[]> {
    const regionFilter = region ? `AND e.state = $3` : '';
    const params: string[] = [fromDate, toDate];
    if (region) params.push(region);

    const results = await db.queryMany<{
      state: string;
      operator_id: string;
      operator_name: string;
      signup_count: string;
      validated_count: string;
      rejected_count: string;
      revenue: string;
    }>(`
      SELECT 
        COALESCE(e.state, 'Unknown') as state,
        s.operator_id,
        COALESCE(s.operator_name, o.display_name, 'Unknown') as operator_name,
        COUNT(s.id) as signup_count,
        COUNT(s.id) FILTER (WHERE s.validation_status = 'validated') as validated_count,
        COUNT(s.id) FILTER (WHERE s.validation_status = 'rejected' OR s.validation_status = 'invalid') as rejected_count,
        COALESCE(SUM(s.cpa_applied), 0) as revenue
      FROM signups s
      LEFT JOIN operators o ON o.id = s.operator_id
      LEFT JOIN events e ON e.id = s.event_id
      WHERE DATE(s.created_at) BETWEEN $1 AND $2 ${regionFilter}
      GROUP BY e.state, s.operator_id, s.operator_name, o.display_name
      ORDER BY e.state, signup_count DESC
    `, params);

    // Group by location
    const locationMap = new Map<string, {
      signups: number;
      revenue: number;
      operators: {
        operatorId: number;
        operatorName: string;
        signups: number;
        revenue: number;
        validationRate: number;
        dropOffRate: number;
      }[];
    }>();

    for (const row of results) {
      const location = row.state;
      if (!locationMap.has(location)) {
        locationMap.set(location, { signups: 0, revenue: 0, operators: [] });
      }

      const entry = locationMap.get(location)!;
      const signupCount = parseInt(row.signup_count);
      const validatedCount = parseInt(row.validated_count);
      const rejectedCount = parseInt(row.rejected_count);
      const revenue = parseFloat(row.revenue);

      entry.signups += signupCount;
      entry.revenue += revenue;
      entry.operators.push({
        operatorId: parseInt(row.operator_id),
        operatorName: row.operator_name,
        signups: signupCount,
        revenue,
        validationRate: signupCount > 0 ? (validatedCount / signupCount) * 100 : 0,
        dropOffRate: signupCount > 0 ? (rejectedCount / signupCount) * 100 : 0,
      });
    }

    return Array.from(locationMap.entries()).map(([location, data]) => ({
      location,
      totalSignups: data.signups,
      totalRevenue: data.revenue,
      operatorCount: data.operators.length,
      operators: data.operators,
    }));
  }

  /**
   * Get operator trend data over time
   * AC-AR-004.6
   */
  private async getOperatorTrendData(
    fromDate: string,
    toDate: string,
    region?: string,
    operatorIds?: number[]
  ): Promise<OperatorTrendData[]> {
    const regionFilter = region ? `AND e.state = $3` : '';
    const operatorFilter = operatorIds?.length 
      ? `AND s.operator_id = ANY(${region ? '$4' : '$3'}::int[])` 
      : '';
    
    const params: (string | number | number[])[] = [fromDate, toDate];
    if (region) params.push(region);
    if (operatorIds?.length) params.push(operatorIds);

    const results = await db.queryMany<{
      date: string;
      operator_id: string;
      operator_name: string;
      signup_count: string;
      validated_count: string;
      rejected_count: string;
      revenue: string;
    }>(`
      SELECT 
        DATE(s.created_at) as date,
        s.operator_id,
        COALESCE(s.operator_name, o.display_name, 'Unknown') as operator_name,
        COUNT(s.id) as signup_count,
        COUNT(s.id) FILTER (WHERE s.validation_status = 'validated') as validated_count,
        COUNT(s.id) FILTER (WHERE s.validation_status = 'rejected' OR s.validation_status = 'invalid') as rejected_count,
        COALESCE(SUM(s.cpa_applied), 0) as revenue
      FROM signups s
      LEFT JOIN operators o ON o.id = s.operator_id
      LEFT JOIN events e ON e.id = s.event_id
      WHERE DATE(s.created_at) BETWEEN $1 AND $2 ${regionFilter} ${operatorFilter}
      GROUP BY DATE(s.created_at), s.operator_id, s.operator_name, o.display_name
      ORDER BY date, operator_id
    `, params);

    // Group by operator for trend analysis
    const operatorTrends = new Map<number, OperatorTrendData>();

    for (const row of results) {
      const operatorId = parseInt(row.operator_id);
      const signupCount = parseInt(row.signup_count);
      const validatedCount = parseInt(row.validated_count);
      const rejectedCount = parseInt(row.rejected_count);

      if (!operatorTrends.has(operatorId)) {
        operatorTrends.set(operatorId, {
          operatorId,
          operatorName: row.operator_name,
          dataPoints: [],
          volumeTrend: 'stable',
          dropOffTrend: 'stable',
        });
      }

      operatorTrends.get(operatorId)!.dataPoints.push({
        date: row.date,
        signups: signupCount,
        validated: validatedCount,
        rejected: rejectedCount,
        revenue: parseFloat(row.revenue),
        dropOffRate: signupCount > 0 ? (rejectedCount / signupCount) * 100 : 0,
      });
    }

    // Calculate trends for each operator
    for (const trend of operatorTrends.values()) {
      if (trend.dataPoints.length >= 2) {
        const firstHalf = trend.dataPoints.slice(0, Math.floor(trend.dataPoints.length / 2));
        const secondHalf = trend.dataPoints.slice(Math.floor(trend.dataPoints.length / 2));

        const firstHalfAvgSignups = firstHalf.reduce((sum, dp) => sum + dp.signups, 0) / firstHalf.length;
        const secondHalfAvgSignups = secondHalf.reduce((sum, dp) => sum + dp.signups, 0) / secondHalf.length;
        
        const firstHalfAvgDropOff = firstHalf.reduce((sum, dp) => sum + dp.dropOffRate, 0) / firstHalf.length;
        const secondHalfAvgDropOff = secondHalf.reduce((sum, dp) => sum + dp.dropOffRate, 0) / secondHalf.length;

        // Volume trend
        if (secondHalfAvgSignups > firstHalfAvgSignups * 1.1) {
          trend.volumeTrend = 'up';
        } else if (secondHalfAvgSignups < firstHalfAvgSignups * 0.9) {
          trend.volumeTrend = 'down';
        }

        // Drop-off trend (lower is better)
        if (secondHalfAvgDropOff > firstHalfAvgDropOff * 1.1) {
          trend.dropOffTrend = 'up'; // Getting worse
        } else if (secondHalfAvgDropOff < firstHalfAvgDropOff * 0.9) {
          trend.dropOffTrend = 'down'; // Improving
        }
      }
    }

    return Array.from(operatorTrends.values());
  }

  // ============================================
  // SINGLE OPERATOR DETAIL
  // ============================================

  /**
   * Get detailed performance for a single operator
   */
  async getOperatorDetail(
    operatorId: number,
    fromDate: string,
    toDate: string
  ): Promise<OperatorMetricsDetail & {
    trendData: OperatorTrendData;
    locationBreakdown: { location: string; signups: number; revenue: number; validationRate: number }[];
    eventBreakdown: { eventId: string; eventTitle: string; signups: number; revenue: number }[];
  }> {
    // Get basic metrics
    const metricsResult = await db.queryOne<{
      operator_name: string;
      signup_count: string;
      validated_count: string;
      rejected_count: string;
      pending_count: string;
      total_revenue: string;
      event_count: string;
      region_count: string;
    }>(`
      SELECT 
        COALESCE(s.operator_name, o.display_name, 'Unknown') as operator_name,
        COUNT(s.id) as signup_count,
        COUNT(s.id) FILTER (WHERE s.validation_status = 'validated') as validated_count,
        COUNT(s.id) FILTER (WHERE s.validation_status = 'rejected' OR s.validation_status = 'invalid') as rejected_count,
        COUNT(s.id) FILTER (WHERE s.validation_status = 'pending') as pending_count,
        COALESCE(SUM(s.cpa_applied), 0) as total_revenue,
        COUNT(DISTINCT s.event_id) as event_count,
        COUNT(DISTINCT e.state) as region_count
      FROM signups s
      LEFT JOIN operators o ON o.id = s.operator_id
      LEFT JOIN events e ON e.id = s.event_id
      WHERE s.operator_id = $1 AND DATE(s.created_at) BETWEEN $2 AND $3
      GROUP BY s.operator_name, o.display_name
    `, [operatorId, fromDate, toDate]);

    // Get location breakdown
    const locationBreakdown = await db.queryMany<{
      state: string;
      signup_count: string;
      validated_count: string;
      revenue: string;
    }>(`
      SELECT 
        COALESCE(e.state, 'Unknown') as state,
        COUNT(s.id) as signup_count,
        COUNT(s.id) FILTER (WHERE s.validation_status = 'validated') as validated_count,
        COALESCE(SUM(s.cpa_applied), 0) as revenue
      FROM signups s
      LEFT JOIN events e ON e.id = s.event_id
      WHERE s.operator_id = $1 AND DATE(s.created_at) BETWEEN $2 AND $3
      GROUP BY e.state
      ORDER BY signup_count DESC
    `, [operatorId, fromDate, toDate]);

    // Get event breakdown
    const eventBreakdown = await db.queryMany<{
      event_id: string;
      event_title: string;
      signup_count: string;
      revenue: string;
    }>(`
      SELECT 
        e.id as event_id,
        e.title as event_title,
        COUNT(s.id) as signup_count,
        COALESCE(SUM(s.cpa_applied), 0) as revenue
      FROM signups s
      LEFT JOIN events e ON e.id = s.event_id
      WHERE s.operator_id = $1 AND DATE(s.created_at) BETWEEN $2 AND $3
      GROUP BY e.id, e.title
      ORDER BY signup_count DESC
      LIMIT 20
    `, [operatorId, fromDate, toDate]);

    // Get trend data
    const [trendData] = await this.getOperatorTrendData(fromDate, toDate, undefined, [operatorId]);

    const signupCount = parseInt(metricsResult?.signup_count || '0');
    const validatedCount = parseInt(metricsResult?.validated_count || '0');
    const rejectedCount = parseInt(metricsResult?.rejected_count || '0');
    const avgDropOff = await this.getAverageDropOffRate(fromDate, toDate);
    const dropOffRate = signupCount > 0 ? (rejectedCount / signupCount) * 100 : 0;

    return {
      operatorId,
      operatorName: metricsResult?.operator_name || 'Unknown',
      signupVolume: signupCount,
      validatedSignups: validatedCount,
      rejectedSignups: rejectedCount,
      pendingSignups: parseInt(metricsResult?.pending_count || '0'),
      revenueContribution: parseFloat(metricsResult?.total_revenue || '0'),
      validationRate: signupCount > 0 ? (validatedCount / signupCount) * 100 : 0,
      dropOffRate,
      eventCount: parseInt(metricsResult?.event_count || '0'),
      regionCount: parseInt(metricsResult?.region_count || '0'),
      isFlagged: dropOffRate > (avgDropOff + this.DROP_OFF_FLAG_THRESHOLD),
      performanceTrend: trendData?.volumeTrend || 'stable',
      trendData: trendData || {
        operatorId,
        operatorName: metricsResult?.operator_name || 'Unknown',
        dataPoints: [],
        volumeTrend: 'stable',
        dropOffTrend: 'stable',
      },
      locationBreakdown: locationBreakdown.map(row => ({
        location: row.state,
        signups: parseInt(row.signup_count),
        revenue: parseFloat(row.revenue),
        validationRate: parseInt(row.signup_count) > 0 
          ? (parseInt(row.validated_count) / parseInt(row.signup_count)) * 100 
          : 0,
      })),
      eventBreakdown: eventBreakdown.map(row => ({
        eventId: row.event_id,
        eventTitle: row.event_title || 'Unknown Event',
        signups: parseInt(row.signup_count),
        revenue: parseFloat(row.revenue),
      })),
    };
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private async getAverageDropOffRate(
    fromDate: string,
    toDate: string,
    region?: string
  ): Promise<number> {
    const regionFilter = region ? `AND e.state = $3` : '';
    const params: string[] = [fromDate, toDate];
    if (region) params.push(region);

    const result = await db.queryOne<{ avg_drop_off: string }>(`
      WITH operator_rates AS (
        SELECT 
          s.operator_id,
          (COUNT(*) FILTER (WHERE s.validation_status = 'rejected' OR s.validation_status = 'invalid')::float / NULLIF(COUNT(*), 0) * 100) as drop_rate
        FROM signups s
        LEFT JOIN events e ON e.id = s.event_id
        WHERE DATE(s.created_at) BETWEEN $1 AND $2 ${regionFilter}
        GROUP BY s.operator_id
        HAVING COUNT(*) >= 10
      )
      SELECT AVG(drop_rate) as avg_drop_off FROM operator_rates
    `, params);

    return parseFloat(result?.avg_drop_off || '0');
  }
}

export const operatorAnalyticsService = new OperatorAnalyticsService();
