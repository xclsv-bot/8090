'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { eventsApi } from '@/lib/api';
import type { Event } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useWebSocket } from '@/hooks/useWebSocket';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Calendar, List, RefreshCw } from 'lucide-react';
import {
  EventDuplicateModal,
  BulkDuplicateModal,
  EventFiltersComponent,
  EventCalendar,
  EventListView,
  EventDetailModal,
  SmartEventCreateModal,
  defaultFilters,
} from '@/components/events';
import type { EventFilters } from '@/components/events';

type ViewMode = 'calendar' | 'list';

export default function EventsPage() {
  // Core state
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  
  // Filter state
  const [filters, setFilters] = useState<EventFilters>(defaultFilters);
  
  // WebSocket for real-time updates
  const { subscribe, isConnected } = useWebSocket();
  
  // Modal state
  const [duplicateEvent, setDuplicateEvent] = useState<Event | null>(null);
  const [bulkDuplicateEvent, setBulkDuplicateEvent] = useState<Event | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  
  // Create form state
  const [form, setForm] = useState({
    title: '',
    description: '',
    eventDate: '',
    venue: '',
    city: '',
    state: '',
    status: 'planned',
  });

  // Load events
  const loadEvents = useCallback(async () => {
    try {
      setLoading(true);
      const res = await eventsApi.list();
      setEvents(res.data || []);
    } catch (error) {
      console.error('Failed to load events:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Real-time updates via WebSocket
  useEffect(() => {
    // Subscribe to various event types for real-time updates
    const unsubUpdated = subscribe('event.updated', () => {
      console.log('Event updated - refreshing...');
      loadEvents();
    });
    const unsubCreated = subscribe('event.created', () => {
      console.log('Event created - refreshing...');
      loadEvents();
    });
    const unsubDeleted = subscribe('event.deleted', () => {
      console.log('Event deleted - refreshing...');
      loadEvents();
    });
    
    return () => {
      unsubUpdated();
      unsubCreated();
      unsubDeleted();
    };
  }, [subscribe, loadEvents]);

  // Extract unique locations for filter dropdown
  const uniqueLocations = useMemo(() => {
    const locations = new Set<string>();
    events.forEach((event) => {
      if (event.city) {
        const loc = event.state ? `${event.city}, ${event.state}` : event.city;
        locations.add(loc);
      }
    });
    return Array.from(locations).sort();
  }, [events]);

  // Filter events based on current filters
  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      // Search filter (AC-EM-006.4)
      if (filters.search) {
        const search = filters.search.toLowerCase();
        const matchesTitle = event.title.toLowerCase().includes(search);
        const matchesVenue = event.venue?.toLowerCase().includes(search) || false;
        const matchesCity = event.city?.toLowerCase().includes(search) || false;
        if (!matchesTitle && !matchesVenue && !matchesCity) {
          return false;
        }
      }

      // Status filter (AC-EM-005.4, AC-EM-006.3)
      if (filters.status && event.status !== filters.status) {
        return false;
      }

      // Location filter (AC-EM-005.4, AC-EM-006.3)
      if (filters.location) {
        const eventLocation = event.state
          ? `${event.city}, ${event.state}`
          : event.city || '';
        if (eventLocation !== filters.location) {
          return false;
        }
      }

      // Date range filter (AC-EM-006.3)
      if (filters.startDate) {
        const eventDate = new Date(event.eventDate);
        const startDate = new Date(filters.startDate);
        if (eventDate < startDate) {
          return false;
        }
      }
      if (filters.endDate) {
        const eventDate = new Date(event.eventDate);
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999);
        if (eventDate > endDate) {
          return false;
        }
      }

      // Ambassador filter (AC-EM-005.4) - would need assignment data
      // if (filters.ambassadorId) { ... }

      // Compensation type filter (AC-EM-006.3) - would need event compensation data
      // if (filters.compensationType) { ... }

      return true;
    });
  }, [events, filters]);

  // Handle create event
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await eventsApi.create({
        title: form.title,
        description: form.description || undefined,
        eventDate: form.eventDate,
        venue: form.venue || undefined,
        city: form.city || undefined,
        state: form.state || undefined,
        status: form.status as Event['status'],
      });
      setShowCreate(false);
      setForm({
        title: '',
        description: '',
        eventDate: '',
        venue: '',
        city: '',
        state: '',
        status: 'planned',
      });
      loadEvents();
    } catch (error) {
      console.error('Failed to create event:', error);
      alert('Failed to create event');
    } finally {
      setCreating(false);
    }
  };

  // Handle event click (AC-EM-005.6, AC-EM-006.6)
  const handleEventClick = (event: Event) => {
    setSelectedEvent(event);
  };

  // Handle delete event
  const handleDeleteEvent = async (event: Event) => {
    if (!confirm(`Are you sure you want to delete "${event.title}"? This cannot be undone.`)) {
      return;
    }
    try {
      await eventsApi.delete(event.id);
      loadEvents();
    } catch (error) {
      console.error('Failed to delete event:', error);
      alert('Failed to delete event');
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
          {/* Connection Status */}
          <Badge
            className={
              isConnected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
            }
          >
            {isConnected ? '● Live' : '○ Offline'}
          </Badge>
          
          {/* Refresh Button */}
          <Button variant="outline" size="sm" onClick={loadEvents} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          
          {/* View Toggle */}
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
          
          {/* Create Button */}
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Event
          </Button>
        </div>
      </div>

      {/* Filters */}
      <EventFiltersComponent
        filters={filters}
        onFiltersChange={setFilters}
        locations={uniqueLocations}
      />

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
        <EventCalendar
          events={filteredEvents}
          onEventClick={handleEventClick}
        />
      ) : (
        <EventListView
          events={filteredEvents}
          onEventClick={handleEventClick}
          onDuplicate={setDuplicateEvent}
          onBulkDuplicate={setBulkDuplicateEvent}
          onDelete={handleDeleteEvent}
        />
      )}

      {/* Smart Event Create Modal (WO-94) */}
      <SmartEventCreateModal
        open={showCreate}
        onOpenChange={setShowCreate}
        onCreated={loadEvents}
      />

      {/* Event Detail Modal (AC-EM-005.6, AC-EM-006.6) */}
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

      {/* Single Duplicate Modal */}
      {duplicateEvent && (
        <EventDuplicateModal
          open={!!duplicateEvent}
          onOpenChange={(open) => !open && setDuplicateEvent(null)}
          event={duplicateEvent}
          onSuccess={() => loadEvents()}
        />
      )}

      {/* Bulk Duplicate Modal */}
      {bulkDuplicateEvent && (
        <BulkDuplicateModal
          open={!!bulkDuplicateEvent}
          onOpenChange={(open) => !open && setBulkDuplicateEvent(null)}
          event={bulkDuplicateEvent}
          onSuccess={() => loadEvents()}
        />
      )}
    </div>
  );
}
