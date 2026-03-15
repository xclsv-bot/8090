'use client';

import { useEffect, useState } from 'react';
import { DollarSign, Loader2 } from 'lucide-react';
import { payrollApi } from '@/lib/api';
import type { PayrollRecord } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  DateRangeFilter,
  TimeFilterProvider,
  TimePeriod,
  TimePeriodSelector,
  useTimeFilter,
} from '@/components/time-filter';

interface PayrollHistoryProps {
  ambassadorId: string;
}

function PayrollHistoryContent({ ambassadorId }: PayrollHistoryProps) {
  const { period, startDate, endDate, setPeriod, setDateRange } = useTimeFilter();
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadPayroll() {
      setLoading(true);
      try {
        const response = await payrollApi.getAmbassadorPayments(ambassadorId, {
          limit: 10,
          fromDate: startDate,
          toDate: endDate,
          periodType: period,
        });

        if (isMounted) {
          setRecords(response.data ?? []);
        }
      } catch (error) {
        console.error('Failed to load ambassador payroll history:', error);
        if (isMounted) {
          setRecords([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadPayroll();
    return () => {
      isMounted = false;
    };
  }, [ambassadorId, endDate, period, startDate]);

  return (
    <Card className="p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h3 className="font-semibold">Recent Payroll</h3>
        <div className="w-full sm:w-64">
          <TimePeriodSelector
            id="payroll-history-period-selector"
            label="Payroll Period"
            value={period}
            onChange={setPeriod}
          />
        </div>
      </div>

      {period === TimePeriod.CUSTOM_RANGE ? (
        <div className="mb-4">
          <DateRangeFilter
            idPrefix="payroll-history-period"
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
      ) : records.length === 0 ? (
        <p className="text-sm text-gray-500">No payroll records found for the selected period.</p>
      ) : (
        <div className="space-y-2">
          {records.map((record) => (
            <div key={record.id} className="rounded-lg bg-gray-50 p-3">
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm">
                  <DollarSign className="mr-1 inline h-3 w-3" />${record.grossPay.toLocaleString()}
                </p>
                <Badge variant="outline" className="capitalize">
                  {record.status}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {record.signupCount} signups • {record.hoursWorked ?? 0} hrs • pay period {record.payPeriodId}
              </p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function PayrollHistory({ ambassadorId }: PayrollHistoryProps) {
  return (
    <TimeFilterProvider
      defaultPeriod={TimePeriod.CURRENT_PAY_PERIOD}
      syncToUrl={false}
      persistToStorage={false}
    >
      <PayrollHistoryContent ambassadorId={ambassadorId} />
    </TimeFilterProvider>
  );
}
