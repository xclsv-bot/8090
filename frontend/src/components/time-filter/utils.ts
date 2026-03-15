import {
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
} from 'date-fns';
import { TimePeriod, type TimeFilterState, type TimePeriodOption } from './types';

export const TIME_FILTER_STORAGE_KEY = 'xclsv.time_filter';

export function formatDateISO(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function isValidISODate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

export function isValidDateRange(startDate: string, endDate: string): boolean {
  if (!isValidISODate(startDate) || !isValidISODate(endDate)) {
    return false;
  }

  return startDate <= endDate;
}

function getCurrentPayPeriod(now: Date): { startDate: string; endDate: string } {
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const dayDiff = Math.floor((now.getTime() - yearStart.getTime()) / 86_400_000);
  const periodIndex = Math.floor(dayDiff / 14);

  const periodStart = new Date(yearStart);
  periodStart.setDate(yearStart.getDate() + periodIndex * 14);

  const periodEnd = new Date(periodStart);
  periodEnd.setDate(periodStart.getDate() + 13);

  return {
    startDate: formatDateISO(periodStart),
    endDate: formatDateISO(periodEnd),
  };
}

export function getDateRangeForPeriod(
  period: TimePeriod,
  now: Date = new Date(),
): { startDate: string; endDate: string } {
  switch (period) {
    case TimePeriod.CURRENT_PAY_PERIOD:
      return getCurrentPayPeriod(now);
    case TimePeriod.THIS_WEEK:
      return {
        startDate: formatDateISO(startOfWeek(now, { weekStartsOn: 1 })),
        endDate: formatDateISO(endOfWeek(now, { weekStartsOn: 1 })),
      };
    case TimePeriod.THIS_MONTH:
      return {
        startDate: formatDateISO(startOfMonth(now)),
        endDate: formatDateISO(endOfMonth(now)),
      };
    case TimePeriod.LAST_30_DAYS:
      return {
        startDate: formatDateISO(subDays(now, 29)),
        endDate: formatDateISO(now),
      };
    case TimePeriod.LAST_60_DAYS:
      return {
        startDate: formatDateISO(subDays(now, 59)),
        endDate: formatDateISO(now),
      };
    case TimePeriod.LAST_90_DAYS:
      return {
        startDate: formatDateISO(subDays(now, 89)),
        endDate: formatDateISO(now),
      };
    case TimePeriod.YEAR_TO_DATE:
      return {
        startDate: formatDateISO(startOfYear(now)),
        endDate: formatDateISO(now),
      };
    case TimePeriod.CUSTOM_RANGE:
      return {
        startDate: formatDateISO(now),
        endDate: formatDateISO(now),
      };
  }
}

export function getDefaultTimeFilterState(now: Date = new Date()): TimeFilterState {
  const period = TimePeriod.THIS_MONTH;
  const range = getDateRangeForPeriod(period, now);

  return {
    period,
    startDate: range.startDate,
    endDate: range.endDate,
  };
}

export function getTimePeriodOptions(
  includePayPeriod = true,
  includeCustom = true,
): TimePeriodOption[] {
  const options: TimePeriodOption[] = [];

  if (includePayPeriod) {
    options.push({ value: TimePeriod.CURRENT_PAY_PERIOD, label: 'Current Pay Period' });
  }

  options.push(
    { value: TimePeriod.THIS_WEEK, label: 'This Week' },
    { value: TimePeriod.THIS_MONTH, label: 'This Month' },
    { value: TimePeriod.LAST_30_DAYS, label: 'Last 30 Days' },
    { value: TimePeriod.LAST_60_DAYS, label: 'Last 60 Days' },
    { value: TimePeriod.LAST_90_DAYS, label: 'Last 90 Days' },
    { value: TimePeriod.YEAR_TO_DATE, label: 'Year to Date' },
  );

  if (includeCustom) {
    options.push({ value: TimePeriod.CUSTOM_RANGE, label: 'Custom Range' });
  }

  return options;
}

function isTimePeriod(value: string): value is TimePeriod {
  return Object.values(TimePeriod).includes(value as TimePeriod);
}

export function parseTimeFilterFromQuery(searchParams: URLSearchParams): TimeFilterState | null {
  const periodType = searchParams.get('periodType');
  const fromDate = searchParams.get('fromDate');
  const toDate = searchParams.get('toDate');

  if (!periodType || !fromDate || !toDate || !isTimePeriod(periodType)) {
    return null;
  }

  if (!isValidDateRange(fromDate, toDate)) {
    return null;
  }

  return {
    period: periodType,
    startDate: fromDate,
    endDate: toDate,
  };
}

export function serializeTimeFilter(state: TimeFilterState): string {
  return JSON.stringify(state);
}

export function parseTimeFilterFromStorage(rawValue: string | null): TimeFilterState | null {
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<TimeFilterState>;
    if (
      !parsed.period ||
      !parsed.startDate ||
      !parsed.endDate ||
      !isTimePeriod(parsed.period) ||
      !isValidDateRange(parsed.startDate, parsed.endDate)
    ) {
      return null;
    }

    return {
      period: parsed.period,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
    };
  } catch {
    return null;
  }
}

export function toApiQueryParams(state: TimeFilterState): URLSearchParams {
  return new URLSearchParams({
    fromDate: state.startDate,
    toDate: state.endDate,
    periodType: state.period,
  });
}
