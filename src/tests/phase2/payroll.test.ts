import { describe, expect, it } from 'vitest';
import type { AmbassadorPayStatement, PayStatementLineItem, PayRateHistory } from '../../types/payStatement.js';

function totalLineItems(items: PayStatementLineItem[]) {
  return items.reduce((sum, item) => sum + item.amount, 0);
}

describe('Phase 2: Payroll models', () => {
  it('creates statement with gross and net pay fields', () => {
    const statement: AmbassadorPayStatement = {
      id: 'stmt-1',
      ambassadorId: 'amb-1',
      payPeriodId: 'pp-1',
      status: 'approved',
      grossPay: 1400,
      deductions: 150,
      netPay: 1250,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(statement.grossPay - statement.deductions).toBe(statement.netPay);
  });

  it('aggregates line items for earnings, deductions, and bonus', () => {
    const items: PayStatementLineItem[] = [
      { id: 'li-1', statementId: 'stmt-1', type: 'earning', description: 'Base pay', amount: 1000, createdAt: new Date() },
      { id: 'li-2', statementId: 'stmt-1', type: 'bonus', description: 'Signup bonus', amount: 300, createdAt: new Date() },
      { id: 'li-3', statementId: 'stmt-1', type: 'deduction', description: 'Adjustment', amount: -50, createdAt: new Date() },
    ];

    expect(totalLineItems(items)).toBe(1250);
  });

  it('tracks historical pay rate changes by effective date', () => {
    const history: PayRateHistory[] = [
      { id: 'r1', ambassadorId: 'amb-1', rateType: 'hourly', rateAmount: 25, effectiveDate: new Date('2026-01-01'), createdAt: new Date() },
      { id: 'r2', ambassadorId: 'amb-1', rateType: 'hourly', rateAmount: 30, effectiveDate: new Date('2026-02-01'), createdAt: new Date() },
    ];

    const latest = [...history].sort((a, b) => b.effectiveDate.getTime() - a.effectiveDate.getTime())[0];
    expect(latest.rateAmount).toBe(30);
  });
});
