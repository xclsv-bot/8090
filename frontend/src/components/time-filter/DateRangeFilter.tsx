'use client';

import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import type { DateRangeFilterProps } from './types';
import { isValidDateRange } from './utils';

export function DateRangeFilter({
  startDate,
  endDate,
  onChange,
  minDate,
  maxDate,
}: DateRangeFilterProps) {
  const hasError = useMemo(() => !isValidDateRange(startDate, endDate), [startDate, endDate]);

  return (
    <fieldset className="flex flex-col gap-2" aria-label="Custom date range">
      <legend className="text-sm font-medium text-gray-700">Date range</legend>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="time-filter-start-date" className="text-xs text-gray-600">
            Start date
          </label>
          <Input
            id="time-filter-start-date"
            type="date"
            aria-label="Start date"
            value={startDate}
            min={minDate}
            max={maxDate}
            onChange={(event) => onChange(event.target.value, endDate)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="time-filter-end-date" className="text-xs text-gray-600">
            End date
          </label>
          <Input
            id="time-filter-end-date"
            type="date"
            aria-label="End date"
            value={endDate}
            min={minDate}
            max={maxDate}
            onChange={(event) => onChange(startDate, event.target.value)}
          />
        </div>
      </div>

      {hasError ? (
        <p className="text-sm text-red-600" role="alert" aria-live="polite">
          Start date must be on or before end date.
        </p>
      ) : null}
    </fieldset>
  );
}
