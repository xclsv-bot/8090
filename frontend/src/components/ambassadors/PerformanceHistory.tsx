'use client';

import { useEffect, useState } from 'react';
import { Loader2, TrendingUp } from 'lucide-react';
import { ambassadorsApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import {
  DateRangeFilter,
  TimeFilterProvider,
  TimePeriod,
  TimePeriodSelector,
  useTimeFilter,
} from '@/components/time-filter';

interface PerformanceMetrics {
  signups: number;
  events: number;
  earnings: number;
}

interface PerformanceHistoryProps {
  ambassadorId: string;
}

function PerformanceHistoryContent({ ambassadorId }: PerformanceHistoryProps) {
  const { period, startDate, endDate, setPeriod, setDateRange } = useTimeFilter();
  const [performance, setPerformance] = useState<PerformanceMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadPerformance() {
      setLoading(true);
      try {
        const response = await ambassadorsApi.getPerformance(ambassadorId, {
          fromDate: startDate,
          toDate: endDate,
          periodType: period,
        });

        if (isMounted) {
          setPerformance(response.data ?? null);
        }
      } catch (error) {
        console.error('Failed to load ambassador performance history:', error);
        if (isMounted) {
          setPerformance(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadPerformance();
    return () => {
      isMounted = false;
    };
  }, [ambassadorId, endDate, period, startDate]);

  return (
    <Card className="p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h3 className="font-semibold">Performance History</h3>
        <div className="w-full sm:w-64">
          <TimePeriodSelector
            id="performance-period-selector"
            label="Performance Period"
            value={period}
            onChange={setPeriod}
          />
        </div>
      </div>

      {period === TimePeriod.CUSTOM_RANGE ? (
        <div className="mb-4">
          <DateRangeFilter
            idPrefix="performance-period"
            startDate={startDate}
            endDate={endDate}
            onChange={setDateRange}
          />
        </div>
      ) : null}

      {loading ? (
        <div className="flex min-h-28 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Total Signups</span>
            <span className="font-bold text-lg">{performance?.signups ?? 0}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Events Worked</span>
            <span className="font-bold text-lg">{performance?.events ?? 0}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Total Earnings</span>
            <span className="font-bold text-lg text-green-600">
              ${(performance?.earnings ?? 0).toLocaleString()}
            </span>
          </div>
          <p className="pt-2 text-xs text-gray-500">
            <TrendingUp className="mr-1 inline h-3 w-3" />
            {startDate} to {endDate}
          </p>
        </div>
      )}
    </Card>
  );
}

export function PerformanceHistory({ ambassadorId }: PerformanceHistoryProps) {
  return (
    <TimeFilterProvider
      defaultPeriod={TimePeriod.CURRENT_PAY_PERIOD}
      syncToUrl={false}
      persistToStorage={false}
    >
      <PerformanceHistoryContent ambassadorId={ambassadorId} />
    </TimeFilterProvider>
  );
}
