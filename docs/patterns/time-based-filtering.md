# Time-Based Filtering Pattern

This document describes how to use the shared time filtering components in `frontend/src/components/time-filter`.

## Component API Reference

### `TimePeriodSelector`

Props:
- `value: TimePeriod`
- `onChange: (period: TimePeriod) => void`
- `includePayPeriod?: boolean` (default `true`)
- `includeCustom?: boolean` (default `true`)

Use for selecting standardized periods (This Week, This Month, Last 30 Days, etc.).

### `DateRangeFilter`

Props:
- `startDate: string` (`YYYY-MM-DD`)
- `endDate: string` (`YYYY-MM-DD`)
- `onChange: (startDate: string, endDate: string) => void`
- `minDate?: string`
- `maxDate?: string`

Use for custom range input with validation (`startDate <= endDate`).

### `QuickFilters`

Props:
- `options: TimePeriodOption[]`
- `selected: TimePeriod`
- `onSelect: (period: TimePeriod) => void`

Use for one-click common filters in dashboard/report headers.

### `TimeFilterProvider`

Provides context state and synchronization:
- URL query params (`fromDate`, `toDate`, `periodType`)
- localStorage persistence (`xclsv.time_filter`)

### `useTimeFilter`

Returns:
- `period`
- `startDate`
- `endDate`
- `setPeriod(period)`
- `setDateRange(startDate, endDate)`
- `resetToDefault()`

## Usage Examples

### 1. Page-Level Integration

```tsx
'use client';

import {
  TimeFilterProvider,
  TimePeriodSelector,
  DateRangeFilter,
  QuickFilters,
  TimePeriod,
  getTimePeriodOptions,
  useTimeFilter,
} from '@/components/time-filter';

function ReportHeader() {
  const { period, startDate, endDate, setPeriod, setDateRange } = useTimeFilter();

  return (
    <div className="space-y-3">
      <QuickFilters
        options={getTimePeriodOptions(true, false).slice(0, 4)}
        selected={period}
        onSelect={setPeriod}
      />

      <TimePeriodSelector
        value={period}
        onChange={setPeriod}
        includePayPeriod
        includeCustom
      />

      {period === TimePeriod.CUSTOM_RANGE ? (
        <DateRangeFilter
          startDate={startDate}
          endDate={endDate}
          onChange={setDateRange}
        />
      ) : null}
    </div>
  );
}

export default function ReportsPage() {
  return (
    <TimeFilterProvider>
      <ReportHeader />
      {/* report content */}
    </TimeFilterProvider>
  );
}
```

### 2. API Request Integration

```ts
import { mapTimeFilterToApiParams } from '@/components/time-filter';

const params = mapTimeFilterToApiParams({
  period,
  startDate,
  endDate,
});

const response = await fetch(`/api/reports/summary?${params.toString()}`);
```

## State Management Integration Guide

Initialization precedence:
1. URL query (`fromDate`, `toDate`, `periodType`)
2. localStorage (`xclsv.time_filter`)
3. default (`this_month`)

Behavior rules:
- `setPeriod(non-custom)` recalculates range automatically.
- `setDateRange(...)` always sets `period` to `custom_range`.
- State updates sync URL and storage.

## Accessibility Checklist

- Controls are reachable with keyboard only.
- `TimePeriodSelector` has explicit label + `aria-label`.
- `QuickFilters` uses `role="group"` and `aria-pressed` states.
- `DateRangeFilter` announces validation with `role="alert"`.
- Focus indicator is visible on all interactive elements.

## Common Patterns

### Dashboard filters
- Put `QuickFilters` above charts/tables for rapid switching.
- Keep `TimePeriodSelector` visible for full option set.

### Report exports
- Reuse provider state to populate export request params.
- Always pass `fromDate`, `toDate`, `periodType` to export endpoint.

### Data tables
- Store filter state in provider and include params in pagination/sort requests.
- Preserve query params to support deep links to filtered table views.

