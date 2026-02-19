'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  MoreHorizontal,
  Eye,
  Pencil,
  Copy,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { Event, EventStatus } from '@/types';

interface EventListViewProps {
  events: Event[];
  onEventClick: (event: Event) => void;
  onDuplicate?: (event: Event) => void;
  onBulkDuplicate?: (event: Event) => void;
}

// Sortable columns (AC-EM-006.2)
type SortField = 'title' | 'eventDate' | 'location' | 'status' | 'signupGoal';
type SortDirection = 'asc' | 'desc';

const STATUS_COLORS: Record<EventStatus, string> = {
  planned: 'bg-gray-100 text-gray-700',
  confirmed: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  completed: 'bg-purple-100 text-purple-700',
  cancelled: 'bg-red-100 text-red-700',
};

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export function EventListView({
  events,
  onEventClick,
  onDuplicate,
  onBulkDuplicate,
}: EventListViewProps) {
  // Sorting state (AC-EM-006.2)
  const [sortField, setSortField] = useState<SortField>('eventDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Pagination state (AC-EM-006.5)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Handle sort toggle
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1); // Reset to first page on sort
  };

  // Sort events
  const sortedEvents = useMemo(() => {
    return [...events].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'eventDate':
          comparison = new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime();
          break;
        case 'location':
          const locA = `${a.city || ''} ${a.state || ''}`.trim();
          const locB = `${b.city || ''} ${b.state || ''}`.trim();
          comparison = locA.localeCompare(locB);
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'signupGoal':
          comparison = (a.budgetAmount || 0) - (b.budgetAmount || 0);
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [events, sortField, sortDirection]);

  // Paginate events
  const totalPages = Math.ceil(sortedEvents.length / pageSize);
  const paginatedEvents = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedEvents.slice(start, start + pageSize);
  }, [sortedEvents, currentPage, pageSize]);

  // Sort icon component
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <ChevronsUpDown className="h-4 w-4 text-gray-400" />;
    }
    return sortDirection === 'asc' ? (
      <ChevronUp className="h-4 w-4 text-blue-600" />
    ) : (
      <ChevronDown className="h-4 w-4 text-blue-600" />
    );
  };

  // Sortable header component
  const SortableHeader = ({
    field,
    children,
  }: {
    field: SortField;
    children: React.ReactNode;
  }) => (
    <TableHead>
      <button
        onClick={() => handleSort(field)}
        className="flex items-center gap-1 hover:text-gray-900 transition-colors"
      >
        {children}
        <SortIcon field={field} />
      </button>
    </TableHead>
  );

  // Format location display
  const formatLocation = (event: Event): string => {
    const parts = [event.venue, event.city, event.state].filter(Boolean);
    if (parts.length === 0) return '—';
    if (event.venue && event.city) {
      return `${event.venue}, ${event.city}${event.state ? `, ${event.state}` : ''}`;
    }
    return parts.join(', ');
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Table (AC-EM-006.1) */}
      <Table>
        <TableHeader>
          <TableRow>
            <SortableHeader field="title">Event Name</SortableHeader>
            <SortableHeader field="eventDate">Date</SortableHeader>
            <SortableHeader field="location">Location</SortableHeader>
            <SortableHeader field="status">Status</SortableHeader>
            <TableHead>Ambassadors</TableHead>
            <SortableHeader field="signupGoal">Signup Goal</SortableHeader>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedEvents.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                No events found matching your filters.
              </TableCell>
            </TableRow>
          ) : (
            paginatedEvents.map((event) => (
              <TableRow
                key={event.id}
                className="cursor-pointer hover:bg-gray-50"
                onClick={() => onEventClick(event)}
              >
                {/* Event Name */}
                <TableCell>
                  <div>
                    <p className="font-medium text-gray-900">{event.title}</p>
                    {event.description && (
                      <p className="text-sm text-gray-500 truncate max-w-xs">
                        {event.description}
                      </p>
                    )}
                  </div>
                </TableCell>

                {/* Date */}
                <TableCell>
                  <div>
                    <p className="text-gray-900">
                      {new Date(event.eventDate).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </p>
                    {event.startTime && (
                      <p className="text-sm text-gray-500">
                        {event.startTime}
                        {event.endTime && ` - ${event.endTime}`}
                      </p>
                    )}
                  </div>
                </TableCell>

                {/* Location */}
                <TableCell>
                  <span className={event.venue ? 'text-gray-900' : 'text-gray-400'}>
                    {formatLocation(event)}
                  </span>
                </TableCell>

                {/* Status */}
                <TableCell>
                  <Badge className={STATUS_COLORS[event.status]}>{event.status}</Badge>
                </TableCell>

                {/* Ambassadors (placeholder - would need assignment data) */}
                <TableCell>
                  <span className="text-gray-400">—</span>
                </TableCell>

                {/* Signup Goal */}
                <TableCell>
                  {event.budgetAmount ? (
                    <span className="text-gray-900">{event.budgetAmount}</span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </TableCell>

                {/* Actions */}
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          onEventClick(event);
                        }}
                      >
                        <Eye className="mr-2 h-4 w-4" />
                        View Details
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          window.location.href = `/events/${event.id}`;
                        }}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit Event
                      </DropdownMenuItem>
                      {(onDuplicate || onBulkDuplicate) && <DropdownMenuSeparator />}
                      {onDuplicate && (
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            onDuplicate(event);
                          }}
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          Duplicate
                        </DropdownMenuItem>
                      )}
                      {onBulkDuplicate && (
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            onBulkDuplicate(event);
                          }}
                        >
                          <CalendarRange className="mr-2 h-4 w-4" />
                          Bulk Duplicate
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* Pagination (AC-EM-006.5) */}
      {sortedEvents.length > 0 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Show</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <span className="text-sm text-gray-500">per page</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">
              Showing {(currentPage - 1) * pageSize + 1} to{' '}
              {Math.min(currentPage * pageSize, sortedEvents.length)} of {sortedEvents.length}
            </span>
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="px-2 text-sm text-gray-700">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
