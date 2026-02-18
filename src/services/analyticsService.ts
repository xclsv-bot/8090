/**
 * Analytics Service
 * WO-14, WO-15, WO-16, WO-17, WO-18: Analytics & Reporting
 * WO-51: Performance Dashboard API
 */

import { db } from './database.js';
import { logger } from '../utils/logger.js';

interface AnalyticsSnapshot {
  id: string;
  snapshotType: string;
  snapshotDate: Date;
  data: Record<string, unknown>;
}

interface KPI {
  id: string;
  name: string;
  category: string;
  targetValue: number;
  currentValue: number;
  unit: string;
  trend: 'up' | 'down' | 'stable';
}

interface DashboardWidget {
  id: string;
  name: string;
  widgetType: string;
  config: Record<string, unknown>;
  position: number;
}

class AnalyticsService {
  // ============================================
  // SNAPSHOTS
  // ============================================

  /**
   * Create daily analytics snapshot
   */
  async createDailySnapshot(): Promise<AnalyticsSnapshot> {
    const today = new Date().toISOString().split('T')[0];

    // Gather all metrics
    const [signupMetrics, eventMetrics, ambassadorMetrics, financialMetrics] = await Promise.all([
      this.getSignupMetricsForDate(today),
      this.getEventMetricsForDate(today),
      this.getAmbassadorMetricsForDate(today),
      this.getFinancialMetricsForDate(today),
    ]);

    const data = {
      signups: signupMetrics,
      events: eventMetrics,
      ambassadors: ambassadorMetrics,
      financials: financialMetrics,
      generatedAt: new Date().toISOString(),
    };

    const result = await db.queryOne<AnalyticsSnapshot>(
      `INSERT INTO analytics_snapshots (snapshot_type, snapshot_date, data)
       VALUES ('daily', $1, $2)
       ON CONFLICT (snapshot_type, snapshot_date) 
       DO UPDATE SET data = $2, updated_at = NOW()
       RETURNING *`,
      [today, JSON.stringify(data)]
    );

    logger.info({ snapshotDate: today }, 'Daily analytics snapshot created');
    return result!;
  }

  private async getSignupMetricsForDate(date: string): Promise<Record<string, number>> {
    const result = await db.queryOne<{
      total: string;
      validated: string;
      rejected: string;
      pending: string;
    }>(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE validation_status = 'validated') as validated,
        COUNT(*) FILTER (WHERE validation_status = 'rejected') as rejected,
        COUNT(*) FILTER (WHERE validation_status = 'pending') as pending
       FROM signups WHERE DATE(created_at) = $1`,
      [date]
    );

    return {
      total: parseInt(result?.total || '0'),
      validated: parseInt(result?.validated || '0'),
      rejected: parseInt(result?.rejected || '0'),
      pending: parseInt(result?.pending || '0'),
    };
  }

  private async getEventMetricsForDate(date: string): Promise<Record<string, number>> {
    const result = await db.queryOne<{
      active: string;
      completed: string;
      signups: string;
    }>(
      `SELECT 
        COUNT(*) FILTER (WHERE status = 'active' AND event_date = $1) as active,
        COUNT(*) FILTER (WHERE status = 'completed' AND DATE(completed_at) = $1) as completed,
        (SELECT COUNT(*) FROM signups WHERE DATE(created_at) = $1 AND event_id IS NOT NULL) as signups
       FROM events`,
      [date]
    );

    return {
      active: parseInt(result?.active || '0'),
      completed: parseInt(result?.completed || '0'),
      signups: parseInt(result?.signups || '0'),
    };
  }

  private async getAmbassadorMetricsForDate(date: string): Promise<Record<string, number>> {
    const result = await db.queryOne<{
      active_today: string;
      checked_in: string;
      avg_signups: string;
    }>(
      `SELECT 
        COUNT(DISTINCT ea.ambassador_id) as active_today,
        COUNT(DISTINCT ea.ambassador_id) FILTER (WHERE ea.check_in_time IS NOT NULL) as checked_in,
        AVG(s.signup_count) as avg_signups
       FROM event_assignments ea
       JOIN events e ON e.id = ea.event_id
       LEFT JOIN (
         SELECT ambassador_id, COUNT(*) as signup_count
         FROM signups WHERE DATE(created_at) = $1
         GROUP BY ambassador_id
       ) s ON s.ambassador_id = ea.ambassador_id
       WHERE e.event_date = $1`,
      [date]
    );

    return {
      activeToday: parseInt(result?.active_today || '0'),
      checkedIn: parseInt(result?.checked_in || '0'),
      avgSignups: parseFloat(result?.avg_signups || '0'),
    };
  }

  private async getFinancialMetricsForDate(date: string): Promise<Record<string, number>> {
    const result = await db.queryOne<{
      revenue: string;
      expenses: string;
    }>(
      `SELECT 
        COALESCE((SELECT SUM(amount) FROM revenue_tracking WHERE DATE(revenue_date) = $1), 0) as revenue,
        COALESCE((SELECT SUM(amount) FROM expenses WHERE DATE(expense_date) = $1), 0) as expenses`,
      [date]
    );

    return {
      revenue: parseFloat(result?.revenue || '0'),
      expenses: parseFloat(result?.expenses || '0'),
    };
  }

  /**
   * Get historical snapshots
   */
  async getSnapshots(
    snapshotType: string,
    fromDate: string,
    toDate: string
  ): Promise<AnalyticsSnapshot[]> {
    return db.queryMany<AnalyticsSnapshot>(
      `SELECT * FROM analytics_snapshots
       WHERE snapshot_type = $1 AND snapshot_date BETWEEN $2 AND $3
       ORDER BY snapshot_date DESC`,
      [snapshotType, fromDate, toDate]
    );
  }

  // ============================================
  // EVENT PERFORMANCE DASHBOARD (WO-15)
  // ============================================

  /**
   * Get event performance metrics
   */
  async getEventPerformance(fromDate: string, toDate: string): Promise<{
    summary: Record<string, number>;
    byRegion: { region: string; events: number; signups: number; revenue: number }[];
    byType: { type: string; events: number; avgSignups: number }[];
    topEvents: { id: string; title: string; signups: number; revenue: number; roi: number }[];
    trend: { date: string; events: number; signups: number }[];
  }> {
    const [summary, byRegion, byType, topEvents, trend] = await Promise.all([
      db.queryOne<{ events: string; signups: string; revenue: string; avg_signups: string }>(
        `SELECT 
          COUNT(DISTINCT e.id) as events,
          COUNT(s.id) as signups,
          COALESCE(SUM(r.amount), 0) as revenue,
          AVG(signup_count) as avg_signups
         FROM events e
         LEFT JOIN signups s ON s.event_id = e.id
         LEFT JOIN revenue_tracking r ON r.event_id = e.id
         LEFT JOIN (
           SELECT event_id, COUNT(*) as signup_count FROM signups GROUP BY event_id
         ) sc ON sc.event_id = e.id
         WHERE e.event_date BETWEEN $1 AND $2`,
        [fromDate, toDate]
      ),
      db.queryMany(
        `SELECT e.region, COUNT(DISTINCT e.id) as events, COUNT(s.id) as signups, COALESCE(SUM(r.amount), 0) as revenue
         FROM events e
         LEFT JOIN signups s ON s.event_id = e.id
         LEFT JOIN revenue_tracking r ON r.event_id = e.id
         WHERE e.event_date BETWEEN $1 AND $2
         GROUP BY e.region
         ORDER BY signups DESC`,
        [fromDate, toDate]
      ),
      db.queryMany(
        `SELECT e.event_type as type, COUNT(DISTINCT e.id) as events, AVG(signup_count) as avg_signups
         FROM events e
         LEFT JOIN (SELECT event_id, COUNT(*) as signup_count FROM signups GROUP BY event_id) s ON s.event_id = e.id
         WHERE e.event_date BETWEEN $1 AND $2
         GROUP BY e.event_type`,
        [fromDate, toDate]
      ),
      db.queryMany(
        `SELECT e.id, e.title, COUNT(s.id) as signups, COALESCE(SUM(r.amount), 0) as revenue,
                CASE WHEN SUM(exp.amount) > 0 THEN ((COALESCE(SUM(r.amount), 0) - SUM(exp.amount)) / SUM(exp.amount) * 100) ELSE 0 END as roi
         FROM events e
         LEFT JOIN signups s ON s.event_id = e.id
         LEFT JOIN revenue_tracking r ON r.event_id = e.id
         LEFT JOIN expenses exp ON exp.event_id = e.id
         WHERE e.event_date BETWEEN $1 AND $2
         GROUP BY e.id, e.title
         ORDER BY signups DESC LIMIT 10`,
        [fromDate, toDate]
      ),
      db.queryMany(
        `SELECT DATE(e.event_date) as date, COUNT(DISTINCT e.id) as events, COUNT(s.id) as signups
         FROM events e
         LEFT JOIN signups s ON s.event_id = e.id
         WHERE e.event_date BETWEEN $1 AND $2
         GROUP BY DATE(e.event_date)
         ORDER BY date`,
        [fromDate, toDate]
      ),
    ]);

    return {
      summary: {
        events: parseInt(summary?.events || '0'),
        signups: parseInt(summary?.signups || '0'),
        revenue: parseFloat(summary?.revenue || '0'),
        avgSignups: parseFloat(summary?.avg_signups || '0'),
      },
      byRegion: byRegion as any,
      byType: byType as any,
      topEvents: topEvents as any,
      trend: trend as any,
    };
  }

  // ============================================
  // AMBASSADOR PRODUCTIVITY DASHBOARD (WO-16)
  // ============================================

  /**
   * Get ambassador productivity metrics
   */
  async getAmbassadorProductivity(fromDate: string, toDate: string): Promise<{
    summary: Record<string, number>;
    topPerformers: { id: string; name: string; signups: number; validationRate: number; earnings: number }[];
    bySkillLevel: { level: string; count: number; avgSignups: number }[];
    trend: { date: string; activeAmbassadors: number; totalSignups: number }[];
  }> {
    const [summary, topPerformers, bySkillLevel, trend] = await Promise.all([
      db.queryOne<{ active: string; avg_signups: string; total_signups: string; avg_validation: string }>(
        `SELECT 
          COUNT(DISTINCT s.ambassador_id) as active,
          AVG(signup_count) as avg_signups,
          SUM(signup_count) as total_signups,
          AVG(validation_rate) as avg_validation
         FROM (
           SELECT ambassador_id, COUNT(*) as signup_count,
                  COUNT(*) FILTER (WHERE validation_status = 'validated')::float / NULLIF(COUNT(*), 0) * 100 as validation_rate
           FROM signups WHERE created_at BETWEEN $1 AND $2
           GROUP BY ambassador_id
         ) s`,
        [fromDate, toDate]
      ),
      db.queryMany(
        `SELECT a.id, CONCAT(a.first_name, ' ', a.last_name) as name,
                COUNT(s.id) as signups,
                COUNT(s.id) FILTER (WHERE s.validation_status = 'validated')::float / NULLIF(COUNT(s.id), 0) * 100 as validation_rate,
                COALESCE(SUM(ps.total_amount), 0) as earnings
         FROM ambassadors a
         LEFT JOIN signups s ON s.ambassador_id = a.id AND s.created_at BETWEEN $1 AND $2
         LEFT JOIN pay_statements ps ON ps.ambassador_id = a.id
         WHERE a.status = 'active'
         GROUP BY a.id, a.first_name, a.last_name
         ORDER BY signups DESC LIMIT 10`,
        [fromDate, toDate]
      ),
      db.queryMany(
        `SELECT a.skill_level as level, COUNT(DISTINCT a.id) as count, AVG(signup_count) as avg_signups
         FROM ambassadors a
         LEFT JOIN (
           SELECT ambassador_id, COUNT(*) as signup_count FROM signups 
           WHERE created_at BETWEEN $1 AND $2 GROUP BY ambassador_id
         ) s ON s.ambassador_id = a.id
         WHERE a.status = 'active'
         GROUP BY a.skill_level`,
        [fromDate, toDate]
      ),
      db.queryMany(
        `SELECT DATE(created_at) as date, COUNT(DISTINCT ambassador_id) as active_ambassadors, COUNT(*) as total_signups
         FROM signups WHERE created_at BETWEEN $1 AND $2
         GROUP BY DATE(created_at)
         ORDER BY date`,
        [fromDate, toDate]
      ),
    ]);

    return {
      summary: {
        activeAmbassadors: parseInt(summary?.active || '0'),
        avgSignupsPerAmbassador: parseFloat(summary?.avg_signups || '0'),
        totalSignups: parseInt(summary?.total_signups || '0'),
        avgValidationRate: parseFloat(summary?.avg_validation || '0'),
      },
      topPerformers: topPerformers as any,
      bySkillLevel: bySkillLevel as any,
      trend: trend as any,
    };
  }

  // ============================================
  // FINANCIAL DASHBOARD (WO-17)
  // ============================================

  /**
   * Get financial performance metrics
   */
  async getFinancialPerformance(fromDate: string, toDate: string): Promise<{
    summary: { revenue: number; expenses: number; netIncome: number; margin: number };
    revenueByOperator: { operatorId: number; name: string; amount: number }[];
    expensesByCategory: { category: string; amount: number; budgeted: number }[];
    monthlyTrend: { month: string; revenue: number; expenses: number; profit: number }[];
  }> {
    const [summary, revenueByOperator, expensesByCategory, monthlyTrend] = await Promise.all([
      db.queryOne<{ revenue: string; expenses: string }>(
        `SELECT 
          COALESCE((SELECT SUM(amount) FROM revenue_tracking WHERE revenue_date BETWEEN $1 AND $2), 0) as revenue,
          COALESCE((SELECT SUM(amount) FROM expenses WHERE expense_date BETWEEN $1 AND $2), 0) as expenses`,
        [fromDate, toDate]
      ),
      db.queryMany(
        `SELECT r.operator_id, o.display_name as name, SUM(r.amount) as amount
         FROM revenue_tracking r
         JOIN operators o ON o.id = r.operator_id
         WHERE r.revenue_date BETWEEN $1 AND $2
         GROUP BY r.operator_id, o.display_name
         ORDER BY amount DESC`,
        [fromDate, toDate]
      ),
      db.queryMany(
        `SELECT e.category, SUM(e.amount) as amount, COALESCE(b.budgeted_amount, 0) as budgeted
         FROM expenses e
         LEFT JOIN budgets b ON b.category = e.category
         WHERE e.expense_date BETWEEN $1 AND $2
         GROUP BY e.category, b.budgeted_amount
         ORDER BY amount DESC`,
        [fromDate, toDate]
      ),
      db.queryMany(
        `SELECT TO_CHAR(d.month, 'YYYY-MM') as month,
                COALESCE(r.amount, 0) as revenue,
                COALESCE(e.amount, 0) as expenses,
                COALESCE(r.amount, 0) - COALESCE(e.amount, 0) as profit
         FROM generate_series($1::date, $2::date, '1 month') d(month)
         LEFT JOIN (SELECT DATE_TRUNC('month', revenue_date) as month, SUM(amount) as amount FROM revenue_tracking GROUP BY 1) r ON r.month = d.month
         LEFT JOIN (SELECT DATE_TRUNC('month', expense_date) as month, SUM(amount) as amount FROM expenses GROUP BY 1) e ON e.month = d.month
         ORDER BY d.month`,
        [fromDate, toDate]
      ),
    ]);

    const revenue = parseFloat(summary?.revenue || '0');
    const expenses = parseFloat(summary?.expenses || '0');

    return {
      summary: {
        revenue,
        expenses,
        netIncome: revenue - expenses,
        margin: revenue > 0 ? ((revenue - expenses) / revenue) * 100 : 0,
      },
      revenueByOperator: revenueByOperator as any,
      expensesByCategory: expensesByCategory as any,
      monthlyTrend: monthlyTrend as any,
    };
  }

  // ============================================
  // KPI MANAGEMENT (WO-18)
  // ============================================

  /**
   * Get all KPIs with current values
   */
  async getKPIs(): Promise<KPI[]> {
    const kpis = await db.queryMany<KPI>(
      `SELECT * FROM kpis WHERE is_active = true ORDER BY category, name`
    );

    // Calculate current values for each KPI
    for (const kpi of kpis) {
      kpi.currentValue = await this.calculateKPIValue(kpi.name);
      kpi.trend = await this.calculateKPITrend(kpi.name);
    }

    return kpis;
  }

  private async calculateKPIValue(kpiName: string): Promise<number> {
    switch (kpiName) {
      case 'monthly_signups':
        const signups = await db.queryOne<{ count: string }>(
          `SELECT COUNT(*) as count FROM signups WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)`
        );
        return parseInt(signups?.count || '0');

      case 'validation_rate':
        const validation = await db.queryOne<{ rate: string }>(
          `SELECT COUNT(*) FILTER (WHERE validation_status = 'validated')::float / NULLIF(COUNT(*), 0) * 100 as rate
           FROM signups WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)`
        );
        return parseFloat(validation?.rate || '0');

      case 'monthly_revenue':
        const revenue = await db.queryOne<{ sum: string }>(
          `SELECT SUM(amount) as sum FROM revenue_tracking WHERE revenue_date >= DATE_TRUNC('month', CURRENT_DATE)`
        );
        return parseFloat(revenue?.sum || '0');

      default:
        return 0;
    }
  }

  private async calculateKPITrend(kpiName: string): Promise<'up' | 'down' | 'stable'> {
    // Compare current month to last month
    // Simplified - would need proper implementation
    return 'stable';
  }

  /**
   * Set KPI target
   */
  async setKPITarget(kpiName: string, targetValue: number): Promise<void> {
    await db.query(
      `UPDATE kpis SET target_value = $1, updated_at = NOW() WHERE name = $2`,
      [targetValue, kpiName]
    );
  }

  /**
   * Export report data
   */
  async exportReport(reportType: string, fromDate: string, toDate: string, format: 'csv' | 'json'): Promise<string> {
    let data: unknown;

    switch (reportType) {
      case 'event_performance':
        data = await this.getEventPerformance(fromDate, toDate);
        break;
      case 'ambassador_productivity':
        data = await this.getAmbassadorProductivity(fromDate, toDate);
        break;
      case 'financial':
        data = await this.getFinancialPerformance(fromDate, toDate);
        break;
      default:
        throw new Error(`Unknown report type: ${reportType}`);
    }

    if (format === 'json') {
      return JSON.stringify(data, null, 2);
    }

    // CSV export would be more complex - simplified here
    return JSON.stringify(data);
  }
}

export const analyticsService = new AnalyticsService();
