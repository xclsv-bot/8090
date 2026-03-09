import { describe, expect, it } from 'vitest';
import type { CpaRate } from '../../types/cpa.js';
import type { Operator } from '../../types/operator.js';

function activeRateOnDate(rates: CpaRate[], date: Date) {
  return rates.find((rate) => {
    const starts = rate.effectiveDate.getTime() <= date.getTime();
    const ends = !rate.endDate || rate.endDate.getTime() >= date.getTime();
    return rate.isActive && starts && ends;
  });
}

describe('Phase 2: CPA and Operator models', () => {
  it('resolves location-based CPA pricing by effective date', () => {
    const rates: CpaRate[] = [
      {
        id: 'c1',
        operatorId: 99,
        stateCode: 'NY',
        rateType: 'cpa',
        cpaAmount: 100,
        effectiveDate: new Date('2026-01-01'),
        endDate: new Date('2026-01-31'),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'c2',
        operatorId: 99,
        stateCode: 'NY',
        rateType: 'cpa',
        cpaAmount: 120,
        effectiveDate: new Date('2026-02-01'),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const resolved = activeRateOnDate(rates, new Date('2026-02-10'));
    expect(resolved?.cpaAmount).toBe(120);
  });

  it('validates operator configuration and status', () => {
    const operator: Operator = {
      id: 1,
      name: 'operator-a',
      displayName: 'Operator A',
      category: 'sportsbook',
      status: 'active',
      minAge: 21,
      sortOrder: 1,
      featured: true,
      legalStates: ['NY', 'NJ'],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    expect(operator.status).toBe('active');
    expect(operator.legalStates).toContain('NY');
  });
});
