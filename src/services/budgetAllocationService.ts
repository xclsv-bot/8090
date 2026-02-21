/**
 * Budget Allocation Service
 * WO-90: Budget allocation logic with category-based tracking
 */

import { db } from './database.js';
import { logger } from '../utils/logger.js';

// Types
export type BudgetCategory = 'payroll' | 'materials' | 'travel' | 'venue' | 'marketing' | 'software' | 'other';
export type ScopeType = 'event' | 'region' | 'period';

export interface BudgetAllocation {
  id: string;
  name: string;
  category: BudgetCategory;
  allocatedAmount: number;
  spentAmount: number;
  remainingAmount: number;
  scopeType: ScopeType;
  scopeId: string;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateBudgetAllocationInput {
  name: string;
  category: BudgetCategory;
  allocatedAmount: number;
  scopeType: ScopeType;
  scopeId: string;
  startDate: string;
  endDate: string;
}

export interface UpdateBudgetAllocationInput {
  name?: string;
  category?: BudgetCategory;
  allocatedAmount?: number;
  startDate?: string;
  endDate?: string;
}

export interface BudgetAllocationFilters {
  category?: BudgetCategory;
  scopeType?: ScopeType;
  scopeId?: string;
  startDate?: string;
  endDate?: string;
}

export interface CategorySummary {
  category: BudgetCategory;
  totalAllocated: number;
  totalSpent: number;
  totalRemaining: number;
  allocationCount: number;
  utilizationPercent: number;
}

export interface ScopeSummary {
  scopeType: ScopeType;
  scopeId: string;
  scopeName: string;
  totalAllocated: number;
  totalSpent: number;
  totalRemaining: number;
  utilizationPercent: number;
  categories: CategorySummary[];
}

class BudgetAllocationService {
  /**
   * Create a new budget allocation
   */
  async create(input: CreateBudgetAllocationInput): Promise<BudgetAllocation> {
    const result = await db.queryOne<{
      id: string;
      name: string;
      category: BudgetCategory;
      allocated_amount: number;
      spent_amount: number;
      scope_type: ScopeType;
      scope_id: string;
      start_date: Date;
      end_date: Date;
      created_at: Date;
      updated_at: Date;
    }>(
      `INSERT INTO budget_allocations (
        name, category, allocated_amount, spent_amount,
        scope_type, scope_id, start_date, end_date
      ) VALUES ($1, $2, $3, 0, $4, $5, $6, $7)
      RETURNING *`,
      [
        input.name,
        input.category,
        input.allocatedAmount,
        input.scopeType,
        input.scopeId,
        input.startDate,
        input.endDate,
      ]
    );

    if (!result) {
      throw new Error('Failed to create budget allocation');
    }

    logger.info({ allocationId: result.id, name: input.name, category: input.category }, 'Budget allocation created');

    return this.mapToAllocation(result);
  }

  /**
   * Get budget allocation by ID
   */
  async getById(id: string): Promise<BudgetAllocation | null> {
    const result = await db.queryOne<any>(
      `SELECT *, (allocated_amount - spent_amount) as remaining_amount
       FROM budget_allocations
       WHERE id = $1`,
      [id]
    );

    return result ? this.mapToAllocation(result) : null;
  }

  /**
   * List budget allocations with filters
   */
  async list(
    filters: BudgetAllocationFilters = {},
    page = 1,
    limit = 50
  ): Promise<{ items: BudgetAllocation[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filters.category) {
      conditions.push(`category = $${paramIndex++}`);
      values.push(filters.category);
    }
    if (filters.scopeType) {
      conditions.push(`scope_type = $${paramIndex++}`);
      values.push(filters.scopeType);
    }
    if (filters.scopeId) {
      conditions.push(`scope_id = $${paramIndex++}`);
      values.push(filters.scopeId);
    }
    if (filters.startDate) {
      conditions.push(`start_date >= $${paramIndex++}`);
      values.push(filters.startDate);
    }
    if (filters.endDate) {
      conditions.push(`end_date <= $${paramIndex++}`);
      values.push(filters.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const [items, countResult] = await Promise.all([
      db.queryMany<any>(
        `SELECT *, (allocated_amount - spent_amount) as remaining_amount
         FROM budget_allocations
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, limit, offset]
      ),
      db.queryOne<{ count: string }>(
        `SELECT COUNT(*) as count FROM budget_allocations ${whereClause}`,
        values
      ),
    ]);

    return {
      items: items.map(this.mapToAllocation),
      total: parseInt(countResult?.count || '0'),
    };
  }

  /**
   * Update budget allocation
   */
  async update(id: string, updates: UpdateBudgetAllocationInput): Promise<BudgetAllocation | null> {
    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      name: 'name',
      category: 'category',
      allocatedAmount: 'allocated_amount',
      startDate: 'start_date',
      endDate: 'end_date',
    };

    for (const [key, dbField] of Object.entries(fieldMap)) {
      const value = updates[key as keyof UpdateBudgetAllocationInput];
      if (value !== undefined) {
        fields.push(`${dbField} = $${paramIndex++}`);
        values.push(value);
      }
    }

    if (fields.length === 0) {
      return this.getById(id);
    }

    values.push(id);
    const result = await db.queryOne<any>(
      `UPDATE budget_allocations
       SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex}
       RETURNING *, (allocated_amount - spent_amount) as remaining_amount`,
      values
    );

    if (result) {
      logger.info({ allocationId: id }, 'Budget allocation updated');
    }

    return result ? this.mapToAllocation(result) : null;
  }

  /**
   * Delete budget allocation
   */
  async delete(id: string): Promise<boolean> {
    const result = await db.query(
      'DELETE FROM budget_allocations WHERE id = $1',
      [id]
    );

    const deleted = (result.rowCount ?? 0) > 0;
    if (deleted) {
      logger.info({ allocationId: id }, 'Budget allocation deleted');
    }

    return deleted;
  }

  /**
   * Recalculate spent amount from linked expenses
   * Links expenses based on category and scope (event_id matches scope_id for event scope)
   */
  async recalculateSpent(allocationId: string): Promise<BudgetAllocation | null> {
    const allocation = await this.getById(allocationId);
    if (!allocation) return null;

    let spentAmount = 0;

    if (allocation.scopeType === 'event') {
      // For event scope, sum expenses matching the event_id and category
      const result = await db.queryOne<{ sum: string }>(
        `SELECT COALESCE(SUM(amount), 0) as sum
         FROM expenses
         WHERE event_id = $1
         AND category = $2
         AND expense_date BETWEEN $3 AND $4`,
        [allocation.scopeId, allocation.category, allocation.startDate, allocation.endDate]
      );
      spentAmount = parseFloat(result?.sum || '0');
    } else if (allocation.scopeType === 'region') {
      // For region scope, sum expenses from events in that region
      const result = await db.queryOne<{ sum: string }>(
        `SELECT COALESCE(SUM(e.amount), 0) as sum
         FROM expenses e
         JOIN events ev ON ev.id::text = e.event_id
         WHERE ev.region = $1
         AND e.category = $2
         AND e.expense_date BETWEEN $3 AND $4`,
        [allocation.scopeId, allocation.category, allocation.startDate, allocation.endDate]
      );
      spentAmount = parseFloat(result?.sum || '0');
    } else if (allocation.scopeType === 'period') {
      // For period scope, sum all expenses in category within date range
      const result = await db.queryOne<{ sum: string }>(
        `SELECT COALESCE(SUM(amount), 0) as sum
         FROM expenses
         WHERE category = $1
         AND expense_date BETWEEN $2 AND $3`,
        [allocation.category, allocation.startDate, allocation.endDate]
      );
      spentAmount = parseFloat(result?.sum || '0');
    }

    // Update the spent amount
    const updated = await db.queryOne<any>(
      `UPDATE budget_allocations
       SET spent_amount = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *, (allocated_amount - spent_amount) as remaining_amount`,
      [spentAmount, allocationId]
    );

    logger.info({ allocationId, spentAmount }, 'Budget allocation spent amount recalculated');

    return updated ? this.mapToAllocation(updated) : null;
  }

  /**
   * Recalculate all budget allocations for a scope
   */
  async recalculateAllForScope(scopeType: ScopeType, scopeId: string): Promise<number> {
    const allocations = await db.queryMany<{ id: string }>(
      `SELECT id FROM budget_allocations
       WHERE scope_type = $1 AND scope_id = $2`,
      [scopeType, scopeId]
    );

    let updated = 0;
    for (const allocation of allocations) {
      await this.recalculateSpent(allocation.id);
      updated++;
    }

    logger.info({ scopeType, scopeId, updated }, 'Recalculated budget allocations for scope');
    return updated;
  }

  /**
   * Get summary by category
   */
  async getCategorySummary(filters: BudgetAllocationFilters = {}): Promise<CategorySummary[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filters.scopeType) {
      conditions.push(`scope_type = $${paramIndex++}`);
      values.push(filters.scopeType);
    }
    if (filters.scopeId) {
      conditions.push(`scope_id = $${paramIndex++}`);
      values.push(filters.scopeId);
    }
    if (filters.startDate) {
      conditions.push(`start_date >= $${paramIndex++}`);
      values.push(filters.startDate);
    }
    if (filters.endDate) {
      conditions.push(`end_date <= $${paramIndex++}`);
      values.push(filters.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const results = await db.queryMany<{
      category: BudgetCategory;
      total_allocated: string;
      total_spent: string;
      allocation_count: string;
    }>(
      `SELECT 
        category,
        SUM(allocated_amount) as total_allocated,
        SUM(spent_amount) as total_spent,
        COUNT(*) as allocation_count
       FROM budget_allocations
       ${whereClause}
       GROUP BY category
       ORDER BY category`,
      values
    );

    return results.map(r => {
      const allocated = parseFloat(r.total_allocated);
      const spent = parseFloat(r.total_spent);
      return {
        category: r.category,
        totalAllocated: allocated,
        totalSpent: spent,
        totalRemaining: allocated - spent,
        allocationCount: parseInt(r.allocation_count),
        utilizationPercent: allocated > 0 ? (spent / allocated) * 100 : 0,
      };
    });
  }

  /**
   * Get summary by scope
   */
  async getScopeSummary(scopeType: ScopeType): Promise<ScopeSummary[]> {
    // Get aggregated data by scope_id
    const results = await db.queryMany<{
      scope_id: string;
      total_allocated: string;
      total_spent: string;
    }>(
      `SELECT 
        scope_id,
        SUM(allocated_amount) as total_allocated,
        SUM(spent_amount) as total_spent
       FROM budget_allocations
       WHERE scope_type = $1
       GROUP BY scope_id
       ORDER BY SUM(allocated_amount) DESC`,
      [scopeType]
    );

    const summaries: ScopeSummary[] = [];

    for (const r of results) {
      const allocated = parseFloat(r.total_allocated);
      const spent = parseFloat(r.total_spent);

      // Get scope name based on type
      let scopeName = r.scope_id;
      if (scopeType === 'event') {
        const event = await db.queryOne<{ name: string }>(
          'SELECT name FROM events WHERE id::text = $1',
          [r.scope_id]
        );
        scopeName = event?.name || r.scope_id;
      }

      // Get category breakdown for this scope
      const categories = await this.getCategorySummary({
        scopeType,
        scopeId: r.scope_id,
      });

      summaries.push({
        scopeType,
        scopeId: r.scope_id,
        scopeName,
        totalAllocated: allocated,
        totalSpent: spent,
        totalRemaining: allocated - spent,
        utilizationPercent: allocated > 0 ? (spent / allocated) * 100 : 0,
        categories,
      });
    }

    return summaries;
  }

  /**
   * Get allocations at risk (utilization > threshold)
   */
  async getAtRiskAllocations(threshold = 90): Promise<BudgetAllocation[]> {
    const results = await db.queryMany<any>(
      `SELECT *, (allocated_amount - spent_amount) as remaining_amount
       FROM budget_allocations
       WHERE allocated_amount > 0
       AND (spent_amount::float / allocated_amount::float * 100) >= $1
       ORDER BY (spent_amount::float / allocated_amount::float) DESC`,
      [threshold]
    );

    return results.map(this.mapToAllocation);
  }

  /**
   * Get overall budget report
   */
  async getOverallReport(filters: BudgetAllocationFilters = {}): Promise<{
    totalAllocated: number;
    totalSpent: number;
    totalRemaining: number;
    utilizationPercent: number;
    byCategory: CategorySummary[];
    atRisk: BudgetAllocation[];
    overBudget: BudgetAllocation[];
  }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filters.scopeType) {
      conditions.push(`scope_type = $${paramIndex++}`);
      values.push(filters.scopeType);
    }
    if (filters.scopeId) {
      conditions.push(`scope_id = $${paramIndex++}`);
      values.push(filters.scopeId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const totals = await db.queryOne<{
      total_allocated: string;
      total_spent: string;
    }>(
      `SELECT 
        COALESCE(SUM(allocated_amount), 0) as total_allocated,
        COALESCE(SUM(spent_amount), 0) as total_spent
       FROM budget_allocations
       ${whereClause}`,
      values
    );

    const allocated = parseFloat(totals?.total_allocated || '0');
    const spent = parseFloat(totals?.total_spent || '0');

    const [byCategory, atRisk, overBudget] = await Promise.all([
      this.getCategorySummary(filters),
      this.getAtRiskAllocations(90),
      db.queryMany<any>(
        `SELECT *, (allocated_amount - spent_amount) as remaining_amount
         FROM budget_allocations
         WHERE spent_amount > allocated_amount
         ${whereClause ? 'AND ' + conditions.join(' AND ') : ''}
         ORDER BY (spent_amount - allocated_amount) DESC`,
        values
      ),
    ]);

    return {
      totalAllocated: allocated,
      totalSpent: spent,
      totalRemaining: allocated - spent,
      utilizationPercent: allocated > 0 ? (spent / allocated) * 100 : 0,
      byCategory,
      atRisk: atRisk.filter(a => 
        (!filters.scopeType || a.scopeType === filters.scopeType) &&
        (!filters.scopeId || a.scopeId === filters.scopeId)
      ),
      overBudget: overBudget.map(this.mapToAllocation),
    };
  }

  /**
   * Map database row to BudgetAllocation type
   */
  private mapToAllocation(row: any): BudgetAllocation {
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      allocatedAmount: parseFloat(row.allocated_amount),
      spentAmount: parseFloat(row.spent_amount),
      remainingAmount: parseFloat(row.remaining_amount ?? (row.allocated_amount - row.spent_amount)),
      scopeType: row.scope_type,
      scopeId: row.scope_id,
      startDate: row.start_date,
      endDate: row.end_date,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const budgetAllocationService = new BudgetAllocationService();
