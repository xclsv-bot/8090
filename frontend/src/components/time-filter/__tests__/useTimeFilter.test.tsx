import { describe, expect, it } from 'vitest';
import { mapTimeFilterToApiParams } from '../TimeFilterProvider';
import { TimePeriod, type TimeFilterState } from '../types';
import {
  parseTimeFilterFromQuery,
  parseTimeFilterFromStorage,
  serializeTimeFilter,
  toApiQueryParams,
} from '../utils';

describe('useTimeFilter integration helpers', () => {
  const sampleState: TimeFilterState = {
    period: TimePeriod.LAST_30_DAYS,
    startDate: '2026-02-14',
    endDate: '2026-03-15',
  };

  it('serializes and restores persisted state', () => {
    const serialized = serializeTimeFilter(sampleState);
    const restored = parseTimeFilterFromStorage(serialized);

    expect(restored).toEqual(sampleState);
  });

  it('parses state from URL query params', () => {
    const params = new URLSearchParams({
      fromDate: sampleState.startDate,
      toDate: sampleState.endDate,
      periodType: sampleState.period,
    });

    expect(parseTimeFilterFromQuery(params)).toEqual(sampleState);
  });

  it('creates API query params with required keys', () => {
    const params = toApiQueryParams(sampleState);

    expect(params.get('fromDate')).toBe(sampleState.startDate);
    expect(params.get('toDate')).toBe(sampleState.endDate);
    expect(params.get('periodType')).toBe(sampleState.period);
  });

  it('maps provider state to API query params', () => {
    const params = mapTimeFilterToApiParams(sampleState);

    expect(params.toString()).toBe(toApiQueryParams(sampleState).toString());
  });
});
