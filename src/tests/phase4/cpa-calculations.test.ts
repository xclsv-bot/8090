import { describe, expect, it } from 'vitest';
import type { CpaRate } from '../../types/cpa.js';

function resolveCpaRate(
  rates: CpaRate[],
  operatorId: number,
  stateCode: string,
  date: Date
): CpaRate | undefined {
  const normalizedState = stateCode.toUpperCase();

  return rates
    .filter((rate) => rate.isActive)
    .filter((rate) => rate.operatorId === operatorId && rate.stateCode === normalizedState)
    .filter((rate) => rate.effectiveDate.getTime() <= date.getTime())
    .filter((rate) => !rate.endDate || rate.endDate.getTime() >= date.getTime())
    .sort((a, b) => b.effectiveDate.getTime() - a.effectiveDate.getTime())[0];
}

describe('Phase 4: CPA calculations', () => {
  const rates: CpaRate[] = [
    {
      id: 'cpa-ny-1',
      operatorId: 9,
      stateCode: 'NY',
      rateType: 'cpa',
      cpaAmount: 95,
      effectiveDate: new Date('2026-01-01'),
      endDate: new Date('2026-01-31'),
      isActive: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    },
    {
      id: 'cpa-ny-2',
      operatorId: 9,
      stateCode: 'NY',
      rateType: 'cpa',
      cpaAmount: 110,
      effectiveDate: new Date('2026-02-01'),
      isActive: true,
      createdAt: new Date('2026-02-01'),
      updatedAt: new Date('2026-02-01'),
    },
    {
      id: 'cpa-nj-1',
      operatorId: 9,
      stateCode: 'NJ',
      rateType: 'cpa',
      cpaAmount: 105,
      effectiveDate: new Date('2026-01-01'),
      isActive: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    },
  ];

  it('looks up the correct CPA by operator/state/date combination', () => {
    const januaryNy = resolveCpaRate(rates, 9, 'NY', new Date('2026-01-20'));
    const februaryNy = resolveCpaRate(rates, 9, 'ny', new Date('2026-02-15'));
    const nj = resolveCpaRate(rates, 9, 'NJ', new Date('2026-02-15'));

    expect(januaryNy?.cpaAmount).toBe(95);
    expect(februaryNy?.cpaAmount).toBe(110);
    expect(nj?.cpaAmount).toBe(105);
  });

  it('returns undefined when no matching operator/state exists', () => {
    expect(resolveCpaRate(rates, 999, 'NY', new Date('2026-02-15'))).toBeUndefined();
    expect(resolveCpaRate(rates, 9, 'CA', new Date('2026-02-15'))).toBeUndefined();
  });
});
