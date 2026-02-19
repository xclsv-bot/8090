'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import type { Event, EventStatus } from '@/types';

interface EventCalendarProps {
  events: Event[];
  onEventClick: (event: Event) => void;
  onDateClick?: (date: Date) => void;
}

// Status colors matching requirements (AC-EM-005.3)
const STATUS_COLORS: Record<EventStatus, string> = {
  planned: 'bg-gray-500',  // scheduled → planned
  confirmed: 'bg-green-500', // confirmed (green)
  active: 'bg-orange-500', // in_progress → active (orange)
  completed: 'bg-gray-400', // completed (gray)
  cancelled: 'bg-red-500', // cancelled (red)
};

const STATUS_BG_LIGHT: Record<EventStatus, string> = {
  planned: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
  confirmed: 'bg-green-100 text-green-700 hover:bg-green-200',
  active: 'bg-orange-100 text-orange-700 hover:bg-orange-200',
  completed: 'bg-gray-100 text-gray-500 hover:bg-gray-200',
  cancelled: 'bg-red-100 text-red-700 hover:bg-red-200',
};

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function getDaysInMonth(year: number, month: number): Date[] {
  const date = new Date(year, month, 1);
  const days: Date[] = [];
  while (date.getMonth() === month) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
}

function getCalendarDays(year: number, month: number): (Date | null)[] {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDayOfWeek = daysInMonth[0].getDay();
  
  // Add padding for days before the first of the month
  const padding: (Date | null)[] = Array(firstDayOfWeek).fill(null);
  
  // Add padding at the end to complete the last week
  const totalCells = padding.length + daysInMonth.length;
  const endPadding: (Date | null)[] = Array((7 - (totalCells % 7)) % 7).fill(null);
  
  return [...padding, ...daysInMonth, ...endPadding];
}

function formatDateKey(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function EventCalendar({ events, onEventClick, onDateClick }: EventCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Group events by date
  const eventsByDate = useMemo(() => {
    const map = new Map<string, Event[]>();
    events.forEach((event) => {
      const dateKey = event.eventDate.split('T')[0];
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(event);
    });
    return map;
  }, [events]);

  const calendarDays = useMemo(() => getCalendarDays(year, month), [year, month]);

  const goToPreviousMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const today = new Date();
  const todayKey = formatDateKey(today);

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Calendar Header with Navigation (AC-EM-005.5) */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-5 w-5 text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-900">
            {MONTHS[month]} {year}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToToday}>
            Today
          </Button>
          <div className="flex items-center">
            <Button variant="ghost" size="sm" onClick={goToPreviousMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={goToNextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Weekday Headers */}
      <div className="grid grid-cols-7 border-b border-gray-200">
        {WEEKDAYS.map((day) => (
          <div
            key={day}
            className="py-2 text-center text-sm font-medium text-gray-500 bg-gray-50"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid (AC-EM-005.1) */}
      <div className="grid grid-cols-7">
        {calendarDays.map((date, index) => {
          if (!date) {
            return (
              <div
                key={`empty-${index}`}
                className="min-h-[120px] p-2 bg-gray-50 border-b border-r border-gray-100"
              />
            );
          }

          const dateKey = formatDateKey(date);
          const dayEvents = eventsByDate.get(dateKey) || [];
          const isToday = dateKey === todayKey;
          const isCurrentMonth = date.getMonth() === month;
          const hasMultipleEvents = dayEvents.length > 1;

          return (
            <div
              key={dateKey}
              className={`min-h-[120px] p-2 border-b border-r border-gray-100 transition-colors ${
                isToday ? 'bg-blue-50' : isCurrentMonth ? 'bg-white' : 'bg-gray-50'
              } ${onDateClick ? 'cursor-pointer hover:bg-gray-50' : ''}`}
              onClick={() => onDateClick?.(date)}
            >
              {/* Date Number with Multi-Event Badge (AC-EM-005.2) */}
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-sm font-medium ${
                    isToday
                      ? 'bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center'
                      : isCurrentMonth
                      ? 'text-gray-900'
                      : 'text-gray-400'
                  }`}
                >
                  {date.getDate()}
                </span>
                {hasMultipleEvents && (
                  <Badge className="bg-blue-500 text-white text-xs px-1.5 py-0.5">
                    {dayEvents.length}
                  </Badge>
                )}
              </div>

              {/* Events List (AC-EM-005.3 - Status Colors) */}
              <div className="space-y-1 overflow-hidden">
                {dayEvents.slice(0, 3).map((event) => (
                  <button
                    key={event.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick(event);
                    }}
                    className={`w-full text-left text-xs px-2 py-1 rounded truncate transition-colors ${
                      STATUS_BG_LIGHT[event.status]
                    }`}
                    title={event.title}
                  >
                    <span
                      className={`inline-block w-2 h-2 rounded-full mr-1 ${STATUS_COLORS[event.status]}`}
                    />
                    {event.title}
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      // Could open a modal showing all events for this date
                      if (dayEvents[3]) onEventClick(dayEvents[3]);
                    }}
                    className="text-xs text-blue-600 hover:text-blue-800 pl-2"
                  >
                    +{dayEvents.length - 3} more
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 p-4 border-t border-gray-200 bg-gray-50">
        <span className="text-sm text-gray-500">Status:</span>
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1">
            <span className={`w-3 h-3 rounded-full ${color}`} />
            <span className="text-xs text-gray-600 capitalize">{status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
