export enum TimePeriod {
  CURRENT_PAY_PERIOD = 'current_pay_period',
  THIS_WEEK = 'this_week',
  THIS_MONTH = 'this_month',
  LAST_30_DAYS = 'last_30_days',
  LAST_60_DAYS = 'last_60_days',
  LAST_90_DAYS = 'last_90_days',
  YEAR_TO_DATE = 'year_to_date',
  CUSTOM_RANGE = 'custom_range',
}

export interface TimeFilterState {
  period: TimePeriod;
  startDate: string;
  endDate: string;
}

export interface TimePeriodOption {
  value: TimePeriod;
  label: string;
}

export interface TimeFilterContextValue extends TimeFilterState {
  setPeriod: (period: TimePeriod) => void;
  setDateRange: (startDate: string, endDate: string) => void;
  resetToDefault: () => void;
}

export interface TimePeriodSelectorProps {
  value: TimePeriod;
  onChange: (period: TimePeriod) => void;
  includePayPeriod?: boolean;
  includeCustom?: boolean;
  label?: string;
  id?: string;
}

export interface DateRangeFilterProps {
  startDate: string;
  endDate: string;
  onChange: (startDate: string, endDate: string) => void;
  minDate?: string;
  maxDate?: string;
  idPrefix?: string;
}

export interface QuickFiltersProps {
  options: TimePeriodOption[];
  selected: TimePeriod;
  onSelect: (period: TimePeriod) => void;
}
