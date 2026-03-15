'use client';

import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useMemo,
  useState,
  useEffect,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { TimeFilterContextValue, TimeFilterState, TimePeriod } from './types';
import { TimePeriod as TimePeriodEnum } from './types';
import {
  getDateRangeForPeriod,
  getDefaultTimeFilterState,
  parseTimeFilterFromQuery,
  parseTimeFilterFromStorage,
  serializeTimeFilter,
  TIME_FILTER_STORAGE_KEY,
  toApiQueryParams,
  isValidDateRange,
} from './utils';

export const TimeFilterContext = createContext<TimeFilterContextValue | null>(null);

function buildTimeFilterUrl(pathname: string, existing: URLSearchParams, state: TimeFilterState): string {
  const query = new URLSearchParams(existing.toString());
  query.set('fromDate', state.startDate);
  query.set('toDate', state.endDate);
  query.set('periodType', state.period);

  return `${pathname}?${query.toString()}`;
}

export function TimeFilterProvider({ children }: PropsWithChildren) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [state, setState] = useState<TimeFilterState>(() => {
    if (typeof window === 'undefined') {
      return getDefaultTimeFilterState();
    }

    const fromQuery = parseTimeFilterFromQuery(new URLSearchParams(window.location.search));
    if (fromQuery) {
      return fromQuery;
    }

    const fromStorage = parseTimeFilterFromStorage(
      window.localStorage.getItem(TIME_FILTER_STORAGE_KEY),
    );

    return fromStorage ?? getDefaultTimeFilterState();
  });

  useEffect(() => {
    window.localStorage.setItem(TIME_FILTER_STORAGE_KEY, serializeTimeFilter(state));

    const currentState = parseTimeFilterFromQuery(new URLSearchParams(searchParams.toString()));
    if (
      currentState?.period === state.period &&
      currentState.startDate === state.startDate &&
      currentState.endDate === state.endDate
    ) {
      return;
    }

    const nextUrl = buildTimeFilterUrl(pathname, new URLSearchParams(searchParams.toString()), state);
    router.replace(nextUrl, { scroll: false });
  }, [pathname, router, searchParams, state]);

  const setPeriod = useCallback((period: TimePeriod) => {
    setState((current) => {
      if (period === current.period) {
        return current;
      }

      if (period === TimePeriodEnum.CUSTOM_RANGE) {
        return {
          ...current,
          period,
        };
      }

      const range = getDateRangeForPeriod(period);
      return {
        period,
        startDate: range.startDate,
        endDate: range.endDate,
      };
    });
  }, []);

  const setDateRange = useCallback((startDate: string, endDate: string) => {
    if (!isValidDateRange(startDate, endDate)) {
      return;
    }

    setState({
      period: TimePeriodEnum.CUSTOM_RANGE,
      startDate,
      endDate,
    });
  }, []);

  const resetToDefault = useCallback(() => {
    setState(getDefaultTimeFilterState());
  }, []);

  const contextValue = useMemo<TimeFilterContextValue>(
    () => ({
      ...state,
      setPeriod,
      setDateRange,
      resetToDefault,
    }),
    [resetToDefault, setDateRange, setPeriod, state],
  );

  return <TimeFilterContext.Provider value={contextValue}>{children}</TimeFilterContext.Provider>;
}

export function mapTimeFilterToApiParams(state: TimeFilterState): URLSearchParams {
  return toApiQueryParams(state);
}
