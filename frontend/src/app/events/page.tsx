'use client';

import { useState } from 'react';
import type { Event } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useEvents } from '@/hooks/useEvents';
import { useEventFilters } from '@/hooks/useEventFilters';
import { Plus, Calendar, List, RefreshCw } from 'lucide-react';
import {
  EventDuplicateModal,
  BulkDuplicateModal,
  EventFiltersComponent,
  EventCalendar,
  EventListView,
  EventDetailModal,
  SmartEventCreateModal,
} from '@/components/events';

type ViewMode = 'calendar' | 'list';

export default function EventsPage() {
  // Data & state from hooks
  const { events, loading, isConnected, reload, remove, updateStatus } = useEvents();
  const { filters, setFilters, filteredEvents, uniqueLocations } = useEventFilters(events);

  // UI state
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [showCreate, setShowCreate] = useState(false);

  // Modal state
  const [duplicateEvent, setDuplicateEvent] = useState<Event | null>(null);
  const [bulkDuplicateEvent, setBulkDuplicateEvent] = useState<Event | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);

  // Handlers
  const handleDeleteEvent = async (event: Event) => {
    if (!confirm(`Are you sure you want to delete "${event.title}"? This cannot be undone.`)) {
      return;
    }
    try {
      await remove(event.id);
    } catch (error) {
      console.error('Failed to delete event:', error);
      alert('Failed to delete event');
    }
  };

  const handleStatusChange = async (event: Event, newStatus: Event['status']) => {
    try {
      await updateStatus(event.id, newStatus);
    } catch (error) {
      console.error('Failed to update status:', error);
      alert('Failed to update event status');
    }
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Events</h1>
          <p className="text-gray-600">Manage events and assignments</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={isConnected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>
            {isConnected ? '● Live' : '○ Offline'}
          </Badge>

          <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          <div className="flex items-center border rounded-lg p-1 bg-gray-100">
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className="px-3"
            >
              <List className="h-4 w-4 mr-1" />
              List
            </Button>
            <Button
              variant={viewMode === 'calendar' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('calendar')}
              className="px-3"
            >
              <Calendar className="h-4 w-4 mr-1" />
              Calendar
            </Button>
          </div>

          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Event
          </Button>
        </div>
      </div>

      {/* Filters */}
      <EventFiltersComponent filters={filters} onFiltersChange={setFilters} locations={uniqueLocations} />

      {/* Results Summary */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-500">
          Showing {filteredEvents.length} of {events.length} events
        </p>
      </div>

      {/* Main Content */}
      {loading ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <RefreshCw className="h-8 w-8 mx-auto text-gray-400 animate-spin mb-4" />
          <p className="text-gray-500">Loading events...</p>
        </div>
      ) : events.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <Calendar className="mx-auto h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No events yet</h3>
          <p className="mt-1 text-gray-500">Get started by creating your first event.</p>
          <Button className="mt-4" onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create Event
          </Button>
        </div>
      ) : viewMode === 'calendar' ? (
        <EventCalendar events={filteredEvents} onEventClick={setSelectedEvent} />
      ) : (
        <EventListView
          events={filteredEvents}
          onEventClick={setSelectedEvent}
          onDuplicate={setDuplicateEvent}
          onBulkDuplicate={setBulkDuplicateEvent}
          onDelete={handleDeleteEvent}
          onStatusChange={handleStatusChange}
        />
      )}

      {/* Modals */}
      <SmartEventCreateModal open={showCreate} onOpenChange={setShowCreate} onCreated={reload} />

      <EventDetailModal
        open={!!selectedEvent}
        onOpenChange={(open) => !open && setSelectedEvent(null)}
        event={selectedEvent}
        onDuplicate={(event) => {
          setSelectedEvent(null);
          setDuplicateEvent(event);
        }}
        onBulkDuplicate={(event) => {
          setSelectedEvent(null);
          setBulkDuplicateEvent(event);
        }}
      />

      {duplicateEvent && (
        <EventDuplicateModal
          open={!!duplicateEvent}
          onOpenChange={(open) => !open && setDuplicateEvent(null)}
          event={duplicateEvent}
          onSuccess={reload}
        />
      )}

      {bulkDuplicateEvent && (
        <BulkDuplicateModal
          open={!!bulkDuplicateEvent}
          onOpenChange={(open) => !open && setBulkDuplicateEvent(null)}
          event={bulkDuplicateEvent}
          onSuccess={reload}
        />
      )}
    </div>
  );
}
