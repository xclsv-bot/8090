/**
 * useSignupFilters Hook
 * WO-99: Custom hook for signup filtering and date range management
 */

import { useState, useMemo, useCallback } from 'react';
import { format, subMonths, startOfMonth, parseISO, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import type { Signup } from '@/types';

export type FilterType = 'month' | 'week';

export interface SignupFilters {
  search: string;
  status: string;
}

export interface UseSignupFiltersReturn {
  // Filter type
  filterType: FilterType;
  setFilterType: (type: FilterType) => void;
  // Date selection
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  selectedWeek: string;
  setSelectedWeek: (week: string) => void;
  // Options for dropdowns
  monthOptions: Array<{ value: string; label: string }>;
  weekOptions: Array<{ value: string; label: string }>;
  // Date range (computed)
  dateRange: { startDate: string; endDate: string };
  // Search & status filters
  filters: SignupFilters;
  setSearch: (search: string) => void;
  setStatusFilter: (status: string) => void;
  // Filtered signups
  filteredSignups: Signup[];
}

function getMonthOptions() {
  const options = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const date = subMonths(startOfMonth(now), i);
    options.push({
      value: format(date, 'yyyy-MM'),
      label: format(date, 'MMMM yyyy'),
    });
  }
  return options;
}

function getWeekOptions() {
  const options = [];
  const now = new Date();
  const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 });

  for (let i = 0; i < 12; i++) {
    const weekStart = subWeeks(currentWeekStart, i);
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    options.push({
      value: format(weekStart, 'yyyy-MM-dd'),
      label: `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`,
    });
  }
  return options;
}

export function useSignupFilters(signups: Signup[]): UseSignupFiltersReturn {
  const [filterType, setFilterType] = useState<FilterType>('month');
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [selectedWeek, setSelectedWeek] = useState(format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const monthOptions = useMemo(() => getMonthOptions(), []);
  const weekOptions = useMemo(() => getWeekOptions(), []);

  // Calculate date range based on filter type
  const dateRange = useMemo(() => {
    if (filterType === 'week') {
      const weekStart = parseISO(selectedWeek);
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      return {
        startDate: format(weekStart, 'yyyy-MM-dd'),
        endDate: format(weekEnd, 'yyyy-MM-dd'),
      };
    } else {
      const [year, month] = selectedMonth.split('-').map(Number);
      return {
        startDate: format(new Date(year, month - 1, 1), 'yyyy-MM-dd'),
        endDate: format(new Date(year, month, 0), 'yyyy-MM-dd'),
      };
    }
  }, [filterType, selectedMonth, selectedWeek]);

  // Filter signups
  const filteredSignups = useMemo(() => {
    return signups.filter(signup => {
      // Date filter (client-side fallback)
      if (signup.submittedAt) {
        const signupDate = signup.submittedAt.split('T')[0];
        if (signupDate < dateRange.startDate || signupDate > dateRange.endDate) {
          return false;
        }
      }

      // Search filter
      if (search) {
        const searchLower = search.toLowerCase();
        const name = `${signup.customerFirstName || ''} ${signup.customerLastName || ''}`.toLowerCase();
        const email = (signup.customerEmail || '').toLowerCase();
        const ambassadorName = signup.ambassador
          ? `${signup.ambassador.firstName} ${signup.ambassador.lastName}`.toLowerCase()
          : '';
        if (!name.includes(searchLower) && !email.includes(searchLower) && !ambassadorName.includes(searchLower)) {
          return false;
        }
      }

      // Status filter
      if (statusFilter !== 'all') {
        if (signup.validationStatus !== statusFilter) return false;
      }

      return true;
    });
  }, [signups, dateRange, search, statusFilter]);

  return {
    filterType,
    setFilterType,
    selectedMonth,
    setSelectedMonth,
    selectedWeek,
    setSelectedWeek,
    monthOptions,
    weekOptions,
    dateRange,
    filters: { search, status: statusFilter },
    setSearch,
    setStatusFilter,
    filteredSignups,
  };
}
