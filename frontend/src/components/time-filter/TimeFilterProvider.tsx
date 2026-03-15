'use client';

import {
  createContext,
  type ReactNode,
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

interface TimeFilterProviderProps {
  children: ReactNode;
  defaultPeriod?: TimePeriod;
  syncToUrl?: boolean;
  persistToStorage?: boolean;
  storageKey?: string;
}

function buildTimeFilterUrl(pathname: string, existing: URLSearchParams, state: TimeFilterState): string {
  const query = new URLSearchParams(existing.toString());
  query.set('fromDate', state.startDate);
  query.set('toDate', state.endDate);
  query.set('periodType', state.period);

  return `${pathname}?${query.toString()}`;
}

export function TimeFilterProvider({
  children,
  defaultPeriod = TimePeriodEnum.THIS_MONTH,
  syncToUrl = true,
  persistToStorage = true,
  storageKey = TIME_FILTER_STORAGE_KEY,
}: TimeFilterProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [state, setState] = useState<TimeFilterState>(() => {
    if (typeof window === 'undefined') {
      return getDefaultTimeFilterState(new Date(), defaultPeriod);
    }

    if (syncToUrl) {
      const fromQuery = parseTimeFilterFromQuery(new URLSearchParams(window.location.search));
      if (fromQuery) {
        return fromQuery;
      }
    }

    if (persistToStorage) {
      const fromStorage = parseTimeFilterFromStorage(window.localStorage.getItem(storageKey));

      if (fromStorage) {
        return fromStorage;
      }
    }

    return getDefaultTimeFilterState(new Date(), defaultPeriod);
  });

  useEffect(() => {
    if (persistToStorage) {
      window.localStorage.setItem(storageKey, serializeTimeFilter(state));
    }

    if (!syncToUrl) {
      return;
    }

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
  }, [pathname, persistToStorage, router, searchParams, state, storageKey, syncToUrl]);

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
    setState(getDefaultTimeFilterState(new Date(), defaultPeriod));
  }, [defaultPeriod]);

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
