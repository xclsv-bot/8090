/**
 * CPA Service
 * WO-23: CPA rate management API and bulk operations
 */

import { db } from './database.js';
import { logger } from '../utils/logger.js';
import type { CpaRate, CpaTier, CreateCpaRateInput } from '../types/cpa.js';

class CpaService {
  /**
   * Create CPA rate
   */
  async createRate(input: CreateCpaRateInput): Promise<CpaRate> {
    const result = await db.queryOne<CpaRate>(
      `INSERT INTO cpa_rates (
        operator_id, state_code, rate_type, cpa_amount, rev_share_percentage,
        min_deposit, effective_date, end_date, tier
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        input.operatorId,
        input.stateCode,
        input.rateType,
        input.cpaAmount,
        input.revSharePercentage,
        input.minDeposit,
        input.effectiveDate,
        input.endDate,
        input.tier,
      ]
    );

    logger.info({ rateId: result?.id, operatorId: input.operatorId, state: input.stateCode }, 'CPA rate created');
    return result!;
  }

  /**
   * Get rate for operator/state/date
   */
  async getRate(operatorId: number, stateCode: string, date?: string): Promise<CpaRate | null> {
    const targetDate = date || new Date().toISOString().split('T')[0];

    return db.queryOne<CpaRate>(
      `SELECT * FROM cpa_rates
       WHERE operator_id = $1 
       AND state_code = $2
       AND effective_date <= $3
       AND (end_date IS NULL OR end_date >= $3)
       AND is_active = true
       ORDER BY effective_date DESC
       LIMIT 1`,
      [operatorId, stateCode, targetDate]
    );
  }

  /**
   * Get all rates for operator
   */
  async getRatesByOperator(operatorId: number, activeOnly = true): Promise<CpaRate[]> {
    const activeCondition = activeOnly ? 'AND is_active = true' : '';

    return db.queryMany<CpaRate>(
      `SELECT * FROM cpa_rates
       WHERE operator_id = $1 ${activeCondition}
       ORDER BY state_code, effective_date DESC`,
      [operatorId]
    );
  }

  /**
   * Get rates by state
   */
  async getRatesByState(stateCode: string, date?: string): Promise<(CpaRate & { operatorName: string })[]> {
    const targetDate = date || new Date().toISOString().split('T')[0];

    return db.queryMany<CpaRate & { operatorName: string }>(
      `SELECT cr.*, o.display_name as operator_name
       FROM cpa_rates cr
       JOIN operators o ON o.id = cr.operator_id
       WHERE cr.state_code = $1
       AND cr.effective_date <= $2
       AND (cr.end_date IS NULL OR cr.end_date >= $2)
       AND cr.is_active = true
       ORDER BY o.sort_order`,
      [stateCode, targetDate]
    );
  }

  /**
   * Update rate
   */
  async updateRate(id: string, updates: Partial<CreateCpaRateInput>): Promise<CpaRate | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      cpaAmount: 'cpa_amount',
      revSharePercentage: 'rev_share_percentage',
      minDeposit: 'min_deposit',
      endDate: 'end_date',
      tier: 'tier',
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
      if (updates[key as keyof CreateCpaRateInput] !== undefined) {
        fields.push(`${dbField} = $${paramIndex++}`);
        values.push(updates[key as keyof CreateCpaRateInput]);
      }
    }

    if (fields.length === 0) return this.getRateById(id);

    values.push(id);
    return db.queryOne<CpaRate>(
      `UPDATE cpa_rates SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );
  }

  /**
   * Deactivate rate
   */
  async deactivateRate(id: string): Promise<boolean> {
    const result = await db.query(
      'UPDATE cpa_rates SET is_active = false, end_date = CURRENT_DATE WHERE id = $1',
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Bulk import rates
   */
  async bulkImport(rates: CreateCpaRateInput[]): Promise<{
    success: number;
    failed: number;
    errors: { index: number; error: string }[];
  }> {
    let success = 0;
    let failed = 0;
    const errors: { index: number; error: string }[] = [];

    for (let i = 0; i < rates.length; i++) {
      try {
        await this.createRate(rates[i]);
        success++;
      } catch (error: any) {
        failed++;
        errors.push({ index: i, error: error.message });
      }
    }

    logger.info({ success, failed }, 'Bulk CPA rate import completed');
    return { success, failed, errors };
  }

  /**
   * Get rate by ID
   */
  async getRateById(id: string): Promise<CpaRate | null> {
    return db.queryOne<CpaRate>('SELECT * FROM cpa_rates WHERE id = $1', [id]);
  }

  /**
   * Calculate CPA for signup
   */
  async calculateSignupCpa(signupId: string): Promise<number | null> {
    const signup = await db.queryOne<{ operator_id: number; customer_state: string }>(
      'SELECT operator_id, customer_state FROM signups WHERE id = $1',
      [signupId]
    );

    if (!signup || !signup.customer_state) return null;

    const rate = await this.getRate(signup.operator_id, signup.customer_state);
    if (!rate) return null;

    // Store attribution
    await db.query(
      `INSERT INTO signup_cpa_attribution (signup_id, cpa_rate_id, attributed_amount, attribution_date)
       VALUES ($1, $2, $3, CURRENT_DATE)
       ON CONFLICT (signup_id) DO UPDATE SET cpa_rate_id = $2, attributed_amount = $3`,
      [signupId, rate.id, rate.cpaAmount]
    );

    return rate.cpaAmount || null;
  }

  /**
   * Get tiers for operator
   */
  async getTiers(operatorId?: number): Promise<CpaTier[]> {
    const condition = operatorId ? 'WHERE operator_id = $1 OR operator_id IS NULL' : '';
    const params = operatorId ? [operatorId] : [];

    return db.queryMany<CpaTier>(
      `SELECT * FROM cpa_tiers ${condition} AND is_active = true ORDER BY min_conversions`,
      params
    );
  }

  /**
   * Get rate summary by state
   */
  async getRateSummary(): Promise<{ stateCode: string; operatorCount: number; avgCpa: number }[]> {
    return db.queryMany<{ stateCode: string; operatorCount: number; avgCpa: number }>(
      `SELECT state_code, COUNT(DISTINCT operator_id) as operator_count, AVG(cpa_amount) as avg_cpa
       FROM cpa_rates
       WHERE is_active = true AND cpa_amount IS NOT NULL
       GROUP BY state_code
       ORDER BY state_code`
    );
  }
}

export const cpaService = new CpaService();
