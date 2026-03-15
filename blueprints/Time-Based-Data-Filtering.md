# Time-Based Data Filtering Pattern

## Overview and Purpose

This blueprint defines a reusable, consistent pattern for selecting time periods and filtering data by date range across all product surfaces. The pattern standardizes user interaction, state persistence, URL sharing behavior, and API request contracts so feature teams can implement date filtering once and reuse it everywhere.

Goals:
- Provide a shared set of period options and semantics.
- Ensure date filtering is consistent between dashboards, reports, tables, and exports.
- Support deep-linking through URL query params.
- Persist user preferences across sessions.
- Meet WCAG 2.1 accessibility expectations for keyboard and assistive technologies.

Out of scope:
- Feature-specific fiscal calendars.
- Timezone conversion of backend data (handled at API and data model layer).

## Standard Time Period Options

All teams must use these canonical values:

| Label | Enum / `periodType` | Range Definition |
| --- | --- | --- |
| Current Pay Period | `current_pay_period` | Current bi-weekly period (14-day windows from Jan 1 anchor) |
| This Week | `this_week` | Week start Monday through week end Sunday |
| This Month | `this_month` | Calendar month start through month end |
| Last 30 Days | `last_30_days` | Today minus 29 days through today |
| Last 60 Days | `last_60_days` | Today minus 59 days through today |
| Last 90 Days | `last_90_days` | Today minus 89 days through today |
| Year to Date | `year_to_date` | Jan 1 of current year through today |
| Custom Range | `custom_range` | User-selected `startDate` and `endDate` |

Required subset for baseline feature compliance:
- Current Pay Period
- This Week
- This Month
- Last 30 Days
- Last 60 Days
- Last 90 Days
- Custom Range

Optional but recommended:
- Year to Date

## UI Component Specifications

### 1. TimePeriodSelector (dropdown)

Purpose:
- Primary period selection input.

Requirements:
- Uses canonical option list and labels.
- Supports `includePayPeriod` and `includeCustom` feature flags.
- Exposes `value` and `onChange` for controlled usage.
- Includes accessible label via `<label>` + `htmlFor` and `aria-label`.

### 2. DateRangeFilter (start/end inputs)

Purpose:
- Custom range entry when user chooses `custom_range`.

Requirements:
- Two date controls (`startDate`, `endDate`) with native calendar picker.
- Validation: `startDate <= endDate`.
- Shows inline validation message using `role="alert"` when invalid.
- Supports optional `minDate` and `maxDate` constraints.

### 3. QuickFilters (button group)

Purpose:
- Fast one-click period selection for common ranges.

Requirements:
- Horizontal button group with wrap on small screens.
- `aria-pressed` state on selected button.
- Keyboard focus indicators visible.

## State Management Patterns

The default shared pattern uses React context + URL + localStorage:

1. Context ownership:
- `TimeFilterProvider` holds canonical state `{ period, startDate, endDate }`.
- `useTimeFilter()` provides update methods for consumers.

2. URL sync:
- Query params: `fromDate`, `toDate`, `periodType`.
- Changes update URL using replace semantics (no full navigation).
- Enables link sharing and back/forward consistency.

3. Persistence:
- Persist state to `localStorage` (`xclsv.time_filter`).
- Initialization precedence:
1. URL query params (highest)
2. localStorage
3. system default (`this_month`)

## API Contract for Time-Filtered Requests

All endpoints that accept date filters should support:

- `fromDate` (required when filtering)
  - Format: `YYYY-MM-DD`
- `toDate` (required when filtering)
  - Format: `YYYY-MM-DD`
- `periodType` (required for consistent analytics attribution)
  - Values: canonical enum list above

Example request:

```http
GET /api/reports/summary?fromDate=2026-03-01&toDate=2026-03-31&periodType=this_month
```

Validation rules:
- Reject invalid date format.
- Reject `fromDate > toDate`.
- Reject unknown `periodType`.

## Accessibility Requirements (WCAG 2.1)

Required checks:
- Keyboard navigation:
  - Tab order follows visual order.
  - Select and button controls are fully operable without mouse.
- Labels and semantics:
  - Form controls have explicit labels.
  - Grouped buttons use `role="group"` + label.
  - Selected quick filter uses `aria-pressed`.
- Error announcement:
  - Invalid range message exposed via live region (`role="alert"`, `aria-live="polite"`).
- Focus management:
  - Visible focus ring for interactive controls.

## Integration Guidelines for Feature Teams

### Required integration steps

1. Wrap page-level content with `TimeFilterProvider`.
2. Use `useTimeFilter()` in feature view.
3. Send `fromDate`, `toDate`, and `periodType` with data-fetch requests.
4. If custom range is selected, show `DateRangeFilter`.

### Recommended composition

- Header area:
  - `QuickFilters`
  - `TimePeriodSelector`
- Secondary area (conditional):
  - `DateRangeFilter` for `custom_range`

### Behavioral consistency rules

- Period changes update both date range and `periodType`.
- Manual range edits force period to `custom_range`.
- Persist and sync behavior should not be reimplemented per feature; use provider.

## Reference Implementation

Source module:
- `frontend/src/components/time-filter/`

Provided artifacts:
- `TimePeriodSelector.tsx`
- `DateRangeFilter.tsx`
- `QuickFilters.tsx`
- `TimeFilterProvider.tsx`
- `useTimeFilter.ts`
- `types.ts`
- `utils.ts`

