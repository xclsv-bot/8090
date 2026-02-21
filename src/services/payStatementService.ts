/**
 * Pay Statement Service - WO-91
 * Detailed pay statement logic with line items, payment history, and rate tracking
 */

import { db } from './database.js';
import { logger } from '../utils/logger.js';
import type {
  AmbassadorPayStatement,
  AmbassadorPayStatementWithDetails,
  PayStatementLineItem,
  PayStatementLineItemInput,
  PaymentHistory,
  PaymentHistoryInput,
  PayRateHistory,
  PayRateHistoryInput,
  StatementCalculation,
  PayStatementSearchParams,
  LineItemSearchParams,
  PayStatementStats,
  AmbassadorPaySummary,
  PayStatementStatus,
  LineItemType,
  RateType,
} from '../types/payStatement.js';

class PayStatementService {
  // ==================== STATEMENTS ====================

  /**
   * Create a new pay statement
   */
  async createStatement(ambassadorId: string, payPeriodId: string): Promise<AmbassadorPayStatement> {
    const result = await db.queryOne<AmbassadorPayStatement>(
      `INSERT INTO ambassador_pay_statements (ambassador_id, pay_period_id, status, gross_pay, deductions, net_pay)
       VALUES ($1, $2, 'draft', 0, 0, 0)
       ON CONFLICT (ambassador_id, pay_period_id) DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [ambassadorId, payPeriodId]
    );

    logger.info({ statementId: result?.id, ambassadorId, payPeriodId }, 'Pay statement created');
    return result!;
  }

  /**
   * Get statement by ID with details
   */
  async getStatementById(id: string): Promise<AmbassadorPayStatementWithDetails | null> {
    return db.queryOne<AmbassadorPayStatementWithDetails>(
      `SELECT 
        aps.*,
        CONCAT(a.first_name, ' ', a.last_name) as ambassador_name,
        a.email as ambassador_email,
        pp.period_start,
        pp.period_end,
        (SELECT COUNT(*) FROM pay_statement_line_items WHERE statement_id = aps.id) as line_item_count,
        (SELECT COUNT(*) FROM statement_payment_history WHERE statement_id = aps.id) as payment_count
       FROM ambassador_pay_statements aps
       JOIN ambassadors a ON a.id = aps.ambassador_id
       JOIN pay_periods pp ON pp.id = aps.pay_period_id
       WHERE aps.id = $1`,
      [id]
    );
  }

  /**
   * Search statements with filters
   */
  async searchStatements(params: PayStatementSearchParams): Promise<{
    statements: AmbassadorPayStatementWithDetails[];
    total: number;
  }> {
    const conditions: string[] = ['1=1'];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.ambassadorId) {
      conditions.push(`aps.ambassador_id = $${paramIndex++}`);
      values.push(params.ambassadorId);
    }
    if (params.payPeriodId) {
      conditions.push(`aps.pay_period_id = $${paramIndex++}`);
      values.push(params.payPeriodId);
    }
    if (params.status) {
      conditions.push(`aps.status = $${paramIndex++}`);
      values.push(params.status);
    }
    if (params.fromDate) {
      conditions.push(`pp.period_start >= $${paramIndex++}`);
      values.push(params.fromDate);
    }
    if (params.toDate) {
      conditions.push(`pp.period_end <= $${paramIndex++}`);
      values.push(params.toDate);
    }
    if (params.minAmount !== undefined) {
      conditions.push(`aps.net_pay >= $${paramIndex++}`);
      values.push(params.minAmount);
    }
    if (params.maxAmount !== undefined) {
      conditions.push(`aps.net_pay <= $${paramIndex++}`);
      values.push(params.maxAmount);
    }

    const whereClause = conditions.join(' AND ');
    const limit = params.limit || 50;
    const offset = params.offset || 0;

    const [statements, countResult] = await Promise.all([
      db.queryMany<AmbassadorPayStatementWithDetails>(
        `SELECT 
          aps.*,
          CONCAT(a.first_name, ' ', a.last_name) as ambassador_name,
          a.email as ambassador_email,
          pp.period_start,
          pp.period_end,
          (SELECT COUNT(*) FROM pay_statement_line_items WHERE statement_id = aps.id) as line_item_count,
          (SELECT COUNT(*) FROM statement_payment_history WHERE statement_id = aps.id) as payment_count
         FROM ambassador_pay_statements aps
         JOIN ambassadors a ON a.id = aps.ambassador_id
         JOIN pay_periods pp ON pp.id = aps.pay_period_id
         WHERE ${whereClause}
         ORDER BY pp.period_start DESC, aps.net_pay DESC
         LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
        [...values, limit, offset]
      ),
      db.queryOne<{ count: string }>(
        `SELECT COUNT(*) as count
         FROM ambassador_pay_statements aps
         JOIN pay_periods pp ON pp.id = aps.pay_period_id
         WHERE ${whereClause}`,
        values
      ),
    ]);

    return {
      statements,
      total: parseInt(countResult?.count || '0'),
    };
  }

  /**
   * Update statement status
   */
  async updateStatementStatus(id: string, status: PayStatementStatus): Promise<AmbassadorPayStatement | null> {
    const updates: Record<string, unknown> = { status };
    
    if (status === 'paid') {
      updates.paid_at = new Date();
    }

    return db.queryOne<AmbassadorPayStatement>(
      `UPDATE ambassador_pay_statements 
       SET status = $1, paid_at = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [status, status === 'paid' ? new Date() : null, id]
    );
  }

  /**
   * Recalculate statement totals from line items
   */
  async recalculateTotals(statementId: string): Promise<AmbassadorPayStatement | null> {
    const totals = await db.queryOne<{
      earnings: string;
      deductions: string;
    }>(
      `SELECT 
        COALESCE(SUM(CASE WHEN type IN ('earning', 'bonus') THEN amount ELSE 0 END), 0) as earnings,
        COALESCE(SUM(CASE WHEN type = 'deduction' THEN amount ELSE 0 END), 0) as deductions
       FROM pay_statement_line_items
       WHERE statement_id = $1`,
      [statementId]
    );

    const grossPay = parseFloat(totals?.earnings || '0');
    const deductions = parseFloat(totals?.deductions || '0');
    const netPay = grossPay - deductions;

    return db.queryOne<AmbassadorPayStatement>(
      `UPDATE ambassador_pay_statements 
       SET gross_pay = $1, deductions = $2, net_pay = $3, updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [grossPay, deductions, netPay, statementId]
    );
  }

  // ==================== LINE ITEMS ====================

  /**
   * Add line item to statement
   */
  async addLineItem(input: PayStatementLineItemInput): Promise<PayStatementLineItem> {
    const result = await db.queryOne<PayStatementLineItem>(
      `INSERT INTO pay_statement_line_items (statement_id, type, description, amount, source_type, source_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.statementId,
        input.type,
        input.description,
        input.amount,
        input.sourceType,
        input.sourceId,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ]
    );

    // Recalculate totals
    await this.recalculateTotals(input.statementId);

    logger.info({ lineItemId: result?.id, statementId: input.statementId, type: input.type }, 'Line item added');
    return result!;
  }

  /**
   * Get line items for statement
   */
  async getLineItems(statementId: string): Promise<PayStatementLineItem[]> {
    return db.queryMany<PayStatementLineItem>(
      `SELECT * FROM pay_statement_line_items
       WHERE statement_id = $1
       ORDER BY type, created_at`,
      [statementId]
    );
  }

  /**
   * Search line items
   */
  async searchLineItems(params: LineItemSearchParams): Promise<PayStatementLineItem[]> {
    const conditions: string[] = ['1=1'];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (params.statementId) {
      conditions.push(`statement_id = $${paramIndex++}`);
      values.push(params.statementId);
    }
    if (params.type) {
      conditions.push(`type = $${paramIndex++}`);
      values.push(params.type);
    }
    if (params.sourceType) {
      conditions.push(`source_type = $${paramIndex++}`);
      values.push(params.sourceType);
    }
    if (params.sourceId) {
      conditions.push(`source_id = $${paramIndex++}`);
      values.push(params.sourceId);
    }

    const limit = params.limit || 100;
    const offset = params.offset || 0;

    return db.queryMany<PayStatementLineItem>(
      `SELECT * FROM pay_statement_line_items
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...values, limit, offset]
    );
  }

  /**
   * Delete line item
   */
  async deleteLineItem(id: string): Promise<boolean> {
    const item = await db.queryOne<{ statement_id: string }>(
      'SELECT statement_id FROM pay_statement_line_items WHERE id = $1',
      [id]
    );

    if (!item) return false;

    const result = await db.query(
      'DELETE FROM pay_statement_line_items WHERE id = $1',
      [id]
    );

    if ((result.rowCount ?? 0) > 0) {
      await this.recalculateTotals(item.statement_id);
      logger.info({ lineItemId: id }, 'Line item deleted');
      return true;
    }

    return false;
  }

  /**
   * Bulk add line items
   */
  async bulkAddLineItems(items: PayStatementLineItemInput[]): Promise<{
    success: number;
    failed: number;
    statementIds: Set<string>;
  }> {
    let success = 0;
    let failed = 0;
    const statementIds = new Set<string>();

    for (const item of items) {
      try {
        await db.query(
          `INSERT INTO pay_statement_line_items (statement_id, type, description, amount, source_type, source_id, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            item.statementId,
            item.type,
            item.description,
            item.amount,
            item.sourceType,
            item.sourceId,
            item.metadata ? JSON.stringify(item.metadata) : null,
          ]
        );
        statementIds.add(item.statementId);
        success++;
      } catch (error) {
        failed++;
        logger.error({ error, item }, 'Failed to add line item');
      }
    }

    // Recalculate all affected statements
    for (const statementId of Array.from(statementIds)) {
      await this.recalculateTotals(statementId);
    }

    return { success, failed, statementIds };
  }

  // ==================== PAYMENT HISTORY ====================

  /**
   * Record payment attempt
   */
  async recordPayment(input: PaymentHistoryInput): Promise<PaymentHistory> {
    const result = await db.queryOne<PaymentHistory>(
      `INSERT INTO statement_payment_history (statement_id, amount, method, status, external_reference, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        input.statementId,
        input.amount,
        input.method,
        input.status || 'pending',
        input.externalReference,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ]
    );

    logger.info({ paymentId: result?.id, statementId: input.statementId }, 'Payment recorded');
    return result!;
  }

  /**
   * Update payment status
   */
  async updatePaymentStatus(
    paymentId: string,
    status: PaymentHistory['status'],
    failureReason?: string
  ): Promise<PaymentHistory | null> {
    const processedAt = status === 'completed' ? new Date() : null;

    return db.queryOne<PaymentHistory>(
      `UPDATE statement_payment_history 
       SET status = $1, processed_at = $2, failure_reason = $3
       WHERE id = $4
       RETURNING *`,
      [status, processedAt, failureReason, paymentId]
    );
  }

  /**
   * Get payment history for statement
   */
  async getPaymentHistory(statementId: string): Promise<PaymentHistory[]> {
    return db.queryMany<PaymentHistory>(
      `SELECT * FROM statement_payment_history
       WHERE statement_id = $1
       ORDER BY created_at DESC`,
      [statementId]
    );
  }

  /**
   * Get payment history for ambassador
   */
  async getAmbassadorPaymentHistory(ambassadorId: string, limit = 50): Promise<(PaymentHistory & {
    periodStart: Date;
    periodEnd: Date;
  })[]> {
    return db.queryMany(
      `SELECT sph.*, pp.period_start, pp.period_end
       FROM statement_payment_history sph
       JOIN ambassador_pay_statements aps ON aps.id = sph.statement_id
       JOIN pay_periods pp ON pp.id = aps.pay_period_id
       WHERE aps.ambassador_id = $1
       ORDER BY sph.created_at DESC
       LIMIT $2`,
      [ambassadorId, limit]
    );
  }

  // ==================== RATE HISTORY ====================

  /**
   * Set pay rate for ambassador
   */
  async setPayRate(input: PayRateHistoryInput, changedBy?: string): Promise<PayRateHistory> {
    // End any existing rate of the same type
    await db.query(
      `UPDATE pay_rate_history 
       SET end_date = $1
       WHERE ambassador_id = $2 AND rate_type = $3 AND end_date IS NULL`,
      [input.effectiveDate, input.ambassadorId, input.rateType]
    );

    const result = await db.queryOne<PayRateHistory>(
      `INSERT INTO pay_rate_history (ambassador_id, rate_type, rate_amount, effective_date, end_date, reason, changed_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.ambassadorId,
        input.rateType,
        input.rateAmount,
        input.effectiveDate,
        input.endDate,
        input.reason,
        changedBy,
      ]
    );

    logger.info({ rateId: result?.id, ambassadorId: input.ambassadorId, rateType: input.rateType }, 'Pay rate set');
    return result!;
  }

  /**
   * Get current rate for ambassador
   */
  async getCurrentRate(ambassadorId: string, rateType: RateType): Promise<PayRateHistory | null> {
    return db.queryOne<PayRateHistory>(
      `SELECT * FROM pay_rate_history
       WHERE ambassador_id = $1 AND rate_type = $2
       AND effective_date <= CURRENT_DATE
       AND (end_date IS NULL OR end_date >= CURRENT_DATE)
       ORDER BY effective_date DESC
       LIMIT 1`,
      [ambassadorId, rateType]
    );
  }

  /**
   * Get rate history for ambassador
   */
  async getRateHistory(ambassadorId: string): Promise<PayRateHistory[]> {
    return db.queryMany<PayRateHistory>(
      `SELECT * FROM pay_rate_history
       WHERE ambassador_id = $1
       ORDER BY effective_date DESC, rate_type`,
      [ambassadorId]
    );
  }

  /**
   * Get effective rate at a specific date
   */
  async getRateAtDate(ambassadorId: string, rateType: RateType, date: string): Promise<PayRateHistory | null> {
    return db.queryOne<PayRateHistory>(
      `SELECT * FROM pay_rate_history
       WHERE ambassador_id = $1 AND rate_type = $2
       AND effective_date <= $3
       AND (end_date IS NULL OR end_date >= $3)
       ORDER BY effective_date DESC
       LIMIT 1`,
      [ambassadorId, rateType, date]
    );
  }

  // ==================== CALCULATION ====================

  /**
   * Calculate statement for ambassador in pay period
   */
  async calculateStatement(ambassadorId: string, payPeriodId: string): Promise<StatementCalculation> {
    // Get or create statement
    const statement = await this.createStatement(ambassadorId, payPeriodId);

    // Get pay period dates
    const period = await db.queryOne<{ period_start: Date; period_end: Date }>(
      'SELECT period_start, period_end FROM pay_periods WHERE id = $1',
      [payPeriodId]
    );

    if (!period) throw new Error('Pay period not found');

    // Clear existing line items for recalculation
    await db.query(
      'DELETE FROM pay_statement_line_items WHERE statement_id = $1',
      [statement.id]
    );

    const lineItems: PayStatementLineItem[] = [];
    const earnings = { signups: 0, hourly: 0, events: 0, bonuses: 0, other: 0, total: 0 };
    const deductions = { advances: 0, corrections: 0, other: 0, total: 0 };

    // Get current rates
    const perSignupRate = await this.getCurrentRate(ambassadorId, 'per_signup');
    const hourlyRate = await this.getCurrentRate(ambassadorId, 'hourly');

    // Calculate signup earnings
    const signups = await db.queryMany<{ id: string; created_at: Date }>(
      `SELECT id, created_at FROM signups
       WHERE ambassador_id = $1 
       AND created_at BETWEEN $2 AND $3
       AND validation_status = 'valid'`,
      [ambassadorId, period.period_start, period.period_end]
    );

    if (signups.length > 0 && perSignupRate) {
      const signupAmount = signups.length * perSignupRate.rateAmount;
      earnings.signups = signupAmount;

      const item = await this.addLineItem({
        statementId: statement.id,
        type: 'earning',
        description: `${signups.length} valid signup(s) @ $${perSignupRate.rateAmount}/ea`,
        amount: signupAmount,
        sourceType: 'signup',
        metadata: { signupCount: signups.length, rate: perSignupRate.rateAmount },
      });
      lineItems.push(item);
    }

    // Calculate hourly earnings from assignments
    if (hourlyRate) {
      const assignments = await db.queryMany<{ id: string; hours_worked: string; event_name: string }>(
        `SELECT ea.id, ea.hours_worked, e.name as event_name
         FROM event_assignments ea
         JOIN events e ON e.id = ea.event_id
         WHERE ea.ambassador_id = $1
         AND ea.check_out_time BETWEEN $2 AND $3
         AND ea.hours_worked IS NOT NULL`,
        [ambassadorId, period.period_start, period.period_end]
      );

      for (const assignment of assignments) {
        const hours = parseFloat(assignment.hours_worked);
        const amount = hours * hourlyRate.rateAmount;
        earnings.hourly += amount;

        const item = await this.addLineItem({
          statementId: statement.id,
          type: 'earning',
          description: `${hours.toFixed(1)} hrs @ $${hourlyRate.rateAmount}/hr - ${assignment.event_name}`,
          amount,
          sourceType: 'event_assignment',
          sourceId: assignment.id,
          metadata: { hours, rate: hourlyRate.rateAmount },
        });
        lineItems.push(item);
      }
    }

    // Check for bonus tiers
    const totalSignups = signups.length;
    const bonus = await db.queryOne<{ bonus_amount: number; min_signups: number }>(
      `SELECT bonus_amount, min_signups FROM bonus_rules
       WHERE min_signups <= $1 AND is_active = true
       ORDER BY min_signups DESC LIMIT 1`,
      [totalSignups]
    );

    if (bonus && bonus.bonus_amount > 0) {
      earnings.bonuses = bonus.bonus_amount;

      const item = await this.addLineItem({
        statementId: statement.id,
        type: 'bonus',
        description: `Tier bonus for ${totalSignups} signups (${bonus.min_signups}+ tier)`,
        amount: bonus.bonus_amount,
        sourceType: 'bonus_rule',
        metadata: { signupCount: totalSignups, tier: bonus.min_signups },
      });
      lineItems.push(item);
    }

    // Check for manual adjustments (from payroll_adjustments table)
    const adjustments = await db.queryMany<{
      id: string;
      adjustment_type: string;
      amount: number;
      reason: string;
    }>(
      `SELECT id, adjustment_type, amount, reason FROM payroll_adjustments
       WHERE statement_id = $1`,
      [statement.id]
    );

    for (const adj of adjustments) {
      if (adj.adjustment_type === 'deduction') {
        deductions.corrections += adj.amount;
        const item = await this.addLineItem({
          statementId: statement.id,
          type: 'deduction',
          description: adj.reason || 'Deduction',
          amount: adj.amount,
          sourceType: 'manual_adjustment',
          sourceId: adj.id,
        });
        lineItems.push(item);
      } else {
        earnings.other += adj.amount;
        const item = await this.addLineItem({
          statementId: statement.id,
          type: adj.adjustment_type === 'bonus' ? 'bonus' : 'earning',
          description: adj.reason || 'Adjustment',
          amount: adj.amount,
          sourceType: 'manual_adjustment',
          sourceId: adj.id,
        });
        lineItems.push(item);
      }
    }

    earnings.total = earnings.signups + earnings.hourly + earnings.events + earnings.bonuses + earnings.other;
    deductions.total = deductions.advances + deductions.corrections + deductions.other;

    const grossPay = earnings.total;
    const netPay = grossPay - deductions.total;

    // Update statement totals
    await this.recalculateTotals(statement.id);

    return {
      earnings,
      deductions,
      grossPay,
      netPay,
      lineItems,
    };
  }

  // ==================== STATS & SUMMARIES ====================

  /**
   * Get overall stats
   */
  async getStats(payPeriodId?: string): Promise<PayStatementStats> {
    const periodCondition = payPeriodId ? 'WHERE pay_period_id = $1' : '';
    const params = payPeriodId ? [payPeriodId] : [];

    const result = await db.queryOne<{
      total: string;
      gross: string;
      deductions: string;
      net: string;
      avg: string;
    }>(
      `SELECT 
        COUNT(*) as total,
        COALESCE(SUM(gross_pay), 0) as gross,
        COALESCE(SUM(deductions), 0) as deductions,
        COALESCE(SUM(net_pay), 0) as net,
        COALESCE(AVG(net_pay), 0) as avg
       FROM ambassador_pay_statements ${periodCondition}`,
      params
    );

    const statusCounts = await db.queryMany<{ status: PayStatementStatus; count: string }>(
      `SELECT status, COUNT(*) as count
       FROM ambassador_pay_statements ${periodCondition}
       GROUP BY status`,
      params
    );

    const byStatus = {} as Record<PayStatementStatus, number>;
    for (const row of statusCounts) {
      byStatus[row.status] = parseInt(row.count);
    }

    return {
      totalStatements: parseInt(result?.total || '0'),
      totalGrossPay: parseFloat(result?.gross || '0'),
      totalDeductions: parseFloat(result?.deductions || '0'),
      totalNetPay: parseFloat(result?.net || '0'),
      byStatus,
      avgPaymentAmount: parseFloat(result?.avg || '0'),
    };
  }

  /**
   * Get ambassador pay summary
   */
  async getAmbassadorSummary(ambassadorId: string): Promise<AmbassadorPaySummary | null> {
    const summary = await db.queryOne<{
      ambassador_name: string;
      total_gross: string;
      total_deductions: string;
      total_net: string;
      statement_count: string;
      last_paid: Date;
    }>(
      `SELECT 
        CONCAT(a.first_name, ' ', a.last_name) as ambassador_name,
        COALESCE(SUM(aps.gross_pay), 0) as total_gross,
        COALESCE(SUM(aps.deductions), 0) as total_deductions,
        COALESCE(SUM(aps.net_pay), 0) as total_net,
        COUNT(aps.id) as statement_count,
        MAX(aps.paid_at) as last_paid
       FROM ambassadors a
       LEFT JOIN ambassador_pay_statements aps ON aps.ambassador_id = a.id
       WHERE a.id = $1
       GROUP BY a.id, a.first_name, a.last_name`,
      [ambassadorId]
    );

    if (!summary) return null;

    const currentRate = await this.getCurrentRate(ambassadorId, 'per_signup');

    return {
      ambassadorId,
      ambassadorName: summary.ambassador_name,
      totalEarnings: parseFloat(summary.total_gross),
      totalDeductions: parseFloat(summary.total_deductions),
      totalNetPay: parseFloat(summary.total_net),
      statementCount: parseInt(summary.statement_count),
      lastPaidAt: summary.last_paid,
      currentRate: currentRate || undefined,
    };
  }
}

export const payStatementService = new PayStatementService();
