/**
 * Manual Insight Service
 * WO-86: Manual Insight Management
 * 
 * Manages recurring patterns and specific date insights
 * for traffic/scoring adjustments.
 */

import { db } from './database.js';
import { logger } from '../utils/logger.js';
import {
  ManualInsight,
  RecurringInsight,
  SpecificDateInsight,
  CreateRecurringInsightInput,
  CreateSpecificDateInsightInput,
  UpdateInsightInput,
  ListInsightsQuery,
  EffectiveInsight,
  ManualInsightRow,
  TRAFFIC_MULTIPLIERS,
  TrafficExpectation,
} from '../types/manualInsight.js';

/**
 * Convert database row to ManualInsight
 */
function rowToInsight(row: ManualInsightRow): ManualInsight {
  const base = {
    id: row.id,
    operatorId: row.operator_id ?? undefined,
    insightType: row.insight_type,
    trafficExpectation: row.traffic_expectation,
    label: row.label,
    notes: row.notes ?? undefined,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isActive: row.is_active,
  };

  if (row.insight_type === 'recurring') {
    return {
      ...base,
      insightType: 'recurring',
      dayOfWeek: row.day_of_week as 0 | 1 | 2 | 3 | 4 | 5 | 6,
      startDate: row.start_date?.toISOString().split('T')[0],
      endDate: row.end_date?.toISOString().split('T')[0],
    } as RecurringInsight;
  } else {
    return {
      ...base,
      insightType: 'specific',
      date: row.date!.toISOString().split('T')[0],
      autoExpire: row.auto_expire,
    } as SpecificDateInsight;
  }
}

class ManualInsightService {
  /**
   * Create a recurring pattern insight
   */
  async createRecurring(
    input: CreateRecurringInsightInput,
    createdBy: string
  ): Promise<RecurringInsight> {
    const result = await db.queryOne<ManualInsightRow>(
      `INSERT INTO manual_insights
       (operator_id, insight_type, day_of_week, traffic_expectation, label, notes, start_date, end_date, created_by)
       VALUES ($1, 'recurring', $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        input.operatorId ?? null,
        input.dayOfWeek,
        input.trafficExpectation,
        input.label,
        input.notes ?? null,
        input.startDate ?? null,
        input.endDate ?? null,
        createdBy,
      ]
    );

    logger.info({ insightId: result!.id, dayOfWeek: input.dayOfWeek }, 'Recurring insight created');
    return rowToInsight(result!) as RecurringInsight;
  }

  /**
   * Create a specific date insight
   */
  async createSpecificDate(
    input: CreateSpecificDateInsightInput,
    createdBy: string
  ): Promise<SpecificDateInsight> {
    const result = await db.queryOne<ManualInsightRow>(
      `INSERT INTO manual_insights
       (operator_id, insight_type, date, traffic_expectation, label, notes, auto_expire, created_by)
       VALUES ($1, 'specific', $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.operatorId ?? null,
        input.date,
        input.trafficExpectation,
        input.label,
        input.notes ?? null,
        input.autoExpire ?? true,
        createdBy,
      ]
    );

    logger.info({ insightId: result!.id, date: input.date }, 'Specific date insight created');
    return rowToInsight(result!) as SpecificDateInsight;
  }

  /**
   * Get insight by ID
   */
  async getById(id: string): Promise<ManualInsight | null> {
    const row = await db.queryOne<ManualInsightRow>(
      'SELECT * FROM manual_insights WHERE id = $1',
      [id]
    );
    return row ? rowToInsight(row) : null;
  }

  /**
   * Update an insight
   */
  async update(id: string, input: UpdateInsightInput): Promise<ManualInsight | null> {
    // Build dynamic update query
    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (input.trafficExpectation !== undefined) {
      updates.push(`traffic_expectation = $${paramIndex++}`);
      params.push(input.trafficExpectation);
    }
    if (input.label !== undefined) {
      updates.push(`label = $${paramIndex++}`);
      params.push(input.label);
    }
    if (input.notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      params.push(input.notes);
    }
    if (input.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      params.push(input.isActive);
    }
    if (input.dayOfWeek !== undefined) {
      updates.push(`day_of_week = $${paramIndex++}`);
      params.push(input.dayOfWeek);
    }
    if (input.startDate !== undefined) {
      updates.push(`start_date = $${paramIndex++}`);
      params.push(input.startDate);
    }
    if (input.endDate !== undefined) {
      updates.push(`end_date = $${paramIndex++}`);
      params.push(input.endDate);
    }
    if (input.date !== undefined) {
      updates.push(`date = $${paramIndex++}`);
      params.push(input.date);
    }
    if (input.autoExpire !== undefined) {
      updates.push(`auto_expire = $${paramIndex++}`);
      params.push(input.autoExpire);
    }

    if (updates.length === 0) {
      return this.getById(id);
    }

    updates.push(`updated_at = NOW()`);
    params.push(id);

    const row = await db.queryOne<ManualInsightRow>(
      `UPDATE manual_insights SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    if (row) {
      logger.info({ insightId: id }, 'Insight updated');
      return rowToInsight(row);
    }
    return null;
  }

  /**
   * Delete an insight
   */
  async delete(id: string): Promise<boolean> {
    const result = await db.query(
      'DELETE FROM manual_insights WHERE id = $1',
      [id]
    );
    if ((result.rowCount ?? 0) > 0) {
      logger.info({ insightId: id }, 'Insight deleted');
      return true;
    }
    return false;
  }

  /**
   * List insights with filtering
   */
  async list(query: ListInsightsQuery): Promise<{
    insights: ManualInsight[];
    total: number;
  }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (query.operatorId !== undefined) {
      if (query.operatorId === null) {
        conditions.push('operator_id IS NULL');
      } else {
        conditions.push(`operator_id = $${paramIndex++}`);
        params.push(query.operatorId);
      }
    }
    if (query.insightType) {
      conditions.push(`insight_type = $${paramIndex++}`);
      params.push(query.insightType);
    }
    if (query.trafficExpectation) {
      conditions.push(`traffic_expectation = $${paramIndex++}`);
      params.push(query.trafficExpectation);
    }
    if (query.isActive !== undefined) {
      conditions.push(`is_active = $${paramIndex++}`);
      params.push(query.isActive);
    }
    if (!query.includeExpired) {
      // Exclude expired specific date insights
      conditions.push(`(insight_type = 'recurring' OR date >= CURRENT_DATE OR auto_expire = false)`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const offset = (page - 1) * limit;

    const [rows, countResult] = await Promise.all([
      db.queryMany<ManualInsightRow>(
        `SELECT * FROM manual_insights ${whereClause}
         ORDER BY 
           CASE insight_type WHEN 'specific' THEN 0 ELSE 1 END,
           COALESCE(date, start_date, '2099-12-31'::date),
           day_of_week
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset]
      ),
      db.queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM manual_insights ${whereClause}`,
        params
      ),
    ]);

    return {
      insights: rows.map(rowToInsight),
      total: parseInt(countResult?.count ?? '0'),
    };
  }

  /**
   * Get the effective insight for a specific date
   * Implements precedence: specific dates override recurring patterns
   * This is the integration hook for the scoring algorithm
   */
  async getEffectiveInsight(
    date: string,
    operatorId?: string
  ): Promise<EffectiveInsight> {
    const targetDate = new Date(date);
    const dayOfWeek = targetDate.getDay();

    // Build operator condition - check operator-specific then global
    const operatorCondition = operatorId
      ? '(operator_id = $2 OR operator_id IS NULL)'
      : 'operator_id IS NULL';

    const params: unknown[] = [date];
    if (operatorId) params.push(operatorId);

    // First, check for specific date insight (highest precedence)
    const specificInsight = await db.queryOne<ManualInsightRow>(
      `SELECT * FROM manual_insights
       WHERE insight_type = 'specific'
       AND date = $1
       AND is_active = true
       AND ${operatorCondition}
       ORDER BY 
         CASE WHEN operator_id IS NOT NULL THEN 0 ELSE 1 END
       LIMIT 1`,
      params
    );

    if (specificInsight) {
      const insight = rowToInsight(specificInsight) as SpecificDateInsight;
      return {
        insight,
        multiplier: TRAFFIC_MULTIPLIERS[insight.trafficExpectation],
        source: 'specific',
      };
    }

    // Check for recurring pattern
    const recurringParams: unknown[] = [dayOfWeek, date];
    if (operatorId) recurringParams.push(operatorId);

    const recurringInsight = await db.queryOne<ManualInsightRow>(
      `SELECT * FROM manual_insights
       WHERE insight_type = 'recurring'
       AND day_of_week = $1
       AND is_active = true
       AND (start_date IS NULL OR start_date <= $2)
       AND (end_date IS NULL OR end_date >= $2)
       AND ${operatorCondition.replace('$2', operatorId ? '$3' : '')}
       ORDER BY 
         CASE WHEN operator_id IS NOT NULL THEN 0 ELSE 1 END
       LIMIT 1`,
      recurringParams
    );

    if (recurringInsight) {
      const insight = rowToInsight(recurringInsight) as RecurringInsight;
      return {
        insight,
        multiplier: TRAFFIC_MULTIPLIERS[insight.trafficExpectation],
        source: 'recurring',
      };
    }

    // No insight found - return default (moderate)
    return {
      insight: null,
      multiplier: TRAFFIC_MULTIPLIERS.moderate,
      source: 'default',
    };
  }

  /**
   * Get insights for a date range (useful for calendar views)
   */
  async getInsightsForRange(
    startDate: string,
    endDate: string,
    operatorId?: string
  ): Promise<Map<string, EffectiveInsight>> {
    const results = new Map<string, EffectiveInsight>();
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Generate all dates in range
    const dates: string[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().split('T')[0]);
    }

    // Batch fetch all insights for efficiency
    for (const date of dates) {
      const effective = await this.getEffectiveInsight(date, operatorId);
      results.set(date, effective);
    }

    return results;
  }

  /**
   * Cleanup expired specific date insights
   * Run this periodically (e.g., daily cron job)
   */
  async cleanupExpired(): Promise<number> {
    const result = await db.query(
      `DELETE FROM manual_insights
       WHERE insight_type = 'specific'
       AND auto_expire = true
       AND date < CURRENT_DATE - INTERVAL '30 days'`
    );

    const count = result.rowCount ?? 0;
    if (count > 0) {
      logger.info({ count }, 'Expired insights cleaned up');
    }
    return count;
  }

  /**
   * Get statistics about insights
   */
  async getStats(operatorId?: string): Promise<{
    total: number;
    byType: Record<string, number>;
    byTraffic: Record<TrafficExpectation, number>;
    activeCount: number;
    expiredCount: number;
  }> {
    const operatorCondition = operatorId
      ? 'WHERE operator_id = $1'
      : 'WHERE operator_id IS NULL';
    const params = operatorId ? [operatorId] : [];

    const stats = await db.queryOne<{
      total: string;
      recurring_count: string;
      specific_count: string;
      high_count: string;
      moderate_count: string;
      low_count: string;
      active_count: string;
      expired_count: string;
    }>(
      `SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE insight_type = 'recurring') as recurring_count,
        COUNT(*) FILTER (WHERE insight_type = 'specific') as specific_count,
        COUNT(*) FILTER (WHERE traffic_expectation = 'high') as high_count,
        COUNT(*) FILTER (WHERE traffic_expectation = 'moderate') as moderate_count,
        COUNT(*) FILTER (WHERE traffic_expectation = 'low') as low_count,
        COUNT(*) FILTER (WHERE is_active = true) as active_count,
        COUNT(*) FILTER (WHERE insight_type = 'specific' AND date < CURRENT_DATE) as expired_count
       FROM manual_insights
       ${operatorCondition}`,
      params
    );

    return {
      total: parseInt(stats?.total ?? '0'),
      byType: {
        recurring: parseInt(stats?.recurring_count ?? '0'),
        specific: parseInt(stats?.specific_count ?? '0'),
      },
      byTraffic: {
        high: parseInt(stats?.high_count ?? '0'),
        moderate: parseInt(stats?.moderate_count ?? '0'),
        low: parseInt(stats?.low_count ?? '0'),
      },
      activeCount: parseInt(stats?.active_count ?? '0'),
      expiredCount: parseInt(stats?.expired_count ?? '0'),
    };
  }
}

export const manualInsightService = new ManualInsightService();
