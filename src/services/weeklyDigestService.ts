/**
 * Weekly Digest Service
 * WO-74: KPI Management and Alerting System
 * Generates weekly summary content for automated reporting
 */

import { db } from './database.js';
import { logger } from '../utils/logger.js';
import { snapshotService } from './snapshotService.js';
import { kpiAlertService } from './kpiAlertService.js';
import type {
  KPIAlert,
  TopPerformer,
} from '../types/analytics.js';

// ============================================
// TYPES
// ============================================

export interface WeeklyDigestContent {
  generatedAt: Date;
  periodStart: Date;
  periodEnd: Date;
  
  // AC-AR-008.1: Sign-ups with week-over-week comparison
  signupSummary: SignupSummary;
  
  // AC-AR-008.2: Ambassadors near bonus thresholds
  ambassadorsNearBonus: AmbassadorBonusStatus[];
  
  // AC-AR-008.3: Upcoming events with pending status
  pendingEvents: PendingEvent[];
  
  // AC-AR-008.4: Events with significant budget variance
  budgetVarianceEvents: BudgetVarianceEvent[];
  
  // AC-AR-008.5: Top 5 performers
  topPerformers: TopPerformer[];
  
  // Active alerts summary
  activeAlerts: AlertSummary;
  
  // Key metrics summary
  keyMetrics: KeyMetricsSummary;
}

export interface SignupSummary {
  thisWeekTotal: number;
  lastWeekTotal: number;
  percentChange: number;
  trend: 'up' | 'down' | 'stable';
  validatedThisWeek: number;
  validationRate: number;
  dailyBreakdown: DailySignups[];
}

export interface DailySignups {
  date: string;
  total: number;
  validated: number;
}

export interface AmbassadorBonusStatus {
  ambassadorId: string;
  name: string;
  currentSignups: number;
  bonusThreshold: number;
  signupsNeeded: number;
  percentToBonus: number;
}

export interface PendingEvent {
  eventId: string;
  title: string;
  eventDate: string;
  venue: string;
  status: string;
  daysUntilEvent: number;
  assignedAmbassadors: number;
}

export interface BudgetVarianceEvent {
  eventId: string;
  title: string;
  eventDate: string;
  budgetedAmount: number;
  actualAmount: number;
  variance: number;
  variancePercent: number;
  varianceType: 'over' | 'under';
}

export interface AlertSummary {
  total: number;
  critical: number;
  warning: number;
  info: number;
  unacknowledged: number;
  topAlerts: Array<{
    kpiName: string;
    severity: string;
    message: string;
    createdAt: Date;
  }>;
}

export interface KeyMetricsSummary {
  totalRevenue: number;
  revenueChange: number;
  activeAmbassadors: number;
  ambassadorChange: number;
  completedEvents: number;
  avgSignupsPerEvent: number;
  dataQualityScore: number;
}

// ============================================
// SERVICE
// ============================================

class WeeklyDigestService {
  private readonly BONUS_THRESHOLD_PROXIMITY = 2; // Within 2 signups of bonus
  private readonly BUDGET_VARIANCE_THRESHOLD = 20; // 20% variance threshold

  /**
   * Generate complete weekly digest content
   */
  async generateDigest(forDate?: Date): Promise<WeeklyDigestContent> {
    const endDate = forDate || new Date();
    const startDate = this.getWeekStart(endDate);
    const previousWeekStart = new Date(startDate);
    previousWeekStart.setDate(previousWeekStart.getDate() - 7);
    const previousWeekEnd = new Date(startDate);
    previousWeekEnd.setDate(previousWeekEnd.getDate() - 1);

    logger.info(
      { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
      'Generating weekly digest'
    );

    const [
      signupSummary,
      ambassadorsNearBonus,
      pendingEvents,
      budgetVarianceEvents,
      topPerformers,
      activeAlerts,
      keyMetrics,
    ] = await Promise.all([
      this.calculateSignupSummary(startDate, endDate, previousWeekStart, previousWeekEnd),
      this.findAmbassadorsNearBonus(),
      this.findPendingEvents(),
      this.findBudgetVarianceEvents(),
      this.getTopPerformers(startDate, endDate),
      this.getAlertSummary(),
      this.calculateKeyMetrics(startDate, endDate, previousWeekStart, previousWeekEnd),
    ]);

    const digest: WeeklyDigestContent = {
      generatedAt: new Date(),
      periodStart: startDate,
      periodEnd: endDate,
      signupSummary,
      ambassadorsNearBonus,
      pendingEvents,
      budgetVarianceEvents,
      topPerformers,
      activeAlerts,
      keyMetrics,
    };

    logger.info(
      {
        signups: signupSummary.thisWeekTotal,
        ambassadorsNearBonus: ambassadorsNearBonus.length,
        pendingEvents: pendingEvents.length,
        budgetVariances: budgetVarianceEvents.length,
        activeAlerts: activeAlerts.total,
      },
      'Weekly digest generated'
    );

    return digest;
  }

  /**
   * AC-AR-008.1: Calculate signup summary with week-over-week comparison
   */
  private async calculateSignupSummary(
    startDate: Date,
    endDate: Date,
    prevStart: Date,
    prevEnd: Date
  ): Promise<SignupSummary> {
    // This week's signups
    const thisWeekResult = await db.queryOne<{
      total: string;
      validated: string;
    }>(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE validation_status = 'validated') as validated
       FROM signups 
       WHERE created_at >= $1 AND created_at <= $2`,
      [startDate.toISOString(), endDate.toISOString()]
    );

    // Last week's signups
    const lastWeekResult = await db.queryOne<{ total: string }>(
      `SELECT COUNT(*) as total FROM signups 
       WHERE created_at >= $1 AND created_at <= $2`,
      [prevStart.toISOString(), prevEnd.toISOString()]
    );

    // Daily breakdown
    const dailyResults = await db.queryMany<{
      date: string;
      total: string;
      validated: string;
    }>(
      `SELECT 
        DATE(created_at) as date,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE validation_status = 'validated') as validated
       FROM signups 
       WHERE created_at >= $1 AND created_at <= $2
       GROUP BY DATE(created_at)
       ORDER BY date`,
      [startDate.toISOString(), endDate.toISOString()]
    );

    const thisWeekTotal = parseInt(thisWeekResult?.total || '0');
    const lastWeekTotal = parseInt(lastWeekResult?.total || '0');
    const validatedThisWeek = parseInt(thisWeekResult?.validated || '0');
    const percentChange = lastWeekTotal > 0 
      ? ((thisWeekTotal - lastWeekTotal) / lastWeekTotal) * 100 
      : 0;

    return {
      thisWeekTotal,
      lastWeekTotal,
      percentChange,
      trend: thisWeekTotal > lastWeekTotal ? 'up' : thisWeekTotal < lastWeekTotal ? 'down' : 'stable',
      validatedThisWeek,
      validationRate: thisWeekTotal > 0 ? (validatedThisWeek / thisWeekTotal) * 100 : 0,
      dailyBreakdown: dailyResults.map((r) => ({
        date: r.date,
        total: parseInt(r.total),
        validated: parseInt(r.validated),
      })),
    };
  }

  /**
   * AC-AR-008.2: Find ambassadors within 2 signups of bonus thresholds
   */
  private async findAmbassadorsNearBonus(): Promise<AmbassadorBonusStatus[]> {
    const results = await db.queryMany<{
      ambassador_id: string;
      name: string;
      current_signups: string;
      bonus_threshold: string;
    }>(
      `SELECT 
        a.id as ambassador_id,
        CONCAT(a.first_name, ' ', a.last_name) as name,
        COALESCE(signup_counts.signup_count, 0) as current_signups,
        COALESCE(bt.threshold_value, 100) as bonus_threshold
       FROM ambassadors a
       LEFT JOIN (
         SELECT ambassador_id, COUNT(*) as signup_count
         FROM signups
         WHERE validation_status = 'validated'
           AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
         GROUP BY ambassador_id
       ) signup_counts ON signup_counts.ambassador_id = a.id
       LEFT JOIN ambassador_bonus_thresholds bt ON bt.ambassador_id = a.id AND bt.is_active = true
       WHERE a.status = 'active'
         AND COALESCE(bt.threshold_value, 100) - COALESCE(signup_counts.signup_count, 0) BETWEEN 1 AND $1
       ORDER BY (COALESCE(bt.threshold_value, 100) - COALESCE(signup_counts.signup_count, 0))`,
      [this.BONUS_THRESHOLD_PROXIMITY]
    );

    return results.map((r) => {
      const currentSignups = parseInt(r.current_signups);
      const bonusThreshold = parseInt(r.bonus_threshold);
      const signupsNeeded = bonusThreshold - currentSignups;
      return {
        ambassadorId: r.ambassador_id,
        name: r.name,
        currentSignups,
        bonusThreshold,
        signupsNeeded,
        percentToBonus: (currentSignups / bonusThreshold) * 100,
      };
    });
  }

  /**
   * AC-AR-008.3: Find upcoming events with pending confirmation status
   */
  private async findPendingEvents(): Promise<PendingEvent[]> {
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const results = await db.queryMany<{
      event_id: string;
      title: string;
      event_date: string;
      venue: string;
      status: string;
      assigned_count: string;
    }>(
      `SELECT 
        e.id as event_id,
        e.title,
        e.event_date,
        COALESCE(e.venue, 'TBD') as venue,
        e.status,
        COUNT(DISTINCT ea.ambassador_id) as assigned_count
       FROM events e
       LEFT JOIN event_assignments ea ON ea.event_id = e.id
       WHERE e.event_date >= CURRENT_DATE 
         AND e.event_date <= $1
         AND e.status = 'planned'
       GROUP BY e.id, e.title, e.event_date, e.venue, e.status
       ORDER BY e.event_date`,
      [sevenDaysFromNow.toISOString().split('T')[0]]
    );

    const today = new Date();
    return results.map((r) => {
      const eventDate = new Date(r.event_date);
      const daysUntil = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      return {
        eventId: r.event_id,
        title: r.title,
        eventDate: r.event_date,
        venue: r.venue,
        status: r.status,
        daysUntilEvent: daysUntil,
        assignedAmbassadors: parseInt(r.assigned_count),
      };
    });
  }

  /**
   * AC-AR-008.4: Find completed events with significant budget variances (>20%)
   */
  private async findBudgetVarianceEvents(): Promise<BudgetVarianceEvent[]> {
    const results = await db.queryMany<{
      event_id: string;
      title: string;
      event_date: string;
      budgeted_amount: string;
      actual_amount: string;
    }>(
      `SELECT 
        e.id as event_id,
        e.title,
        e.event_date,
        COALESCE(e.budget, 0) as budgeted_amount,
        COALESCE(e.actual_cost, 0) as actual_amount
       FROM events e
       WHERE e.status = 'completed'
         AND e.event_date >= DATE_TRUNC('week', CURRENT_DATE - INTERVAL '1 week')
         AND e.budget > 0
         AND ABS(COALESCE(e.actual_cost, 0) - e.budget) / e.budget * 100 > $1
       ORDER BY ABS(COALESCE(e.actual_cost, 0) - e.budget) DESC`,
      [this.BUDGET_VARIANCE_THRESHOLD]
    );

    return results.map((r) => {
      const budgetedAmount = parseFloat(r.budgeted_amount);
      const actualAmount = parseFloat(r.actual_amount);
      const variance = actualAmount - budgetedAmount;
      const variancePercent = budgetedAmount > 0 ? (variance / budgetedAmount) * 100 : 0;
      return {
        eventId: r.event_id,
        title: r.title,
        eventDate: r.event_date,
        budgetedAmount,
        actualAmount,
        variance: Math.abs(variance),
        variancePercent: Math.abs(variancePercent),
        varianceType: variance > 0 ? 'over' : 'under',
      };
    });
  }

  /**
   * AC-AR-008.5: Get top 5 performers by signup count
   */
  private async getTopPerformers(startDate: Date, endDate: Date): Promise<TopPerformer[]> {
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
       WHERE s.created_at >= $1 AND s.created_at <= $2
       GROUP BY a.id, a.first_name, a.last_name
       ORDER BY signups DESC
       LIMIT 5`,
      [startDate.toISOString(), endDate.toISOString()]
    );

    return results.map((r) => ({
      id: r.id,
      name: r.name,
      signups: parseInt(r.signups),
      validationRate: parseInt(r.signups) > 0 
        ? (parseInt(r.validated) / parseInt(r.signups)) * 100 
        : 0,
    }));
  }

  /**
   * Get summary of active alerts
   */
  private async getAlertSummary(): Promise<AlertSummary> {
    const { alerts } = await kpiAlertService.getAlerts({
      status: 'active',
      limit: 100,
    });

    const critical = alerts.filter((a) => a.alertSeverity === 'critical').length;
    const warning = alerts.filter((a) => a.alertSeverity === 'warning').length;
    const info = alerts.filter((a) => a.alertSeverity === 'info').length;

    // Get unacknowledged count
    const unacknowledgedResult = await db.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM kpi_alerts 
       WHERE alert_status = 'active' AND acknowledged_at IS NULL`
    );

    return {
      total: alerts.length,
      critical,
      warning,
      info,
      unacknowledged: parseInt(unacknowledgedResult?.count || '0'),
      topAlerts: alerts.slice(0, 5).map((a) => ({
        kpiName: a.kpiName,
        severity: a.alertSeverity,
        message: a.alertMessage,
        createdAt: a.createdAt,
      })),
    };
  }

  /**
   * Calculate key metrics summary
   */
  private async calculateKeyMetrics(
    startDate: Date,
    endDate: Date,
    prevStart: Date,
    prevEnd: Date
  ): Promise<KeyMetricsSummary> {
    const thisWeekResult = await db.queryOne<{
      revenue: string;
      ambassadors: string;
      events: string;
      avg_signups: string;
      quality_score: string;
    }>(
      `SELECT 
        COALESCE((SELECT SUM(amount) FROM revenue_records 
          WHERE revenue_date >= $1::date AND revenue_date <= $2::date), 0) as revenue,
        (SELECT COUNT(DISTINCT ambassador_id) FROM signups 
          WHERE created_at >= $1 AND created_at <= $2) as ambassadors,
        (SELECT COUNT(*) FROM events 
          WHERE status = 'completed' AND event_date >= $1::date AND event_date <= $2::date) as events,
        COALESCE((SELECT AVG(signup_count) FROM (
          SELECT event_id, COUNT(*) as signup_count FROM signups
          WHERE created_at >= $1 AND created_at <= $2
          GROUP BY event_id
        ) s), 0) as avg_signups,
        COALESCE((SELECT AVG(data_quality_score) FROM daily_metrics_snapshots
          WHERE snapshot_date >= $1::date AND snapshot_date <= $2::date), 0) as quality_score`,
      [startDate.toISOString(), endDate.toISOString()]
    );

    const prevWeekResult = await db.queryOne<{
      revenue: string;
      ambassadors: string;
    }>(
      `SELECT 
        COALESCE((SELECT SUM(amount) FROM revenue_records 
          WHERE revenue_date >= $1::date AND revenue_date <= $2::date), 0) as revenue,
        (SELECT COUNT(DISTINCT ambassador_id) FROM signups 
          WHERE created_at >= $1 AND created_at <= $2) as ambassadors`,
      [prevStart.toISOString(), prevEnd.toISOString()]
    );

    const thisRevenue = parseFloat(thisWeekResult?.revenue || '0');
    const prevRevenue = parseFloat(prevWeekResult?.revenue || '0');
    const thisAmbassadors = parseInt(thisWeekResult?.ambassadors || '0');
    const prevAmbassadors = parseInt(prevWeekResult?.ambassadors || '0');

    return {
      totalRevenue: thisRevenue,
      revenueChange: prevRevenue > 0 ? ((thisRevenue - prevRevenue) / prevRevenue) * 100 : 0,
      activeAmbassadors: thisAmbassadors,
      ambassadorChange: prevAmbassadors > 0 ? ((thisAmbassadors - prevAmbassadors) / prevAmbassadors) * 100 : 0,
      completedEvents: parseInt(thisWeekResult?.events || '0'),
      avgSignupsPerEvent: parseFloat(thisWeekResult?.avg_signups || '0'),
      dataQualityScore: parseFloat(thisWeekResult?.quality_score || '0'),
    };
  }

  /**
   * Format digest content as plain text for email
   */
  formatAsText(digest: WeeklyDigestContent): string {
    const lines: string[] = [];
    
    lines.push('='.repeat(60));
    lines.push('WEEKLY PERFORMANCE DIGEST');
    lines.push(`Period: ${this.formatDate(digest.periodStart)} - ${this.formatDate(digest.periodEnd)}`);
    lines.push('='.repeat(60));
    lines.push('');

    // Sign-ups Summary
    lines.push('📊 SIGN-UPS SUMMARY');
    lines.push('-'.repeat(30));
    lines.push(`This Week: ${digest.signupSummary.thisWeekTotal}`);
    lines.push(`Last Week: ${digest.signupSummary.lastWeekTotal}`);
    lines.push(`Change: ${digest.signupSummary.percentChange >= 0 ? '+' : ''}${digest.signupSummary.percentChange.toFixed(1)}% ${digest.signupSummary.trend === 'up' ? '↑' : digest.signupSummary.trend === 'down' ? '↓' : '→'}`);
    lines.push(`Validation Rate: ${digest.signupSummary.validationRate.toFixed(1)}%`);
    lines.push('');

    // Top Performers
    if (digest.topPerformers.length > 0) {
      lines.push('🏆 TOP 5 PERFORMERS');
      lines.push('-'.repeat(30));
      digest.topPerformers.forEach((p, i) => {
        lines.push(`${i + 1}. ${p.name}: ${p.signups} signups (${p.validationRate.toFixed(0)}% validated)`);
      });
      lines.push('');
    }

    // Ambassadors Near Bonus
    if (digest.ambassadorsNearBonus.length > 0) {
      lines.push('🎯 AMBASSADORS NEAR BONUS');
      lines.push('-'.repeat(30));
      digest.ambassadorsNearBonus.forEach((a) => {
        lines.push(`• ${a.name}: ${a.signupsNeeded} more needed (${a.currentSignups}/${a.bonusThreshold})`);
      });
      lines.push('');
    }

    // Pending Events
    if (digest.pendingEvents.length > 0) {
      lines.push('⏳ PENDING EVENTS (Next 7 Days)');
      lines.push('-'.repeat(30));
      digest.pendingEvents.forEach((e) => {
        lines.push(`• ${e.title} (${e.eventDate})`);
        lines.push(`  Venue: ${e.venue} | Days until: ${e.daysUntilEvent} | Assigned: ${e.assignedAmbassadors}`);
      });
      lines.push('');
    }

    // Budget Variances
    if (digest.budgetVarianceEvents.length > 0) {
      lines.push('💰 BUDGET VARIANCES (>20%)');
      lines.push('-'.repeat(30));
      digest.budgetVarianceEvents.forEach((e) => {
        const sign = e.varianceType === 'over' ? '+' : '-';
        lines.push(`• ${e.title}: ${sign}$${e.variance.toFixed(2)} (${e.variancePercent.toFixed(1)}% ${e.varianceType})`);
      });
      lines.push('');
    }

    // Active Alerts
    if (digest.activeAlerts.total > 0) {
      lines.push('🚨 ACTIVE ALERTS');
      lines.push('-'.repeat(30));
      lines.push(`Critical: ${digest.activeAlerts.critical} | Warning: ${digest.activeAlerts.warning} | Info: ${digest.activeAlerts.info}`);
      lines.push(`Unacknowledged: ${digest.activeAlerts.unacknowledged}`);
      lines.push('');
    }

    // Key Metrics
    lines.push('📈 KEY METRICS');
    lines.push('-'.repeat(30));
    lines.push(`Revenue: $${digest.keyMetrics.totalRevenue.toFixed(2)} (${digest.keyMetrics.revenueChange >= 0 ? '+' : ''}${digest.keyMetrics.revenueChange.toFixed(1)}%)`);
    lines.push(`Active Ambassadors: ${digest.keyMetrics.activeAmbassadors}`);
    lines.push(`Completed Events: ${digest.keyMetrics.completedEvents}`);
    lines.push(`Avg Signups/Event: ${digest.keyMetrics.avgSignupsPerEvent.toFixed(1)}`);
    lines.push(`Data Quality: ${digest.keyMetrics.dataQualityScore.toFixed(1)}%`);
    lines.push('');

    lines.push('='.repeat(60));
    lines.push(`Generated: ${digest.generatedAt.toISOString()}`);

    return lines.join('\n');
  }

  /**
   * Format digest content as HTML for email
   */
  formatAsHtml(digest: WeeklyDigestContent): string {
    const trendIcon = (trend: 'up' | 'down' | 'stable') => 
      trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';
    
    const trendColor = (trend: 'up' | 'down' | 'stable') =>
      trend === 'up' ? '#22c55e' : trend === 'down' ? '#ef4444' : '#6b7280';

    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #374151; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: white; padding: 30px; border-radius: 12px 12px 0 0; }
    .header h1 { margin: 0; font-size: 24px; }
    .header p { margin: 5px 0 0; opacity: 0.9; }
    .section { background: #f9fafb; padding: 20px; margin-bottom: 2px; }
    .section h2 { margin: 0 0 15px; font-size: 16px; color: #111827; }
    .metric-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .metric-label { color: #6b7280; }
    .metric-value { font-weight: 600; }
    .performer { display: flex; align-items: center; padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
    .performer-rank { width: 24px; height: 24px; background: #6366f1; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; margin-right: 12px; }
    .alert-badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 12px; margin-right: 8px; }
    .alert-critical { background: #fee2e2; color: #dc2626; }
    .alert-warning { background: #fef3c7; color: #d97706; }
    .alert-info { background: #dbeafe; color: #2563eb; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #9ca3af; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 Weekly Performance Digest</h1>
      <p>${this.formatDate(digest.periodStart)} - ${this.formatDate(digest.periodEnd)}</p>
    </div>

    <div class="section">
      <h2>📈 Sign-ups Summary</h2>
      <div class="metric-row">
        <span class="metric-label">This Week</span>
        <span class="metric-value">${digest.signupSummary.thisWeekTotal}</span>
      </div>
      <div class="metric-row">
        <span class="metric-label">Last Week</span>
        <span class="metric-value">${digest.signupSummary.lastWeekTotal}</span>
      </div>
      <div class="metric-row">
        <span class="metric-label">Change</span>
        <span class="metric-value" style="color: ${trendColor(digest.signupSummary.trend)}">
          ${digest.signupSummary.percentChange >= 0 ? '+' : ''}${digest.signupSummary.percentChange.toFixed(1)}% ${trendIcon(digest.signupSummary.trend)}
        </span>
      </div>
      <div class="metric-row">
        <span class="metric-label">Validation Rate</span>
        <span class="metric-value">${digest.signupSummary.validationRate.toFixed(1)}%</span>
      </div>
    </div>

    ${digest.topPerformers.length > 0 ? `
    <div class="section">
      <h2>🏆 Top 5 Performers</h2>
      ${digest.topPerformers.map((p, i) => `
        <div class="performer">
          <div class="performer-rank">${i + 1}</div>
          <div style="flex: 1">
            <div style="font-weight: 600">${p.name}</div>
            <div style="font-size: 14px; color: #6b7280">${p.signups} signups (${p.validationRate.toFixed(0)}% validated)</div>
          </div>
        </div>
      `).join('')}
    </div>
    ` : ''}

    ${digest.ambassadorsNearBonus.length > 0 ? `
    <div class="section">
      <h2>🎯 Ambassadors Near Bonus</h2>
      ${digest.ambassadorsNearBonus.map((a) => `
        <div class="metric-row">
          <span class="metric-label">${a.name}</span>
          <span class="metric-value">${a.signupsNeeded} more needed (${a.currentSignups}/${a.bonusThreshold})</span>
        </div>
      `).join('')}
    </div>
    ` : ''}

    ${digest.pendingEvents.length > 0 ? `
    <div class="section">
      <h2>⏳ Pending Events (Next 7 Days)</h2>
      ${digest.pendingEvents.map((e) => `
        <div style="padding: 10px 0; border-bottom: 1px solid #e5e7eb;">
          <div style="font-weight: 600">${e.title}</div>
          <div style="font-size: 14px; color: #6b7280">${e.eventDate} • ${e.venue} • ${e.daysUntilEvent} days • ${e.assignedAmbassadors} assigned</div>
        </div>
      `).join('')}
    </div>
    ` : ''}

    ${digest.budgetVarianceEvents.length > 0 ? `
    <div class="section">
      <h2>💰 Budget Variances (&gt;20%)</h2>
      ${digest.budgetVarianceEvents.map((e) => `
        <div class="metric-row">
          <span class="metric-label">${e.title}</span>
          <span class="metric-value" style="color: ${e.varianceType === 'over' ? '#ef4444' : '#22c55e'}">
            ${e.varianceType === 'over' ? '+' : '-'}$${e.variance.toFixed(2)} (${e.variancePercent.toFixed(1)}%)
          </span>
        </div>
      `).join('')}
    </div>
    ` : ''}

    ${digest.activeAlerts.total > 0 ? `
    <div class="section">
      <h2>🚨 Active Alerts</h2>
      <div style="margin-bottom: 15px;">
        <span class="alert-badge alert-critical">Critical: ${digest.activeAlerts.critical}</span>
        <span class="alert-badge alert-warning">Warning: ${digest.activeAlerts.warning}</span>
        <span class="alert-badge alert-info">Info: ${digest.activeAlerts.info}</span>
      </div>
      <div style="font-size: 14px; color: #6b7280">
        Unacknowledged: ${digest.activeAlerts.unacknowledged}
      </div>
    </div>
    ` : ''}

    <div class="section">
      <h2>📈 Key Metrics</h2>
      <div class="metric-row">
        <span class="metric-label">Revenue</span>
        <span class="metric-value">$${digest.keyMetrics.totalRevenue.toFixed(2)} (${digest.keyMetrics.revenueChange >= 0 ? '+' : ''}${digest.keyMetrics.revenueChange.toFixed(1)}%)</span>
      </div>
      <div class="metric-row">
        <span class="metric-label">Active Ambassadors</span>
        <span class="metric-value">${digest.keyMetrics.activeAmbassadors}</span>
      </div>
      <div class="metric-row">
        <span class="metric-label">Completed Events</span>
        <span class="metric-value">${digest.keyMetrics.completedEvents}</span>
      </div>
      <div class="metric-row">
        <span class="metric-label">Avg Signups/Event</span>
        <span class="metric-value">${digest.keyMetrics.avgSignupsPerEvent.toFixed(1)}</span>
      </div>
      <div class="metric-row">
        <span class="metric-label">Data Quality Score</span>
        <span class="metric-value">${digest.keyMetrics.dataQualityScore.toFixed(1)}%</span>
      </div>
    </div>

    <div class="footer">
      Generated: ${digest.generatedAt.toISOString()}<br>
      XCLSV Core Platform
    </div>
  </div>
</body>
</html>
    `.trim();
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private getWeekStart(date: Date): Date {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday as start
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}

export const weeklyDigestService = new WeeklyDigestService();
