'use client';

import type { KeyboardEvent } from 'react';
import type { TimePeriod } from './types';
import { getTimePeriodOptions } from './utils';
import type { TimePeriodSelectorProps } from './types';

function isTimePeriod(value: string): value is TimePeriod {
  return getTimePeriodOptions(true, true).some((option) => option.value === value);
}

export function TimePeriodSelector({
  value,
  onChange,
  includePayPeriod = true,
  includeCustom = true,
  label = 'Time period',
  id = 'time-period-selector',
}: TimePeriodSelectorProps) {
  const options = getTimePeriodOptions(includePayPeriod, includeCustom);

  const handleKeyDown = (event: KeyboardEvent<HTMLSelectElement>) => {
    if (event.key === 'Escape') {
      (event.target as HTMLSelectElement).blur();
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-gray-700">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => {
          const nextValue = event.target.value;
          if (isTimePeriod(nextValue)) {
            onChange(nextValue);
          }
        }}
        onKeyDown={handleKeyDown}
        aria-label={label}
        className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
