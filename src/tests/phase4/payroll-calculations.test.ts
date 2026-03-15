import { describe, expect, it } from 'vitest';
import type { PayRateHistory } from '../../types/payStatement.js';

interface SignupEarningsInput {
  validatedSignups: number;
  perSignupRate: number;
}

interface PeriodPayrollInput {
  signupPay: number;
  hourlyPay: number;
  eventFlatPay: number;
  bonuses: number;
  deductions: number;
}

function calculateSignupPay(input: SignupEarningsInput): number {
  return input.validatedSignups * input.perSignupRate;
}

function resolveRateAtDate(history: PayRateHistory[], date: Date): PayRateHistory | undefined {
  return history
    .filter((rate) => rate.effectiveDate.getTime() <= date.getTime())
    .filter((rate) => !rate.endDate || rate.endDate.getTime() >= date.getTime())
    .sort((a, b) => b.effectiveDate.getTime() - a.effectiveDate.getTime())[0];
}

function processPayPeriod(input: PeriodPayrollInput) {
  const grossPay = input.signupPay + input.hourlyPay + input.eventFlatPay + input.bonuses;
  const netPay = grossPay - input.deductions;
  return { grossPay, netPay };
}

describe('Phase 4: Payroll calculations', () => {
  it('calculates pay from validated signups and rate', () => {
    expect(calculateSignupPay({ validatedSignups: 18, perSignupRate: 12.5 })).toBe(225);
  });

  it('resolves latest effective rate within a pay period', () => {
    const history: PayRateHistory[] = [
      {
        id: 'r1',
        ambassadorId: 'amb-100',
        rateType: 'per_signup',
        rateAmount: 10,
        effectiveDate: new Date('2026-01-01'),
        endDate: new Date('2026-01-31'),
        createdAt: new Date('2026-01-01'),
      },
      {
        id: 'r2',
        ambassadorId: 'amb-100',
        rateType: 'per_signup',
        rateAmount: 12.5,
        effectiveDate: new Date('2026-02-01'),
        createdAt: new Date('2026-02-01'),
      },
    ];

    const januaryRate = resolveRateAtDate(history, new Date('2026-01-15'));
    const febRate = resolveRateAtDate(history, new Date('2026-02-10'));

    expect(januaryRate?.rateAmount).toBe(10);
    expect(febRate?.rateAmount).toBe(12.5);
  });

  it('processes pay period totals into gross and net pay', () => {
    const result = processPayPeriod({
      signupPay: 320,
      hourlyPay: 500,
      eventFlatPay: 200,
      bonuses: 80,
      deductions: 60,
    });

    expect(result.grossPay).toBe(1100);
    expect(result.netPay).toBe(1040);
    expect(result.netPay).toBeLessThanOrEqual(result.grossPay);
  });
});
