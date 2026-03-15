import { describe, expect, it } from 'vitest';
import { TimePeriod } from '../types';
import { getTimePeriodOptions } from '../utils';

describe('TimePeriodSelector options', () => {
  it('includes all standard periods by default', () => {
    const values = getTimePeriodOptions().map((option) => option.value);

    expect(values).toContain(TimePeriod.CURRENT_PAY_PERIOD);
    expect(values).toContain(TimePeriod.THIS_WEEK);
    expect(values).toContain(TimePeriod.THIS_MONTH);
    expect(values).toContain(TimePeriod.LAST_30_DAYS);
    expect(values).toContain(TimePeriod.LAST_60_DAYS);
    expect(values).toContain(TimePeriod.LAST_90_DAYS);
    expect(values).toContain(TimePeriod.YEAR_TO_DATE);
    expect(values).toContain(TimePeriod.CUSTOM_RANGE);
  });

  it('supports disabling pay period and custom range', () => {
    const values = getTimePeriodOptions(false, false).map((option) => option.value);

    expect(values).not.toContain(TimePeriod.CURRENT_PAY_PERIOD);
    expect(values).not.toContain(TimePeriod.CUSTOM_RANGE);
    expect(values).toContain(TimePeriod.THIS_MONTH);
  });
});
