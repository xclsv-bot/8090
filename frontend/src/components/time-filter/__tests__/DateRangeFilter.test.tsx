import { describe, expect, it } from 'vitest';
import { TimePeriod } from '../types';
import { getDateRangeForPeriod, isValidDateRange } from '../utils';

describe('DateRangeFilter validation', () => {
  it('accepts valid ascending date ranges', () => {
    expect(isValidDateRange('2026-03-01', '2026-03-31')).toBe(true);
  });

  it('rejects invalid descending date ranges', () => {
    expect(isValidDateRange('2026-03-31', '2026-03-01')).toBe(false);
  });

  it('builds this month date range', () => {
    const range = getDateRangeForPeriod(TimePeriod.THIS_MONTH, new Date('2026-03-15T12:00:00Z'));

    expect(range).toEqual({
      startDate: '2026-03-01',
      endDate: '2026-03-31',
    });
  });
});
