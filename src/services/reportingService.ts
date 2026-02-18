/**
 * Reporting Service
 * WO-4, WO-24: Portal reporting, audit, and validation data management
 */

import { db } from './database.js';
import { logger } from '../utils/logger.js';

interface AuditLogEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  userId?: string;
  changes?: Record<string, unknown>;
  createdAt: Date;
}

interface DashboardMetrics {
  signups: { today: number; thisWeek: number; thisMonth: number };
  revenue: { thisMonth: number; lastMonth: number; growth: number };
  events: { upcoming: number; active: number; completed: number };
  ambassadors: { active: number; avgSignups: number };
}

class ReportingService {
  /**
   * Get dashboard metrics
   */
  async getDashboardMetrics(): Promise<DashboardMetrics> {
    const [signups, revenue, events, ambassadors] = await Promise.all([
      this.getSignupMetrics(),
      this.getRevenueMetrics(),
      this.getEventMetrics(),
      this.getAmbassadorMetrics(),
    ]);

    return { signups, revenue, events, ambassadors };
  }

  private async getSignupMetrics(): Promise<{ today: number; thisWeek: number; thisMonth: number }> {
    const result = await db.queryOne<{ today: string; week: string; month: string }>(
      `SELECT 
        COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) as today,
        COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('week', CURRENT_DATE)) as week,
        COUNT(*) FILTER (WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)) as month
       FROM signups`
    );

    return {
      today: parseInt(result?.today || '0'),
      thisWeek: parseInt(result?.week || '0'),
      thisMonth: parseInt(result?.month || '0'),
    };
  }

  private async getRevenueMetrics(): Promise<{ thisMonth: number; lastMonth: number; growth: number }> {
    const result = await db.queryOne<{ this_month: string; last_month: string }>(
      `SELECT 
        COALESCE(SUM(amount) FILTER (WHERE revenue_date >= DATE_TRUNC('month', CURRENT_DATE)), 0) as this_month,
        COALESCE(SUM(amount) FILTER (WHERE revenue_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month') 
          AND revenue_date < DATE_TRUNC('month', CURRENT_DATE)), 0) as last_month
       FROM revenue_tracking`
    );

    const thisMonth = parseFloat(result?.this_month || '0');
    const lastMonth = parseFloat(result?.last_month || '0');
    const growth = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : 0;

    return { thisMonth, lastMonth, growth };
  }

  private async getEventMetrics(): Promise<{ upcoming: number; active: number; completed: number }> {
    const result = await db.queryOne<{ upcoming: string; active: string; completed: string }>(
      `SELECT 
        COUNT(*) FILTER (WHERE status IN ('planned', 'confirmed') AND event_date >= CURRENT_DATE) as upcoming,
        COUNT(*) FILTER (WHERE status = 'active') as active,
        COUNT(*) FILTER (WHERE status = 'completed' AND completed_at >= DATE_TRUNC('month', CURRENT_DATE)) as completed
       FROM events`
    );

    return {
      upcoming: parseInt(result?.upcoming || '0'),
      active: parseInt(result?.active || '0'),
      completed: parseInt(result?.completed || '0'),
    };
  }

  private async getAmbassadorMetrics(): Promise<{ active: number; avgSignups: number }> {
    const result = await db.queryOne<{ active: string; avg_signups: string }>(
      `SELECT 
        COUNT(*) FILTER (WHERE status = 'active') as active,
        AVG(signup_count) as avg_signups
       FROM ambassadors a
       LEFT JOIN (
         SELECT ambassador_id, COUNT(*) as signup_count
         FROM signups
         WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE)
         GROUP BY ambassador_id
       ) s ON s.ambassador_id = a.id`
    );

    return {
      active: parseInt(result?.active || '0'),
      avgSignups: parseFloat(result?.avg_signups || '0'),
    };
  }

  /**
   * Get validation report
   */
  async getValidationReport(fromDate: string, toDate: string): Promise<{
    total: number;
    pending: number;
    validated: number;
    rejected: number;
    duplicates: number;
    validationRate: number;
    avgValidationTime: number;
  }> {
    const result = await db.queryOne<{
      total: string;
      pending: string;
      validated: string;
      rejected: string;
      duplicates: string;
      avg_time: string;
    }>(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE validation_status = 'pending') as pending,
        COUNT(*) FILTER (WHERE validation_status = 'validated') as validated,
        COUNT(*) FILTER (WHERE validation_status = 'rejected') as rejected,
        COUNT(*) FILTER (WHERE validation_status = 'duplicate') as duplicates,
        AVG(EXTRACT(EPOCH FROM (validated_at - created_at))) FILTER (WHERE validated_at IS NOT NULL) as avg_time
       FROM signups
       WHERE created_at BETWEEN $1 AND $2`,
      [fromDate, toDate]
    );

    const total = parseInt(result?.total || '0');
    const validated = parseInt(result?.validated || '0');

    return {
      total,
      pending: parseInt(result?.pending || '0'),
      validated,
      rejected: parseInt(result?.rejected || '0'),
      duplicates: parseInt(result?.duplicates || '0'),
      validationRate: total > 0 ? (validated / total) * 100 : 0,
      avgValidationTime: parseFloat(result?.avg_time || '0') / 3600, // Convert to hours
    };
  }

  /**
   * Get ambassador leaderboard
   */
  async getAmbassadorLeaderboard(
    fromDate: string,
    toDate: string,
    limit = 20
  ): Promise<{
    rank: number;
    ambassadorId: string;
    name: string;
    signups: number;
    validatedSignups: number;
    validationRate: number;
    earnings: number;
  }[]> {
    const results = await db.queryMany<{
      ambassador_id: string;
      first_name: string;
      last_name: string;
      signups: string;
      validated: string;
      earnings: string;
    }>(
      `SELECT 
        a.id as ambassador_id,
        a.first_name,
        a.last_name,
        COUNT(s.id) as signups,
        COUNT(s.id) FILTER (WHERE s.validation_status = 'validated') as validated,
        COALESCE(SUM(ps.total_amount), 0) as earnings
       FROM ambassadors a
       LEFT JOIN signups s ON s.ambassador_id = a.id AND s.created_at BETWEEN $1 AND $2
       LEFT JOIN pay_statements ps ON ps.ambassador_id = a.id
       WHERE a.status = 'active'
       GROUP BY a.id, a.first_name, a.last_name
       ORDER BY signups DESC
       LIMIT $3`,
      [fromDate, toDate, limit]
    );

    return results.map((r, i) => {
      const signups = parseInt(r.signups);
      const validated = parseInt(r.validated);
      return {
        rank: i + 1,
        ambassadorId: r.ambassador_id,
        name: `${r.first_name} ${r.last_name}`,
        signups,
        validatedSignups: validated,
        validationRate: signups > 0 ? (validated / signups) * 100 : 0,
        earnings: parseFloat(r.earnings),
      };
    });
  }

  /**
   * Get operator performance report
   */
  async getOperatorReport(fromDate: string, toDate: string): Promise<{
    operatorId: number;
    name: string;
    signups: number;
    validatedSignups: number;
    revenue: number;
    avgCpa: number;
  }[]> {
    return db.queryMany(
      `SELECT 
        o.id as operator_id,
        o.display_name as name,
        COUNT(s.id) as signups,
        COUNT(s.id) FILTER (WHERE s.validation_status = 'validated') as validated_signups,
        COALESCE(SUM(r.amount), 0) as revenue,
        AVG(cr.cpa_amount) as avg_cpa
       FROM operators o
       LEFT JOIN signups s ON s.operator_id = o.id AND s.created_at BETWEEN $1 AND $2
       LEFT JOIN revenue_tracking r ON r.operator_id = o.id AND r.revenue_date BETWEEN $1 AND $2
       LEFT JOIN cpa_rates cr ON cr.operator_id = o.id AND cr.is_active = true
       GROUP BY o.id, o.display_name
       ORDER BY signups DESC`,
      [fromDate, toDate]
    );
  }

  /**
   * Get event performance report
   */
  async getEventReport(fromDate: string, toDate: string): Promise<{
    eventId: string;
    title: string;
    date: Date;
    signups: number;
    ambassadors: number;
    expenses: number;
    revenue: number;
    roi: number;
  }[]> {
    return db.queryMany(
      `SELECT 
        e.id as event_id,
        e.title,
        e.event_date as date,
        COUNT(DISTINCT s.id) as signups,
        COUNT(DISTINCT ea.ambassador_id) as ambassadors,
        COALESCE(SUM(exp.amount), 0) as expenses,
        COALESCE(SUM(r.amount), 0) as revenue,
        CASE WHEN SUM(exp.amount) > 0 
          THEN ((COALESCE(SUM(r.amount), 0) - COALESCE(SUM(exp.amount), 0)) / SUM(exp.amount)) * 100
          ELSE 0 END as roi
       FROM events e
       LEFT JOIN signups s ON s.event_id = e.id
       LEFT JOIN event_assignments ea ON ea.event_id = e.id
       LEFT JOIN expenses exp ON exp.event_id = e.id
       LEFT JOIN revenue_tracking r ON r.event_id = e.id
       WHERE e.event_date BETWEEN $1 AND $2
       GROUP BY e.id, e.title, e.event_date
       ORDER BY e.event_date DESC`,
      [fromDate, toDate]
    );
  }

  /**
   * Log audit entry
   */
  async logAudit(
    entityType: string,
    entityId: string,
    action: string,
    userId?: string,
    changes?: Record<string, unknown>
  ): Promise<void> {
    await db.query(
      `INSERT INTO audit_logs (entity_type, entity_id, action, user_id, changes)
       VALUES ($1, $2, $3, $4, $5)`,
      [entityType, entityId, action, userId, changes ? JSON.stringify(changes) : null]
    );
  }

  /**
   * Get audit log
   */
  async getAuditLog(filters: {
    entityType?: string;
    entityId?: string;
    userId?: string;
    fromDate?: string;
    toDate?: string;
  }, limit = 100): Promise<AuditLogEntry[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filters.entityType) {
      conditions.push(`entity_type = $${paramIndex++}`);
      values.push(filters.entityType);
    }
    if (filters.entityId) {
      conditions.push(`entity_id = $${paramIndex++}`);
      values.push(filters.entityId);
    }
    if (filters.userId) {
      conditions.push(`user_id = $${paramIndex++}`);
      values.push(filters.userId);
    }
    if (filters.fromDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      values.push(filters.fromDate);
    }
    if (filters.toDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      values.push(filters.toDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    return db.queryMany<AuditLogEntry>(
      `SELECT * FROM audit_logs ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex}`,
      [...values, limit]
    );
  }

  /**
   * Export report data as CSV
   */
  async exportToCsv(reportType: string, fromDate: string, toDate: string): Promise<string> {
    let data: unknown[];
    let headers: string[];

    switch (reportType) {
      case 'signups':
        data = await db.queryMany(
          `SELECT 
            s.id, s.created_at, s.customer_first_name, s.customer_last_name,
            s.customer_email, s.customer_state, s.validation_status,
            a.first_name || ' ' || a.last_name as ambassador_name,
            o.display_name as operator_name
           FROM signups s
           LEFT JOIN ambassadors a ON a.id = s.ambassador_id
           LEFT JOIN operators o ON o.id = s.operator_id
           WHERE s.created_at BETWEEN $1 AND $2
           ORDER BY s.created_at DESC`,
          [fromDate, toDate]
        );
        headers = ['ID', 'Date', 'First Name', 'Last Name', 'Email', 'State', 'Status', 'Ambassador', 'Operator'];
        break;

      case 'ambassador_performance':
        data = await this.getAmbassadorLeaderboard(fromDate, toDate, 1000);
        headers = ['Rank', 'Ambassador ID', 'Name', 'Signups', 'Validated', 'Validation Rate', 'Earnings'];
        break;

      default:
        throw new Error(`Unknown report type: ${reportType}`);
    }

    // Convert to CSV
    const csvRows = [headers.join(',')];
    for (const row of data) {
      const values = Object.values(row as object).map(v => 
        typeof v === 'string' ? `"${v.replace(/"/g, '""')}"` : String(v ?? '')
      );
      csvRows.push(values.join(','));
    }

    return csvRows.join('\n');
  }
}

export const reportingService = new ReportingService();
