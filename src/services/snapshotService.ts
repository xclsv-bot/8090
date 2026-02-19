/**
 * Snapshot Service
 * WO-71: Daily Snapshot Calculation Jobs and Infrastructure
 * Handles creation and management of daily metrics snapshots
 */

import { db } from './database.js';
import { logger } from '../utils/logger.js';
import type {
  DailyMetricsSnapshot,
  SnapshotStatus,
  CalculatedMetrics,
  SignupMetrics,
  EventMetrics,
  AmbassadorMetrics,
  FinancialMetrics,
  QualityMetrics,
  MetricCalculationContext,
  RegionMetrics,
  OperatorMetrics,
  SkillLevelMetrics,
  DetailedMetrics,
  TopPerformer,
  TopEvent,
} from '../types/analytics.js';

class SnapshotService {
  // ============================================
  // DAILY SNAPSHOT CREATION
  // ============================================

  /**
   * Create or update daily metrics snapshot for a specific date
   */
  async createDailySnapshot(date: Date = new Date()): Promise<DailyMetricsSnapshot> {
    const snapshotDate = this.formatDate(date);
    const startTime = Date.now();

    logger.info({ snapshotDate }, 'Starting daily snapshot creation');

    try {
      // Mark snapshot as processing
      await this.upsertSnapshotStatus(snapshotDate, 'processing', startTime);

      // Build calculation context
      const context = this.buildCalculationContext(date);

      // Calculate all metrics in parallel where possible
      const [
        signupMetrics,
        eventMetrics,
        ambassadorMetrics,
        financialMetrics,
        qualityMetrics,
        regionMetrics,
        operatorMetrics,
        skillLevelMetrics,
        detailedMetrics,
      ] = await Promise.all([
        this.calculateSignupMetrics(context),
        this.calculateEventMetrics(context),
        this.calculateAmbassadorMetrics(context),
        this.calculateFinancialMetrics(context),
        this.calculateQualityMetrics(context),
        this.calculateRegionMetrics(context),
        this.calculateOperatorMetrics(context),
        this.calculateSkillLevelMetrics(context),
        this.calculateDetailedMetrics(context),
      ]);

      const processingDurationMs = Date.now() - startTime;

      // Upsert the snapshot
      const snapshot = await this.upsertSnapshot({
        snapshotDate,
        snapshotStatus: 'completed',
        processingStartedAt: new Date(startTime),
        processingCompletedAt: new Date(),
        processingDurationMs,
        ...this.flattenSignupMetrics(signupMetrics),
        ...this.flattenEventMetrics(eventMetrics),
        ...this.flattenAmbassadorMetrics(ambassadorMetrics),
        ...this.flattenFinancialMetrics(financialMetrics),
        ...this.flattenQualityMetrics(qualityMetrics),
        metricsByRegion: regionMetrics,
        metricsByOperator: operatorMetrics,
        metricsBySkillLevel: skillLevelMetrics,
        detailedMetrics,
      });

      // Store KPI historical values
      await this.storeHistoricalValues(snapshotDate, {
        signupMetrics,
        eventMetrics,
        ambassadorMetrics,
        financialMetrics,
        qualityMetrics,
      });

      logger.info(
        { snapshotDate, processingDurationMs, snapshotId: snapshot.id },
        'Daily snapshot created successfully'
      );

      return snapshot;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.upsertSnapshotStatus(snapshotDate, 'failed', startTime, errorMessage);
      logger.error({ snapshotDate, error: errorMessage }, 'Failed to create daily snapshot');
      throw error;
    }
  }

  /**
   * Get snapshot for a specific date
   */
  async getSnapshot(date: string): Promise<DailyMetricsSnapshot | null> {
    const result = await db.queryOne<DailyMetricsSnapshot>(
      `SELECT * FROM daily_metrics_snapshots WHERE snapshot_date = $1`,
      [date]
    );
    return result ? this.mapSnapshotFromDb(result) : null;
  }

  /**
   * Get snapshots for a date range
   */
  async getSnapshots(fromDate: string, toDate: string): Promise<DailyMetricsSnapshot[]> {
    const results = await db.queryMany<DailyMetricsSnapshot>(
      `SELECT * FROM daily_metrics_snapshots 
       WHERE snapshot_date BETWEEN $1 AND $2 
       ORDER BY snapshot_date DESC`,
      [fromDate, toDate]
    );
    return results.map(this.mapSnapshotFromDb);
  }

  /**
   * Get latest completed snapshot
   */
  async getLatestSnapshot(): Promise<DailyMetricsSnapshot | null> {
    const result = await db.queryOne<DailyMetricsSnapshot>(
      `SELECT * FROM daily_metrics_snapshots 
       WHERE snapshot_status = 'completed' 
       ORDER BY snapshot_date DESC LIMIT 1`
    );
    return result ? this.mapSnapshotFromDb(result) : null;
  }

  /**
   * Compare two snapshots
   */
  async compareSnapshots(date1: string, date2: string) {
    const [snapshot1, snapshot2] = await Promise.all([
      this.getSnapshot(date1),
      this.getSnapshot(date2),
    ]);

    if (!snapshot1 || !snapshot2) {
      throw new Error('One or both snapshots not found');
    }

    return {
      current: snapshot1,
      previous: snapshot2,
      changes: this.calculateChanges(snapshot1, snapshot2),
    };
  }

  // ============================================
  // METRIC CALCULATIONS
  // ============================================

  private async calculateSignupMetrics(ctx: MetricCalculationContext): Promise<SignupMetrics> {
    const result = await db.queryOne<{
      total: string;
      validated: string;
      rejected: string;
      pending: string;
      duplicates: string;
      avg_processing_ms: string;
    }>(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE validation_status = 'validated') as validated,
        COUNT(*) FILTER (WHERE validation_status = 'rejected') as rejected,
        COUNT(*) FILTER (WHERE validation_status = 'pending') as pending,
        COUNT(*) FILTER (WHERE validation_status = 'duplicate') as duplicates,
        AVG(EXTRACT(EPOCH FROM (validated_at - submitted_at)) * 1000) 
          FILTER (WHERE validated_at IS NOT NULL) as avg_processing_ms
       FROM signups 
       WHERE created_at >= $1 AND created_at < $2`,
      [ctx.startOfDay.toISOString(), ctx.endOfDay.toISOString()]
    );

    const total = parseInt(result?.total || '0');
    const validated = parseInt(result?.validated || '0');
    const duplicates = parseInt(result?.duplicates || '0');

    return {
      total,
      validated,
      rejected: parseInt(result?.rejected || '0'),
      pending: parseInt(result?.pending || '0'),
      validationRate: total > 0 ? (validated / total) * 100 : 0,
      duplicateRate: total > 0 ? (duplicates / total) * 100 : 0,
      avgProcessingTimeMs: parseInt(result?.avg_processing_ms || '0'),
    };
  }

  private async calculateEventMetrics(ctx: MetricCalculationContext): Promise<EventMetrics> {
    const result = await db.queryOne<{
      total: string;
      active: string;
      completed: string;
      cancelled: string;
      avg_signups: string;
    }>(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'active') as active,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
        AVG(signup_count) as avg_signups
       FROM events e
       LEFT JOIN (
         SELECT event_id, COUNT(*) as signup_count 
         FROM signups WHERE created_at >= $1 AND created_at < $2
         GROUP BY event_id
       ) s ON s.event_id = e.id
       WHERE e.event_date = $3`,
      [ctx.startOfDay.toISOString(), ctx.endOfDay.toISOString(), this.formatDate(ctx.date)]
    );

    return {
      total: parseInt(result?.total || '0'),
      active: parseInt(result?.active || '0'),
      completed: parseInt(result?.completed || '0'),
      cancelled: parseInt(result?.cancelled || '0'),
      avgSignupsPerEvent: parseFloat(result?.avg_signups || '0'),
    };
  }

  private async calculateAmbassadorMetrics(ctx: MetricCalculationContext): Promise<AmbassadorMetrics> {
    const result = await db.queryOne<{
      active: string;
      new_today: string;
      checked_in: string;
      avg_signups: string;
      total_assigned: string;
    }>(
      `SELECT 
        COUNT(DISTINCT s.ambassador_id) as active,
        (SELECT COUNT(*) FROM ambassadors WHERE DATE(created_at) = $3) as new_today,
        COUNT(DISTINCT ea.ambassador_id) FILTER (WHERE ea.check_in_time IS NOT NULL) as checked_in,
        AVG(signup_count) as avg_signups,
        (SELECT COUNT(DISTINCT ambassador_id) FROM event_assignments ea2 
         JOIN events e ON e.id = ea2.event_id WHERE e.event_date = $3) as total_assigned
       FROM signups s
       LEFT JOIN event_assignments ea ON ea.ambassador_id = s.ambassador_id
       LEFT JOIN (
         SELECT ambassador_id, COUNT(*) as signup_count 
         FROM signups WHERE created_at >= $1 AND created_at < $2
         GROUP BY ambassador_id
       ) sc ON sc.ambassador_id = s.ambassador_id
       WHERE s.created_at >= $1 AND s.created_at < $2`,
      [ctx.startOfDay.toISOString(), ctx.endOfDay.toISOString(), this.formatDate(ctx.date)]
    );

    const active = parseInt(result?.active || '0');
    const totalAssigned = parseInt(result?.total_assigned || '0');

    return {
      active,
      new: parseInt(result?.new_today || '0'),
      checkedIn: parseInt(result?.checked_in || '0'),
      avgSignups: parseFloat(result?.avg_signups || '0'),
      utilizationRate: totalAssigned > 0 ? (active / totalAssigned) * 100 : 0,
    };
  }

  private async calculateFinancialMetrics(ctx: MetricCalculationContext): Promise<FinancialMetrics> {
    const result = await db.queryOne<{
      revenue: string;
      expenses: string;
      payroll: string;
      signup_count: string;
    }>(
      `SELECT 
        COALESCE((SELECT SUM(amount) FROM revenue_records WHERE revenue_date = $1), 0) as revenue,
        COALESCE((SELECT SUM(amount) FROM expenses WHERE DATE(submitted_at) = $1), 0) as expenses,
        COALESCE((SELECT SUM(amount) FROM expenses WHERE DATE(submitted_at) = $1 AND category = 'payroll'), 0) as payroll,
        (SELECT COUNT(*) FROM signups WHERE DATE(created_at) = $1) as signup_count`,
      [this.formatDate(ctx.date)]
    );

    const revenue = parseFloat(result?.revenue || '0');
    const expenses = parseFloat(result?.expenses || '0');
    const signupCount = parseInt(result?.signup_count || '0');
    const netProfit = revenue - expenses;

    return {
      revenue,
      expenses,
      netProfit,
      profitMargin: revenue > 0 ? (netProfit / revenue) * 100 : 0,
      avgRevenuePerSignup: signupCount > 0 ? revenue / signupCount : 0,
      payrollCost: parseFloat(result?.payroll || '0'),
    };
  }

  private async calculateQualityMetrics(ctx: MetricCalculationContext): Promise<QualityMetrics> {
    // Calculate data quality based on completeness and accuracy
    const result = await db.queryOne<{
      complete_records: string;
      total_records: string;
      extraction_success: string;
      extraction_total: string;
      api_errors: string;
      api_total: string;
    }>(
      `SELECT 
        COUNT(*) FILTER (WHERE customer_email IS NOT NULL AND customer_phone IS NOT NULL) as complete_records,
        COUNT(*) as total_records,
        COALESCE((SELECT COUNT(*) FILTER (WHERE status = 'completed') FROM extraction_jobs WHERE DATE(created_at) = $1), 0) as extraction_success,
        COALESCE((SELECT COUNT(*) FROM extraction_jobs WHERE DATE(created_at) = $1), 1) as extraction_total,
        0 as api_errors,
        1 as api_total
       FROM signups WHERE DATE(created_at) = $1`,
      [this.formatDate(ctx.date)]
    );

    const totalRecords = parseInt(result?.total_records || '1');
    const completeRecords = parseInt(result?.complete_records || '0');
    const extractionTotal = parseInt(result?.extraction_total || '1');
    const extractionSuccess = parseInt(result?.extraction_success || '0');

    return {
      dataQualityScore: totalRecords > 0 ? (completeRecords / totalRecords) * 100 : 100,
      extractionSuccessRate: extractionTotal > 0 ? (extractionSuccess / extractionTotal) * 100 : 100,
      apiErrorRate: 0, // Would need actual API metrics tracking
    };
  }

  private async calculateRegionMetrics(ctx: MetricCalculationContext): Promise<Record<string, RegionMetrics>> {
    const results = await db.queryMany<{
      region: string;
      signups: string;
      events: string;
      revenue: string;
      active_ambassadors: string;
    }>(
      `SELECT 
        COALESCE(e.state, 'Unknown') as region,
        COUNT(s.id) as signups,
        COUNT(DISTINCT e.id) as events,
        COALESCE(SUM(r.amount), 0) as revenue,
        COUNT(DISTINCT s.ambassador_id) as active_ambassadors
       FROM events e
       LEFT JOIN signups s ON s.event_id = e.id AND DATE(s.created_at) = $1
       LEFT JOIN revenue_records r ON r.event_id = e.id AND r.revenue_date = $1
       WHERE e.event_date = $1
       GROUP BY e.state`,
      [this.formatDate(ctx.date)]
    );

    const regionMap: Record<string, RegionMetrics> = {};
    for (const row of results) {
      regionMap[row.region] = {
        region: row.region,
        signups: parseInt(row.signups),
        events: parseInt(row.events),
        revenue: parseFloat(row.revenue),
        activeAmbassadors: parseInt(row.active_ambassadors),
      };
    }
    return regionMap;
  }

  private async calculateOperatorMetrics(ctx: MetricCalculationContext): Promise<Record<number, OperatorMetrics>> {
    const results = await db.queryMany<{
      operator_id: string;
      operator_name: string;
      signups: string;
      revenue: string;
      validated: string;
    }>(
      `SELECT 
        s.operator_id,
        COALESCE(s.operator_name, o.display_name, 'Unknown') as operator_name,
        COUNT(s.id) as signups,
        COALESCE(SUM(r.amount), 0) as revenue,
        COUNT(s.id) FILTER (WHERE s.validation_status = 'validated') as validated
       FROM signups s
       LEFT JOIN operators o ON o.id = s.operator_id
       LEFT JOIN revenue_records r ON r.signup_id = s.id
       WHERE DATE(s.created_at) = $1
       GROUP BY s.operator_id, s.operator_name, o.display_name`,
      [this.formatDate(ctx.date)]
    );

    const operatorMap: Record<number, OperatorMetrics> = {};
    for (const row of results) {
      const signups = parseInt(row.signups);
      const validated = parseInt(row.validated);
      operatorMap[parseInt(row.operator_id)] = {
        operatorId: parseInt(row.operator_id),
        operatorName: row.operator_name,
        signups,
        revenue: parseFloat(row.revenue),
        validationRate: signups > 0 ? (validated / signups) * 100 : 0,
      };
    }
    return operatorMap;
  }

  private async calculateSkillLevelMetrics(ctx: MetricCalculationContext): Promise<Record<string, SkillLevelMetrics>> {
    const results = await db.queryMany<{
      skill_level: string;
      ambassador_count: string;
      total_signups: string;
    }>(
      `SELECT 
        a.skill_level,
        COUNT(DISTINCT a.id) as ambassador_count,
        COUNT(s.id) as total_signups
       FROM ambassadors a
       LEFT JOIN signups s ON s.ambassador_id = a.id AND DATE(s.created_at) = $1
       WHERE a.status = 'active'
       GROUP BY a.skill_level`,
      [this.formatDate(ctx.date)]
    );

    const skillMap: Record<string, SkillLevelMetrics> = {};
    for (const row of results) {
      const ambassadorCount = parseInt(row.ambassador_count);
      const totalSignups = parseInt(row.total_signups);
      skillMap[row.skill_level] = {
        skillLevel: row.skill_level,
        ambassadorCount,
        totalSignups,
        avgSignups: ambassadorCount > 0 ? totalSignups / ambassadorCount : 0,
      };
    }
    return skillMap;
  }

  private async calculateDetailedMetrics(ctx: MetricCalculationContext): Promise<DetailedMetrics> {
    const [topAmbassadors, topEvents, signupsByHour] = await Promise.all([
      this.getTopAmbassadors(ctx),
      this.getTopEvents(ctx),
      this.getSignupsByHour(ctx),
    ]);

    return {
      topAmbassadors,
      topEvents,
      signupsByHour,
    };
  }

  private async getTopAmbassadors(ctx: MetricCalculationContext): Promise<TopPerformer[]> {
    const results = await db.queryMany<{
      id: string;
      name: string;
      signups: string;
      validated: string;
    }>(
      `SELECT 
        a.id,
        CONCAT(a.first_name, ' ', a.last_name) as name,
        COUNT(s.id) as signups,
        COUNT(s.id) FILTER (WHERE s.validation_status = 'validated') as validated
       FROM ambassadors a
       JOIN signups s ON s.ambassador_id = a.id
       WHERE DATE(s.created_at) = $1
       GROUP BY a.id, a.first_name, a.last_name
       ORDER BY signups DESC
       LIMIT 10`,
      [this.formatDate(ctx.date)]
    );

    return results.map((r) => ({
      id: r.id,
      name: r.name,
      signups: parseInt(r.signups),
      validationRate: parseInt(r.signups) > 0 ? (parseInt(r.validated) / parseInt(r.signups)) * 100 : 0,
    }));
  }

  private async getTopEvents(ctx: MetricCalculationContext): Promise<TopEvent[]> {
    const results = await db.queryMany<{
      id: string;
      title: string;
      signups: string;
      revenue: string;
    }>(
      `SELECT 
        e.id,
        e.title,
        COUNT(s.id) as signups,
        COALESCE(SUM(r.amount), 0) as revenue
       FROM events e
       LEFT JOIN signups s ON s.event_id = e.id AND DATE(s.created_at) = $1
       LEFT JOIN revenue_records r ON r.event_id = e.id AND r.revenue_date = $1
       WHERE e.event_date = $1
       GROUP BY e.id, e.title
       ORDER BY signups DESC
       LIMIT 10`,
      [this.formatDate(ctx.date)]
    );

    return results.map((r) => ({
      id: r.id,
      title: r.title,
      signups: parseInt(r.signups),
      revenue: parseFloat(r.revenue),
    }));
  }

  private async getSignupsByHour(ctx: MetricCalculationContext): Promise<Record<number, number>> {
    const results = await db.queryMany<{ hour: string; count: string }>(
      `SELECT 
        EXTRACT(HOUR FROM created_at) as hour,
        COUNT(*) as count
       FROM signups 
       WHERE DATE(created_at) = $1
       GROUP BY EXTRACT(HOUR FROM created_at)
       ORDER BY hour`,
      [this.formatDate(ctx.date)]
    );

    const hourMap: Record<number, number> = {};
    for (let i = 0; i < 24; i++) hourMap[i] = 0;
    for (const row of results) {
      hourMap[parseInt(row.hour)] = parseInt(row.count);
    }
    return hourMap;
  }

  // ============================================
  // HISTORICAL VALUES
  // ============================================

  private async storeHistoricalValues(
    snapshotDate: string,
    metrics: {
      signupMetrics: SignupMetrics;
      eventMetrics: EventMetrics;
      ambassadorMetrics: AmbassadorMetrics;
      financialMetrics: FinancialMetrics;
      qualityMetrics: QualityMetrics;
    }
  ): Promise<void> {
    const values = [
      { name: 'daily_signups', value: metrics.signupMetrics.total },
      { name: 'validation_rate', value: metrics.signupMetrics.validationRate },
      { name: 'active_events', value: metrics.eventMetrics.active },
      { name: 'active_ambassadors', value: metrics.ambassadorMetrics.active },
      { name: 'avg_signups_per_ambassador', value: metrics.ambassadorMetrics.avgSignups },
      { name: 'monthly_revenue', value: metrics.financialMetrics.revenue },
      { name: 'net_profit_margin', value: metrics.financialMetrics.profitMargin },
      { name: 'data_quality_score', value: metrics.qualityMetrics.dataQualityScore },
    ];

    for (const { name, value } of values) {
      await db.query(
        `INSERT INTO kpi_historical_values (kpi_name, value_date, value)
         VALUES ($1, $2, $3)
         ON CONFLICT (kpi_name, value_date) DO UPDATE SET value = $3`,
        [name, snapshotDate, value]
      );
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private buildCalculationContext(date: Date): MetricCalculationContext {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const previousDay = new Date(date);
    previousDay.setDate(previousDay.getDate() - 1);

    const startOfWeek = new Date(date);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);

    return {
      date,
      startOfDay,
      endOfDay,
      previousDay,
      startOfWeek,
      startOfMonth,
    };
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private async upsertSnapshotStatus(
    snapshotDate: string,
    status: SnapshotStatus,
    startTime: number,
    errorMessage?: string
  ): Promise<void> {
    await db.query(
      `INSERT INTO daily_metrics_snapshots (snapshot_date, snapshot_status, processing_started_at, error_message)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (snapshot_date) DO UPDATE SET 
         snapshot_status = $2,
         processing_started_at = COALESCE(daily_metrics_snapshots.processing_started_at, $3),
         error_message = $4,
         updated_at = NOW()`,
      [snapshotDate, status, new Date(startTime).toISOString(), errorMessage]
    );
  }

  private async upsertSnapshot(data: Partial<DailyMetricsSnapshot> & { snapshotDate: string }): Promise<DailyMetricsSnapshot> {
    const result = await db.queryOne<DailyMetricsSnapshot>(
      `INSERT INTO daily_metrics_snapshots (
        snapshot_date, snapshot_status,
        total_signups, validated_signups, rejected_signups, pending_signups,
        validation_rate, duplicate_rate, avg_signup_processing_time_ms,
        total_events, active_events, completed_events, cancelled_events,
        avg_signups_per_event,
        active_ambassadors, new_ambassadors, checked_in_ambassadors,
        avg_signups_per_ambassador, ambassador_utilization_rate,
        total_revenue, total_expenses, net_profit, profit_margin,
        avg_revenue_per_signup, payroll_cost,
        data_quality_score, extraction_success_rate, api_error_rate,
        metrics_by_region, metrics_by_operator, metrics_by_skill_level,
        detailed_metrics,
        processing_started_at, processing_completed_at, processing_duration_ms
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
        $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35
      )
      ON CONFLICT (snapshot_date) DO UPDATE SET
        snapshot_status = $2,
        total_signups = $3, validated_signups = $4, rejected_signups = $5, pending_signups = $6,
        validation_rate = $7, duplicate_rate = $8, avg_signup_processing_time_ms = $9,
        total_events = $10, active_events = $11, completed_events = $12, cancelled_events = $13,
        avg_signups_per_event = $14,
        active_ambassadors = $15, new_ambassadors = $16, checked_in_ambassadors = $17,
        avg_signups_per_ambassador = $18, ambassador_utilization_rate = $19,
        total_revenue = $20, total_expenses = $21, net_profit = $22, profit_margin = $23,
        avg_revenue_per_signup = $24, payroll_cost = $25,
        data_quality_score = $26, extraction_success_rate = $27, api_error_rate = $28,
        metrics_by_region = $29, metrics_by_operator = $30, metrics_by_skill_level = $31,
        detailed_metrics = $32,
        processing_completed_at = $34, processing_duration_ms = $35,
        updated_at = NOW()
      RETURNING *`,
      [
        data.snapshotDate,
        data.snapshotStatus || 'completed',
        data.totalSignups || 0,
        data.validatedSignups || 0,
        data.rejectedSignups || 0,
        data.pendingSignups || 0,
        data.validationRate || 0,
        data.duplicateRate || 0,
        data.avgSignupProcessingTimeMs || 0,
        data.totalEvents || 0,
        data.activeEvents || 0,
        data.completedEvents || 0,
        data.cancelledEvents || 0,
        data.avgSignupsPerEvent || 0,
        data.activeAmbassadors || 0,
        data.newAmbassadors || 0,
        data.checkedInAmbassadors || 0,
        data.avgSignupsPerAmbassador || 0,
        data.ambassadorUtilizationRate || 0,
        data.totalRevenue || 0,
        data.totalExpenses || 0,
        data.netProfit || 0,
        data.profitMargin || 0,
        data.avgRevenuePerSignup || 0,
        data.payrollCost || 0,
        data.dataQualityScore || 0,
        data.extractionSuccessRate || 0,
        data.apiErrorRate || 0,
        JSON.stringify(data.metricsByRegion || {}),
        JSON.stringify(data.metricsByOperator || {}),
        JSON.stringify(data.metricsBySkillLevel || {}),
        JSON.stringify(data.detailedMetrics || {}),
        data.processingStartedAt?.toISOString(),
        data.processingCompletedAt?.toISOString(),
        data.processingDurationMs || 0,
      ]
    );

    return this.mapSnapshotFromDb(result!);
  }

  private flattenSignupMetrics(metrics: SignupMetrics) {
    return {
      totalSignups: metrics.total,
      validatedSignups: metrics.validated,
      rejectedSignups: metrics.rejected,
      pendingSignups: metrics.pending,
      validationRate: metrics.validationRate,
      duplicateRate: metrics.duplicateRate,
      avgSignupProcessingTimeMs: metrics.avgProcessingTimeMs,
    };
  }

  private flattenEventMetrics(metrics: EventMetrics) {
    return {
      totalEvents: metrics.total,
      activeEvents: metrics.active,
      completedEvents: metrics.completed,
      cancelledEvents: metrics.cancelled,
      avgSignupsPerEvent: metrics.avgSignupsPerEvent,
    };
  }

  private flattenAmbassadorMetrics(metrics: AmbassadorMetrics) {
    return {
      activeAmbassadors: metrics.active,
      newAmbassadors: metrics.new,
      checkedInAmbassadors: metrics.checkedIn,
      avgSignupsPerAmbassador: metrics.avgSignups,
      ambassadorUtilizationRate: metrics.utilizationRate,
    };
  }

  private flattenFinancialMetrics(metrics: FinancialMetrics) {
    return {
      totalRevenue: metrics.revenue,
      totalExpenses: metrics.expenses,
      netProfit: metrics.netProfit,
      profitMargin: metrics.profitMargin,
      avgRevenuePerSignup: metrics.avgRevenuePerSignup,
      payrollCost: metrics.payrollCost,
    };
  }

  private flattenQualityMetrics(metrics: QualityMetrics) {
    return {
      dataQualityScore: metrics.dataQualityScore,
      extractionSuccessRate: metrics.extractionSuccessRate,
      apiErrorRate: metrics.apiErrorRate,
    };
  }

  private mapSnapshotFromDb(row: any): DailyMetricsSnapshot {
    return {
      id: row.id,
      snapshotDate: row.snapshot_date,
      snapshotStatus: row.snapshot_status,
      totalSignups: parseInt(row.total_signups || '0'),
      validatedSignups: parseInt(row.validated_signups || '0'),
      rejectedSignups: parseInt(row.rejected_signups || '0'),
      pendingSignups: parseInt(row.pending_signups || '0'),
      validationRate: parseFloat(row.validation_rate || '0'),
      duplicateRate: parseFloat(row.duplicate_rate || '0'),
      avgSignupProcessingTimeMs: parseInt(row.avg_signup_processing_time_ms || '0'),
      totalEvents: parseInt(row.total_events || '0'),
      activeEvents: parseInt(row.active_events || '0'),
      completedEvents: parseInt(row.completed_events || '0'),
      cancelledEvents: parseInt(row.cancelled_events || '0'),
      avgSignupsPerEvent: parseFloat(row.avg_signups_per_event || '0'),
      topPerformingEventId: row.top_performing_event_id,
      activeAmbassadors: parseInt(row.active_ambassadors || '0'),
      newAmbassadors: parseInt(row.new_ambassadors || '0'),
      checkedInAmbassadors: parseInt(row.checked_in_ambassadors || '0'),
      avgSignupsPerAmbassador: parseFloat(row.avg_signups_per_ambassador || '0'),
      topPerformerId: row.top_performer_id,
      ambassadorUtilizationRate: parseFloat(row.ambassador_utilization_rate || '0'),
      totalRevenue: parseFloat(row.total_revenue || '0'),
      totalExpenses: parseFloat(row.total_expenses || '0'),
      netProfit: parseFloat(row.net_profit || '0'),
      profitMargin: parseFloat(row.profit_margin || '0'),
      avgRevenuePerSignup: parseFloat(row.avg_revenue_per_signup || '0'),
      payrollCost: parseFloat(row.payroll_cost || '0'),
      dataQualityScore: parseFloat(row.data_quality_score || '0'),
      extractionSuccessRate: parseFloat(row.extraction_success_rate || '0'),
      apiErrorRate: parseFloat(row.api_error_rate || '0'),
      portalActiveUsers: parseInt(row.portal_active_users || '0'),
      apiRequestsCount: parseInt(row.api_requests_count || '0'),
      avgResponseTimeMs: parseInt(row.avg_response_time_ms || '0'),
      metricsByRegion: typeof row.metrics_by_region === 'string' 
        ? JSON.parse(row.metrics_by_region) 
        : row.metrics_by_region || {},
      metricsByOperator: typeof row.metrics_by_operator === 'string'
        ? JSON.parse(row.metrics_by_operator)
        : row.metrics_by_operator || {},
      metricsBySkillLevel: typeof row.metrics_by_skill_level === 'string'
        ? JSON.parse(row.metrics_by_skill_level)
        : row.metrics_by_skill_level || {},
      detailedMetrics: typeof row.detailed_metrics === 'string'
        ? JSON.parse(row.detailed_metrics)
        : row.detailed_metrics || {},
      processingStartedAt: row.processing_started_at ? new Date(row.processing_started_at) : undefined,
      processingCompletedAt: row.processing_completed_at ? new Date(row.processing_completed_at) : undefined,
      processingDurationMs: row.processing_duration_ms ? parseInt(row.processing_duration_ms) : undefined,
      errorMessage: row.error_message,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private calculateChanges(current: DailyMetricsSnapshot, previous: DailyMetricsSnapshot) {
    const change = (curr: number, prev: number) => ({
      current: curr,
      previous: prev,
      absoluteChange: curr - prev,
      percentChange: prev !== 0 ? ((curr - prev) / prev) * 100 : 0,
      trend: curr > prev ? 'up' as const : curr < prev ? 'down' as const : 'stable' as const,
    });

    return {
      signups: change(current.totalSignups, previous.totalSignups),
      revenue: change(current.totalRevenue, previous.totalRevenue),
      validationRate: change(current.validationRate, previous.validationRate),
      activeAmbassadors: change(current.activeAmbassadors, previous.activeAmbassadors),
      activeEvents: change(current.activeEvents, previous.activeEvents),
    };
  }
}

export const snapshotService = new SnapshotService();
