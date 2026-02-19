/**
 * Real-time Metrics Service
 * WO-71: Real-time Metric Calculation Framework
 * Provides cached, fast-access metrics for dashboards
 */

import { db } from './database.js';
import { logger } from '../utils/logger.js';
import type {
  RealtimeMetric,
  RealtimeDashboardData,
  RealtimeMetricsCacheEntry,
} from '../types/analytics.js';

// In-memory cache for fastest access
interface MemoryCacheEntry {
  value: number;
  unit: string;
  calculatedAt: Date;
  expiresAt: Date;
}

class RealtimeMetricsService {
  private memoryCache: Map<string, MemoryCacheEntry> = new Map();
  private readonly DEFAULT_TTL_SECONDS = 300; // 5 minutes
  private readonly FAST_TTL_SECONDS = 60; // 1 minute for volatile metrics

  // ============================================
  // DASHBOARD DATA
  // ============================================

  /**
   * Get all real-time dashboard metrics
   */
  async getDashboardData(): Promise<RealtimeDashboardData> {
    const [
      signupsToday,
      signupsThisHour,
      activeEvents,
      activeAmbassadors,
      validationRate,
      pendingSignups,
    ] = await Promise.all([
      this.getMetric('signups_today'),
      this.getMetric('signups_this_hour'),
      this.getMetric('active_events'),
      this.getMetric('active_ambassadors'),
      this.getMetric('validation_rate'),
      this.getMetric('pending_signups'),
    ]);

    return {
      signupsToday,
      signupsThisHour,
      activeEvents,
      activeAmbassadors,
      validationRate,
      pendingSignups,
      lastUpdated: new Date(),
    };
  }

  /**
   * Get a single metric (with caching)
   */
  async getMetric(key: string): Promise<RealtimeMetric> {
    // Check memory cache first
    const cached = this.getFromMemoryCache(key);
    if (cached) {
      return {
        key,
        value: cached.value,
        unit: cached.unit,
        calculatedAt: cached.calculatedAt,
        ttlSeconds: Math.max(0, Math.floor((cached.expiresAt.getTime() - Date.now()) / 1000)),
        source: 'cache',
      };
    }

    // Check database cache
    const dbCached = await this.getFromDbCache(key);
    if (dbCached) {
      this.setMemoryCache(key, dbCached.metricValue, this.getUnit(key), dbCached.ttlSeconds);
      return {
        key,
        value: dbCached.metricValue,
        unit: this.getUnit(key),
        calculatedAt: dbCached.calculatedAt,
        ttlSeconds: dbCached.ttlSeconds,
        source: 'cache',
      };
    }

    // Calculate fresh
    const { value, unit } = await this.calculateMetric(key);
    const ttl = this.getTtl(key);

    // Store in both caches
    await this.setDbCache(key, value, ttl);
    this.setMemoryCache(key, value, unit, ttl);

    return {
      key,
      value,
      unit,
      calculatedAt: new Date(),
      ttlSeconds: ttl,
      source: 'calculated',
    };
  }

  /**
   * Refresh a specific metric
   */
  async refreshMetric(key: string): Promise<RealtimeMetric> {
    this.memoryCache.delete(key);
    await db.query(`DELETE FROM realtime_metrics_cache WHERE metric_key = $1`, [key]);
    return this.getMetric(key);
  }

  /**
   * Refresh all metrics
   */
  async refreshAllMetrics(): Promise<void> {
    this.memoryCache.clear();
    await db.query(`DELETE FROM realtime_metrics_cache`);
    logger.info('All metrics cache cleared');
  }

  // ============================================
  // METRIC CALCULATIONS
  // ============================================

  private async calculateMetric(key: string): Promise<{ value: number; unit: string }> {
    switch (key) {
      case 'signups_today':
        return this.calculateSignupsToday();
      case 'signups_this_hour':
        return this.calculateSignupsThisHour();
      case 'active_events':
        return this.calculateActiveEvents();
      case 'active_ambassadors':
        return this.calculateActiveAmbassadors();
      case 'validation_rate':
        return this.calculateValidationRate();
      case 'pending_signups':
        return this.calculatePendingSignups();
      case 'revenue_today':
        return this.calculateRevenueToday();
      case 'avg_signups_per_ambassador':
        return this.calculateAvgSignupsPerAmbassador();
      default:
        logger.warn({ key }, 'Unknown metric key');
        return { value: 0, unit: 'count' };
    }
  }

  private async calculateSignupsToday(): Promise<{ value: number; unit: string }> {
    const result = await db.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM signups WHERE DATE(created_at) = CURRENT_DATE`
    );
    return { value: parseInt(result?.count || '0'), unit: 'count' };
  }

  private async calculateSignupsThisHour(): Promise<{ value: number; unit: string }> {
    const result = await db.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM signups 
       WHERE created_at >= DATE_TRUNC('hour', NOW())`
    );
    return { value: parseInt(result?.count || '0'), unit: 'count' };
  }

  private async calculateActiveEvents(): Promise<{ value: number; unit: string }> {
    const result = await db.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM events 
       WHERE status = 'active' AND event_date = CURRENT_DATE`
    );
    return { value: parseInt(result?.count || '0'), unit: 'count' };
  }

  private async calculateActiveAmbassadors(): Promise<{ value: number; unit: string }> {
    const result = await db.queryOne<{ count: string }>(
      `SELECT COUNT(DISTINCT ambassador_id) as count FROM signups 
       WHERE DATE(created_at) = CURRENT_DATE`
    );
    return { value: parseInt(result?.count || '0'), unit: 'count' };
  }

  private async calculateValidationRate(): Promise<{ value: number; unit: string }> {
    const result = await db.queryOne<{ rate: string }>(
      `SELECT 
        CASE WHEN COUNT(*) > 0 
          THEN COUNT(*) FILTER (WHERE validation_status = 'validated')::float / COUNT(*) * 100
          ELSE 0 
        END as rate
       FROM signups WHERE DATE(created_at) = CURRENT_DATE`
    );
    return { value: parseFloat(result?.rate || '0'), unit: '%' };
  }

  private async calculatePendingSignups(): Promise<{ value: number; unit: string }> {
    const result = await db.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM signups WHERE validation_status = 'pending'`
    );
    return { value: parseInt(result?.count || '0'), unit: 'count' };
  }

  private async calculateRevenueToday(): Promise<{ value: number; unit: string }> {
    const result = await db.queryOne<{ sum: string }>(
      `SELECT COALESCE(SUM(amount), 0) as sum FROM revenue_records 
       WHERE revenue_date = CURRENT_DATE`
    );
    return { value: parseFloat(result?.sum || '0'), unit: 'USD' };
  }

  private async calculateAvgSignupsPerAmbassador(): Promise<{ value: number; unit: string }> {
    const result = await db.queryOne<{ avg: string }>(
      `SELECT AVG(signup_count) as avg FROM (
        SELECT ambassador_id, COUNT(*) as signup_count 
        FROM signups WHERE DATE(created_at) = CURRENT_DATE
        GROUP BY ambassador_id
      ) s`
    );
    return { value: parseFloat(result?.avg || '0'), unit: 'count' };
  }

  // ============================================
  // BULK CALCULATIONS
  // ============================================

  /**
   * Calculate multiple metrics at once (efficient for dashboards)
   */
  async calculateBulkMetrics(): Promise<Record<string, number>> {
    const result = await db.queryOne<{
      signups_today: string;
      signups_this_hour: string;
      active_events: string;
      active_ambassadors: string;
      pending_signups: string;
      validation_rate: string;
    }>(`
      SELECT
        (SELECT COUNT(*) FROM signups WHERE DATE(created_at) = CURRENT_DATE) as signups_today,
        (SELECT COUNT(*) FROM signups WHERE created_at >= DATE_TRUNC('hour', NOW())) as signups_this_hour,
        (SELECT COUNT(*) FROM events WHERE status = 'active' AND event_date = CURRENT_DATE) as active_events,
        (SELECT COUNT(DISTINCT ambassador_id) FROM signups WHERE DATE(created_at) = CURRENT_DATE) as active_ambassadors,
        (SELECT COUNT(*) FROM signups WHERE validation_status = 'pending') as pending_signups,
        (SELECT CASE WHEN COUNT(*) > 0 
          THEN COUNT(*) FILTER (WHERE validation_status = 'validated')::float / COUNT(*) * 100
          ELSE 0 END FROM signups WHERE DATE(created_at) = CURRENT_DATE) as validation_rate
    `);

    return {
      signups_today: parseInt(result?.signups_today || '0'),
      signups_this_hour: parseInt(result?.signups_this_hour || '0'),
      active_events: parseInt(result?.active_events || '0'),
      active_ambassadors: parseInt(result?.active_ambassadors || '0'),
      pending_signups: parseInt(result?.pending_signups || '0'),
      validation_rate: parseFloat(result?.validation_rate || '0'),
    };
  }

  /**
   * Warm up the cache with commonly used metrics
   */
  async warmCache(): Promise<void> {
    const metrics = [
      'signups_today',
      'signups_this_hour',
      'active_events',
      'active_ambassadors',
      'validation_rate',
      'pending_signups',
    ];

    await Promise.all(metrics.map((key) => this.getMetric(key)));
    logger.info({ metricCount: metrics.length }, 'Metrics cache warmed');
  }

  // ============================================
  // MEMORY CACHE
  // ============================================

  private getFromMemoryCache(key: string): MemoryCacheEntry | null {
    const entry = this.memoryCache.get(key);
    if (!entry) return null;
    if (entry.expiresAt < new Date()) {
      this.memoryCache.delete(key);
      return null;
    }
    return entry;
  }

  private setMemoryCache(key: string, value: number, unit: string, ttlSeconds: number): void {
    this.memoryCache.set(key, {
      value,
      unit,
      calculatedAt: new Date(),
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    });
  }

  // ============================================
  // DATABASE CACHE
  // ============================================

  private async getFromDbCache(key: string): Promise<RealtimeMetricsCacheEntry | null> {
    const result = await db.queryOne<{
      id: string;
      metric_key: string;
      metric_value: string;
      metric_context: string | null;
      calculated_at: string;
      expires_at: string;
      ttl_seconds: string;
    }>(
      `SELECT * FROM realtime_metrics_cache 
       WHERE metric_key = $1 AND expires_at > NOW()`,
      [key]
    );
    
    if (!result) return null;

    return {
      id: result.id,
      metricKey: result.metric_key,
      metricValue: parseFloat(result.metric_value),
      metricContext: result.metric_context
        ? JSON.parse(result.metric_context)
        : undefined,
      calculatedAt: new Date(result.calculated_at),
      expiresAt: new Date(result.expires_at),
      ttlSeconds: parseInt(result.ttl_seconds),
    };
  }

  private async setDbCache(key: string, value: number, ttlSeconds: number): Promise<void> {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    await db.query(
      `INSERT INTO realtime_metrics_cache (metric_key, metric_value, expires_at, ttl_seconds)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (metric_key) DO UPDATE SET
         metric_value = $2,
         calculated_at = NOW(),
         expires_at = $3,
         ttl_seconds = $4`,
      [key, value, expiresAt.toISOString(), ttlSeconds]
    );
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private getTtl(key: string): number {
    // Volatile metrics get shorter TTL
    const fastMetrics = ['signups_this_hour', 'pending_signups'];
    return fastMetrics.includes(key) ? this.FAST_TTL_SECONDS : this.DEFAULT_TTL_SECONDS;
  }

  private getUnit(key: string): string {
    const units: Record<string, string> = {
      signups_today: 'count',
      signups_this_hour: 'count',
      active_events: 'count',
      active_ambassadors: 'count',
      validation_rate: '%',
      pending_signups: 'count',
      revenue_today: 'USD',
      avg_signups_per_ambassador: 'count',
    };
    return units[key] || 'count';
  }

  /**
   * Cleanup expired cache entries
   */
  async cleanupExpiredCache(): Promise<number> {
    // Clean memory cache
    const now = new Date();
    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.expiresAt < now) {
        this.memoryCache.delete(key);
      }
    }

    // Clean database cache
    const result = await db.query(
      `DELETE FROM realtime_metrics_cache WHERE expires_at < NOW()`
    );

    return result.rowCount || 0;
  }
}

export const realtimeMetricsService = new RealtimeMetricsService();
