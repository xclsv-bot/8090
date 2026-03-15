'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Calendar, Loader2 } from 'lucide-react';
import { assignmentsApi } from '@/lib/api';
import type { EventAssignment } from '@/lib/api';
import { Card } from '@/components/ui/card';
import {
  DateRangeFilter,
  TimeFilterProvider,
  TimePeriod,
  TimePeriodSelector,
  useTimeFilter,
} from '@/components/time-filter';

interface EventHistoryProps {
  ambassadorId: string;
}

function formatEventDate(value?: string): string {
  if (!value) {
    return 'Date unavailable';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Date unavailable';
  }

  return date.toLocaleDateString();
}

function EventHistoryContent({ ambassadorId }: EventHistoryProps) {
  const { period, startDate, endDate, setPeriod, setDateRange } = useTimeFilter();
  const [events, setEvents] = useState<EventAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadEvents() {
      setLoading(true);
      try {
        const response = await assignmentsApi.getByAmbassador(ambassadorId, {
          upcoming: false,
          fromDate: startDate,
          toDate: endDate,
          periodType: period,
        });

        if (isMounted) {
          setEvents(response.data ?? []);
        }
      } catch (error) {
        console.error('Failed to load ambassador event history:', error);
        if (isMounted) {
          setEvents([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadEvents();
    return () => {
      isMounted = false;
    };
  }, [ambassadorId, endDate, period, startDate]);

  return (
    <Card className="p-6">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h3 className="font-semibold">Event History</h3>
        <div className="w-full sm:w-64">
          <TimePeriodSelector
            id="event-history-period-selector"
            label="Event History Period"
            value={period}
            onChange={setPeriod}
          />
        </div>
      </div>

      {period === TimePeriod.CUSTOM_RANGE ? (
        <div className="mb-4">
          <DateRangeFilter
            idPrefix="event-history-period"
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
      ) : events.length === 0 ? (
        <p className="text-sm text-gray-500">No events found for the selected period.</p>
      ) : (
        <div className="space-y-2">
          {events.slice(0, 10).map((event) => (
            <Link
              key={event.id}
              href={`/events/${event.eventId}`}
              className="block rounded-lg bg-gray-50 p-3 hover:bg-gray-100"
            >
              <p className="font-medium text-sm">{event.eventTitle || 'Event Assignment'}</p>
              <p className="text-xs text-gray-500">
                <Calendar className="mr-1 inline h-3 w-3" />
                {formatEventDate(event.eventDate || event.scheduledStart)} • {event.city || 'Unknown'},{' '}
                {event.state || 'N/A'}
              </p>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

export function EventHistory({ ambassadorId }: EventHistoryProps) {
  return (
    <TimeFilterProvider
      defaultPeriod={TimePeriod.CURRENT_PAY_PERIOD}
      syncToUrl={false}
      persistToStorage={false}
    >
      <EventHistoryContent ambassadorId={ambassadorId} />
    </TimeFilterProvider>
  );
}
