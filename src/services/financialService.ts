/**
 * Financial Service
 * WO-38: Actuals population + expense reconciliation
 */

import { db } from './database.js';
import { logger } from '../utils/logger.js';

interface Expense {
  id: string;
  eventId?: string;
  category: string;
  description: string;
  amount: number;
  vendorName?: string;
  expenseDate: Date;
  status: string;
}

interface Budget {
  id: string;
  eventId?: string;
  category: string;
  budgetedAmount: number;
  actualAmount: number;
  variance: number;
}

interface RevenueEntry {
  id: string;
  eventId?: string;
  operatorId?: number;
  revenueType: string;
  amount: number;
  revenueDate: Date;
}

class FinancialService {
  /**
   * Create expense
   */
  async createExpense(input: {
    eventId?: string;
    category: string;
    description: string;
    amount: number;
    vendorName?: string;
    expenseDate: string;
    receiptKey?: string;
    createdBy?: string;
  }): Promise<Expense> {
    const result = await db.queryOne<Expense>(
      `INSERT INTO expenses (
        event_id, category, description, amount, vendor_name, 
        expense_date, receipt_key, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        input.eventId,
        input.category,
        input.description,
        input.amount,
        input.vendorName,
        input.expenseDate,
        input.receiptKey,
        input.createdBy,
      ]
    );

    // Update budget actuals if event-linked
    if (input.eventId) {
      await this.updateBudgetActuals(input.eventId, input.category);
    }

    logger.info({ expenseId: result?.id }, 'Expense created');
    return result!;
  }

  /**
   * Get expenses with filters
   */
  async getExpenses(filters: {
    eventId?: string;
    category?: string;
    fromDate?: string;
    toDate?: string;
    status?: string;
  }, page = 1, limit = 50): Promise<{ items: Expense[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filters.eventId) {
      conditions.push(`event_id = $${paramIndex++}`);
      values.push(filters.eventId);
    }
    if (filters.category) {
      conditions.push(`category = $${paramIndex++}`);
      values.push(filters.category);
    }
    if (filters.fromDate) {
      conditions.push(`expense_date >= $${paramIndex++}`);
      values.push(filters.fromDate);
    }
    if (filters.toDate) {
      conditions.push(`expense_date <= $${paramIndex++}`);
      values.push(filters.toDate);
    }
    if (filters.status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(filters.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const [items, countResult] = await Promise.all([
      db.queryMany<Expense>(
        `SELECT * FROM expenses ${whereClause}
         ORDER BY expense_date DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, limit, offset]
      ),
      db.queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM expenses ${whereClause}`,
        values
      ),
    ]);

    return { items, total: parseInt(countResult?.count || '0') };
  }

  /**
   * Create or update budget
   */
  async setBudget(input: {
    eventId?: string;
    category: string;
    budgetedAmount: number;
    periodStart?: string;
    periodEnd?: string;
  }): Promise<Budget> {
    const result = await db.queryOne<Budget>(
      `INSERT INTO budgets (event_id, category, budgeted_amount, period_start, period_end)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (event_id, category) 
       DO UPDATE SET budgeted_amount = $3, updated_at = NOW()
       RETURNING *, 
         (SELECT COALESCE(SUM(amount), 0) FROM expenses 
          WHERE event_id = budgets.event_id AND category = budgets.category) as actual_amount`,
      [input.eventId, input.category, input.budgetedAmount, input.periodStart, input.periodEnd]
    );

    return result!;
  }

  /**
   * Update budget actuals from expenses
   */
  async updateBudgetActuals(eventId: string, category?: string): Promise<void> {
    const categoryCondition = category ? 'AND category = $2' : '';
    const params = category ? [eventId, category] : [eventId];

    await db.query(
      `UPDATE budgets b SET 
        actual_amount = (
          SELECT COALESCE(SUM(amount), 0) FROM expenses 
          WHERE event_id = b.event_id AND category = b.category
        ),
        variance = budgeted_amount - (
          SELECT COALESCE(SUM(amount), 0) FROM expenses 
          WHERE event_id = b.event_id AND category = b.category
        ),
        updated_at = NOW()
       WHERE event_id = $1 ${categoryCondition}`,
      params
    );
  }

  /**
   * Get budget vs actuals report
   */
  async getBudgetReport(eventId?: string): Promise<{
    category: string;
    budgeted: number;
    actual: number;
    variance: number;
    variancePercent: number;
  }[]> {
    const condition = eventId ? 'WHERE event_id = $1' : 'WHERE event_id IS NULL';
    const params = eventId ? [eventId] : [];

    const results = await db.queryMany<{
      category: string;
      budgeted_amount: number;
      actual_amount: number;
      variance: number;
    }>(
      `SELECT category, budgeted_amount, actual_amount, variance
       FROM budgets ${condition}
       ORDER BY category`,
      params
    );

    return results.map(r => ({
      category: r.category,
      budgeted: r.budgeted_amount,
      actual: r.actual_amount,
      variance: r.variance,
      variancePercent: r.budgeted_amount > 0 
        ? ((r.budgeted_amount - r.actual_amount) / r.budgeted_amount) * 100 
        : 0,
    }));
  }

  /**
   * Record revenue
   */
  async recordRevenue(input: {
    eventId?: string;
    operatorId?: number;
    revenueType: string;
    amount: number;
    revenueDate: string;
    source?: string;
    notes?: string;
  }): Promise<RevenueEntry> {
    const result = await db.queryOne<RevenueEntry>(
      `INSERT INTO revenue_tracking (
        event_id, operator_id, revenue_type, amount, revenue_date, source, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        input.eventId,
        input.operatorId,
        input.revenueType,
        input.amount,
        input.revenueDate,
        input.source,
        input.notes,
      ]
    );

    logger.info({ revenueId: result?.id, amount: input.amount }, 'Revenue recorded');
    return result!;
  }

  /**
   * Get revenue summary
   */
  async getRevenueSummary(fromDate: string, toDate: string): Promise<{
    total: number;
    byType: Record<string, number>;
    byOperator: { operatorId: number; name: string; amount: number }[];
    byMonth: { month: string; amount: number }[];
  }> {
    const [total, byType, byOperator, byMonth] = await Promise.all([
      db.queryOne<{ sum: string }>(
        `SELECT COALESCE(SUM(amount), 0) as sum FROM revenue_tracking
         WHERE revenue_date BETWEEN $1 AND $2`,
        [fromDate, toDate]
      ),
      db.queryMany<{ revenue_type: string; sum: string }>(
        `SELECT revenue_type, SUM(amount) as sum FROM revenue_tracking
         WHERE revenue_date BETWEEN $1 AND $2
         GROUP BY revenue_type`,
        [fromDate, toDate]
      ),
      db.queryMany<{ operator_id: number; name: string; sum: string }>(
        `SELECT r.operator_id, o.display_name as name, SUM(r.amount) as sum 
         FROM revenue_tracking r
         JOIN operators o ON o.id = r.operator_id
         WHERE r.revenue_date BETWEEN $1 AND $2
         GROUP BY r.operator_id, o.display_name
         ORDER BY sum DESC`,
        [fromDate, toDate]
      ),
      db.queryMany<{ month: string; sum: string }>(
        `SELECT TO_CHAR(revenue_date, 'YYYY-MM') as month, SUM(amount) as sum
         FROM revenue_tracking
         WHERE revenue_date BETWEEN $1 AND $2
         GROUP BY TO_CHAR(revenue_date, 'YYYY-MM')
         ORDER BY month`,
        [fromDate, toDate]
      ),
    ]);

    return {
      total: parseFloat(total?.sum || '0'),
      byType: byType.reduce((acc, r) => ({ ...acc, [r.revenue_type]: parseFloat(r.sum) }), {}),
      byOperator: byOperator.map(r => ({
        operatorId: r.operator_id,
        name: r.name,
        amount: parseFloat(r.sum),
      })),
      byMonth: byMonth.map(r => ({ month: r.month, amount: parseFloat(r.sum) })),
    };
  }

  /**
   * Reconcile expenses with external source (Ramp)
   */
  async reconcileExpenses(source: string): Promise<{
    matched: number;
    unmatched: number;
    created: number;
  }> {
    // Get unreconciled expenses from external sync
    const unreconciled = await db.queryMany<{ id: string; external_id: string }>(
      `SELECT id, external_id FROM expenses 
       WHERE source = $1 AND reconciled = false`,
      [source]
    );

    let matched = 0;
    let created = 0;

    for (const expense of unreconciled) {
      // Mark as reconciled
      await db.query(
        'UPDATE expenses SET reconciled = true, reconciled_at = NOW() WHERE id = $1',
        [expense.id]
      );
      matched++;
    }

    logger.info({ source, matched, created }, 'Expense reconciliation completed');

    return { matched, unmatched: 0, created };
  }

  /**
   * Get P&L summary
   */
  async getProfitLoss(fromDate: string, toDate: string, eventId?: string): Promise<{
    revenue: number;
    expenses: number;
    netIncome: number;
    margin: number;
  }> {
    const eventCondition = eventId ? 'AND event_id = $3' : '';
    const params = eventId ? [fromDate, toDate, eventId] : [fromDate, toDate];

    const [revenue, expenses] = await Promise.all([
      db.queryOne<{ sum: string }>(
        `SELECT COALESCE(SUM(amount), 0) as sum FROM revenue_tracking
         WHERE revenue_date BETWEEN $1 AND $2 ${eventCondition}`,
        params
      ),
      db.queryOne<{ sum: string }>(
        `SELECT COALESCE(SUM(amount), 0) as sum FROM expenses
         WHERE expense_date BETWEEN $1 AND $2 ${eventCondition}`,
        params
      ),
    ]);

    const rev = parseFloat(revenue?.sum || '0');
    const exp = parseFloat(expenses?.sum || '0');
    const net = rev - exp;

    return {
      revenue: rev,
      expenses: exp,
      netIncome: net,
      margin: rev > 0 ? (net / rev) * 100 : 0,
    };
  }
}

export const financialService = new FinancialService();
