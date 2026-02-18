/**
 * Payroll Service
 * WO-48: Payroll review and adjustment workflow
 * WO-49: Payroll API + QuickBooks integration
 */

import { db } from './database.js';
import { logger } from '../utils/logger.js';
import { eventPublisher } from './eventPublisher.js';

interface PayPeriod {
  id: string;
  periodStart: Date;
  periodEnd: Date;
  status: 'open' | 'calculating' | 'review' | 'approved' | 'processing' | 'completed';
  totalSignups: number;
  totalAmount: number;
  createdAt: Date;
}

interface PayStatement {
  id: string;
  payPeriodId: string;
  ambassadorId: string;
  baseAmount: number;
  bonusAmount: number;
  deductions: number;
  totalAmount: number;
  signupCount: number;
  status: string;
}

interface PayrollAdjustment {
  statementId: string;
  adjustmentType: 'bonus' | 'deduction' | 'correction';
  amount: number;
  reason: string;
}

class PayrollService {
  /**
   * Get or create current pay period
   */
  async getCurrentPayPeriod(): Promise<PayPeriod> {
    let period = await db.queryOne<PayPeriod>(
      "SELECT * FROM pay_periods WHERE status = 'open' ORDER BY period_start DESC LIMIT 1"
    );

    if (!period) {
      // Create new bi-weekly pay period
      const now = new Date();
      const dayOfWeek = now.getDay();
      const startDate = new Date(now);
      startDate.setDate(now.getDate() - dayOfWeek); // Start of week
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 13); // 2 weeks

      period = await db.queryOne<PayPeriod>(
        `INSERT INTO pay_periods (period_start, period_end, status)
         VALUES ($1, $2, 'open')
         RETURNING *`,
        [startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]
      );
    }

    return period!;
  }

  /**
   * Get pay period by ID
   */
  async getPayPeriod(id: string): Promise<PayPeriod | null> {
    return db.queryOne<PayPeriod>('SELECT * FROM pay_periods WHERE id = $1', [id]);
  }

  /**
   * List pay periods
   */
  async listPayPeriods(limit = 12): Promise<PayPeriod[]> {
    return db.queryMany<PayPeriod>(
      'SELECT * FROM pay_periods ORDER BY period_start DESC LIMIT $1',
      [limit]
    );
  }

  /**
   * Calculate payroll for pay period
   */
  async calculatePayroll(payPeriodId: string, calculatedBy?: string): Promise<{
    statements: number;
    totalAmount: number;
  }> {
    const period = await this.getPayPeriod(payPeriodId);
    if (!period) throw new Error('Pay period not found');

    // Update status to calculating
    await db.query(
      "UPDATE pay_periods SET status = 'calculating' WHERE id = $1",
      [payPeriodId]
    );

    // Get all ambassadors with signups in this period
    const ambassadorSignups = await db.queryMany<{
      ambassador_id: string;
      signup_count: string;
      per_signup_rate: number;
      hourly_rate: number;
      compensation_type: string;
    }>(
      `SELECT 
        a.id as ambassador_id,
        COUNT(s.id) as signup_count,
        a.per_signup_rate,
        a.hourly_rate,
        a.compensation_type
       FROM ambassadors a
       LEFT JOIN signups s ON s.ambassador_id = a.id 
         AND s.created_at BETWEEN $1 AND $2
         AND s.validation_status = 'valid'
       WHERE a.status = 'active'
       GROUP BY a.id, a.per_signup_rate, a.hourly_rate, a.compensation_type
       HAVING COUNT(s.id) > 0`,
      [period.periodStart, period.periodEnd]
    );

    let totalStatements = 0;
    let totalAmount = 0;

    for (const amb of ambassadorSignups) {
      const signupCount = parseInt(amb.signup_count);
      let baseAmount = 0;

      // Calculate based on compensation type
      if (amb.compensation_type === 'per_signup') {
        baseAmount = signupCount * (amb.per_signup_rate || 25);
      } else if (amb.compensation_type === 'hourly') {
        // Get hours worked from assignments
        const hours = await db.queryOne<{ total_hours: string }>(
          `SELECT SUM(hours_worked) as total_hours
           FROM event_assignments
           WHERE ambassador_id = $1
           AND check_out_time BETWEEN $2 AND $3`,
          [amb.ambassador_id, period.periodStart, period.periodEnd]
        );
        baseAmount = parseFloat(hours?.total_hours || '0') * (amb.hourly_rate || 15);
      } else if (amb.compensation_type === 'hybrid') {
        // Both per-signup and hourly
        const signupPay = signupCount * (amb.per_signup_rate || 25);
        const hours = await db.queryOne<{ total_hours: string }>(
          `SELECT SUM(hours_worked) as total_hours
           FROM event_assignments
           WHERE ambassador_id = $1
           AND check_out_time BETWEEN $2 AND $3`,
          [amb.ambassador_id, period.periodStart, period.periodEnd]
        );
        const hourlyPay = parseFloat(hours?.total_hours || '0') * (amb.hourly_rate || 15);
        baseAmount = signupPay + hourlyPay;
      }

      // Check for bonuses (e.g., tier bonuses)
      let bonusAmount = 0;
      const bonusRules = await db.queryMany<{ min_signups: number; bonus_amount: number }>(
        `SELECT min_signups, bonus_amount FROM bonus_rules
         WHERE min_signups <= $1 AND is_active = true
         ORDER BY min_signups DESC LIMIT 1`,
        [signupCount]
      );
      if (bonusRules.length > 0) {
        bonusAmount = bonusRules[0].bonus_amount;
      }

      // Create or update pay statement
      await db.query(
        `INSERT INTO pay_statements (
          pay_period_id, ambassador_id, base_amount, bonus_amount, 
          deductions, total_amount, signup_count, status
        ) VALUES ($1, $2, $3, $4, 0, $5, $6, 'pending')
        ON CONFLICT (pay_period_id, ambassador_id) 
        DO UPDATE SET 
          base_amount = $3, bonus_amount = $4, 
          total_amount = $5, signup_count = $6,
          updated_at = NOW()`,
        [
          payPeriodId,
          amb.ambassador_id,
          baseAmount,
          bonusAmount,
          baseAmount + bonusAmount,
          signupCount,
        ]
      );

      totalStatements++;
      totalAmount += baseAmount + bonusAmount;
    }

    // Update pay period totals and status
    await db.query(
      `UPDATE pay_periods SET 
        status = 'review', 
        total_signups = (SELECT SUM(signup_count) FROM pay_statements WHERE pay_period_id = $1),
        total_amount = (SELECT SUM(total_amount) FROM pay_statements WHERE pay_period_id = $1)
       WHERE id = $1`,
      [payPeriodId]
    );

    // Publish event
    await eventPublisher.publish({
      type: 'payroll.calculated',
      userId: calculatedBy,
      payload: {
        payPeriodId,
        totalAmount,
        totalSignups: ambassadorSignups.reduce((sum, a) => sum + parseInt(a.signup_count), 0),
        ambassadorCount: totalStatements,
      },
    } as any);

    logger.info({ payPeriodId, totalStatements, totalAmount }, 'Payroll calculated');

    return { statements: totalStatements, totalAmount };
  }

  /**
   * Get statements for pay period
   */
  async getStatements(payPeriodId: string): Promise<(PayStatement & { 
    ambassadorName: string;
    email: string;
  })[]> {
    return db.queryMany(
      `SELECT ps.*, 
        CONCAT(a.first_name, ' ', a.last_name) as ambassador_name,
        a.email
       FROM pay_statements ps
       JOIN ambassadors a ON a.id = ps.ambassador_id
       WHERE ps.pay_period_id = $1
       ORDER BY ps.total_amount DESC`,
      [payPeriodId]
    );
  }

  /**
   * Add adjustment to statement
   */
  async addAdjustment(
    statementId: string,
    adjustment: PayrollAdjustment,
    adjustedBy?: string
  ): Promise<PayStatement | null> {
    // Record adjustment
    await db.query(
      `INSERT INTO payroll_adjustments (
        statement_id, adjustment_type, amount, reason, created_by
      ) VALUES ($1, $2, $3, $4, $5)`,
      [statementId, adjustment.adjustmentType, adjustment.amount, adjustment.reason, adjustedBy]
    );

    // Update statement totals
    const sign = adjustment.adjustmentType === 'deduction' ? -1 : 1;
    
    if (adjustment.adjustmentType === 'bonus') {
      await db.query(
        'UPDATE pay_statements SET bonus_amount = bonus_amount + $1, total_amount = total_amount + $1 WHERE id = $2',
        [adjustment.amount, statementId]
      );
    } else if (adjustment.adjustmentType === 'deduction') {
      await db.query(
        'UPDATE pay_statements SET deductions = deductions + $1, total_amount = total_amount - $1 WHERE id = $2',
        [adjustment.amount, statementId]
      );
    } else {
      // Correction - add/subtract from base
      await db.query(
        'UPDATE pay_statements SET base_amount = base_amount + $1, total_amount = total_amount + $1 WHERE id = $2',
        [sign * adjustment.amount, statementId]
      );
    }

    logger.info({ statementId, adjustment }, 'Payroll adjustment added');

    return db.queryOne<PayStatement>('SELECT * FROM pay_statements WHERE id = $1', [statementId]);
  }

  /**
   * Approve pay period
   */
  async approvePeriod(payPeriodId: string, approvedBy: string): Promise<PayPeriod | null> {
    // Update all statements to approved
    await db.query(
      "UPDATE pay_statements SET status = 'approved' WHERE pay_period_id = $1",
      [payPeriodId]
    );

    // Update period status
    const result = await db.queryOne<PayPeriod>(
      `UPDATE pay_periods SET 
        status = 'approved', 
        approved_by = $1, 
        approved_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [approvedBy, payPeriodId]
    );

    logger.info({ payPeriodId, approvedBy }, 'Pay period approved');
    return result;
  }

  /**
   * Process payments (integrate with QuickBooks)
   */
  async processPayments(payPeriodId: string, processedBy?: string): Promise<{
    success: number;
    failed: number;
    quickbooksRef?: string;
  }> {
    const period = await this.getPayPeriod(payPeriodId);
    if (!period || period.status !== 'approved') {
      throw new Error('Pay period must be approved before processing');
    }

    // Update status to processing
    await db.query(
      "UPDATE pay_periods SET status = 'processing' WHERE id = $1",
      [payPeriodId]
    );

    const statements = await this.getStatements(payPeriodId);
    let success = 0;
    let failed = 0;

    // Get QuickBooks credentials
    const qbCreds = await db.queryOne<{ credentials_encrypted: string }>(
      "SELECT credentials_encrypted FROM integration_credentials WHERE integration_type = 'quickbooks' AND is_active = true"
    );

    for (const statement of statements) {
      try {
        // In production, would create QuickBooks bill/payment here
        // For now, just mark as paid
        await db.query(
          "UPDATE pay_statements SET status = 'paid', paid_at = NOW() WHERE id = $1",
          [statement.id]
        );

        // Record payment
        await db.query(
          `INSERT INTO payment_history (
            ambassador_id, pay_statement_id, amount, payment_method, status
          ) VALUES ($1, $2, $3, 'direct_deposit', 'completed')`,
          [statement.ambassadorId, statement.id, statement.totalAmount]
        );

        success++;
      } catch (error) {
        logger.error({ error, statementId: statement.id }, 'Payment processing failed');
        await db.query(
          "UPDATE pay_statements SET status = 'failed' WHERE id = $1",
          [statement.id]
        );
        failed++;
      }
    }

    // Update period status
    await db.query(
      `UPDATE pay_periods SET 
        status = 'completed', 
        processed_at = NOW()
       WHERE id = $1`,
      [payPeriodId]
    );

    // Publish event
    await eventPublisher.publish({
      type: 'payroll.processed',
      userId: processedBy,
      payload: {
        payPeriodId,
        totalAmount: period.totalAmount,
        ambassadorCount: statements.length,
      },
    } as any);

    logger.info({ payPeriodId, success, failed }, 'Payments processed');

    return { success, failed };
  }

  /**
   * Get ambassador payment history
   */
  async getAmbassadorPayments(ambassadorId: string, limit = 12): Promise<any[]> {
    return db.queryMany(
      `SELECT ph.*, ps.pay_period_id, pp.period_start, pp.period_end
       FROM payment_history ph
       JOIN pay_statements ps ON ps.id = ph.pay_statement_id
       JOIN pay_periods pp ON pp.id = ps.pay_period_id
       WHERE ph.ambassador_id = $1
       ORDER BY ph.created_at DESC
       LIMIT $2`,
      [ambassadorId, limit]
    );
  }

  /**
   * Get payroll summary stats
   */
  async getSummaryStats(): Promise<{
    currentPeriod: PayPeriod | null;
    pendingReview: number;
    totalPaidThisYear: number;
    avgPerAmbassador: number;
  }> {
    const [currentPeriod, pendingReview, totalPaid, avgPay] = await Promise.all([
      this.getCurrentPayPeriod(),
      db.queryOne<{ count: string }>(
        "SELECT COUNT(*) as count FROM pay_periods WHERE status = 'review'"
      ),
      db.queryOne<{ total: string }>(
        `SELECT SUM(total_amount) as total FROM pay_periods 
         WHERE status = 'completed' AND EXTRACT(YEAR FROM period_start) = EXTRACT(YEAR FROM NOW())`
      ),
      db.queryOne<{ avg: string }>(
        `SELECT AVG(total_amount) as avg FROM pay_statements 
         WHERE status = 'paid' AND created_at > NOW() - INTERVAL '90 days'`
      ),
    ]);

    return {
      currentPeriod,
      pendingReview: parseInt(pendingReview?.count || '0'),
      totalPaidThisYear: parseFloat(totalPaid?.total || '0'),
      avgPerAmbassador: parseFloat(avgPay?.avg || '0'),
    };
  }
}

export const payrollService = new PayrollService();
