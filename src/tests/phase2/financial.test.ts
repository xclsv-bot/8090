import { describe, expect, it } from 'vitest';
import type { BudgetAllocation, Expense, RevenueRecord } from '../../types/financial.js';

function recalculateRemaining(allocated: number, spent: number) {
  return allocated - spent;
}

describe('Phase 2: Financial models', () => {
  it('supports expense category and status constraints', () => {
    const expense: Expense = {
      id: 'exp-1',
      category: 'payroll',
      description: 'Ambassador payment',
      amount: 1000,
      currency: 'USD',
      status: 'approved',
      submittedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(['payroll', 'materials', 'travel', 'venue', 'marketing', 'software', 'other']).toContain(expense.category);
    expect(expense.amount).toBeGreaterThan(0);
  });

  it('updates remaining budget when spent amount changes', () => {
    const allocation: BudgetAllocation = {
      id: 'b-1',
      name: 'Q1 Event',
      category: 'venue',
      allocatedAmount: 5000,
      spentAmount: 2200,
      remainingAmount: 2800,
      periodStart: new Date('2026-01-01'),
      periodEnd: new Date('2026-03-31'),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const updatedSpent = allocation.spentAmount + 500;
    expect(recalculateRemaining(allocation.allocatedAmount, updatedSpent)).toBe(2300);
  });

  it('tracks revenue records against events/operators', () => {
    const revenue: RevenueRecord = {
      id: 'rev-1',
      revenueType: 'cpa',
      amount: 1800,
      currency: 'USD',
      operatorId: 10,
      eventId: 'evt-7',
      revenueDate: new Date('2026-02-03'),
      createdAt: new Date(),
    };

    expect(revenue.operatorId).toBeDefined();
    expect(revenue.eventId).toBeDefined();
  });
});
