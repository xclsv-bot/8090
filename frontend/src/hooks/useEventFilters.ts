/**
 * useEventFilters Hook
 * WO-99: Custom hook for event filtering logic
 */

import { useState, useMemo, useCallback } from 'react';
import type { Event } from '@/types';
import type { EventFilters } from '@/components/events';
import { defaultFilters } from '@/components/events';

export interface UseEventFiltersReturn {
  /** Current filters */
  filters: EventFilters;
  /** Update filters */
  setFilters: React.Dispatch<React.SetStateAction<EventFilters>>;
  /** Reset filters to default */
  resetFilters: () => void;
  /** Filtered events */
  filteredEvents: Event[];
  /** Unique locations for filter dropdown */
  uniqueLocations: string[];
  /** Has any active filters */
  hasActiveFilters: boolean;
}

export function useEventFilters(events: Event[]): UseEventFiltersReturn {
  const [filters, setFilters] = useState<EventFilters>(defaultFilters);

  // Reset filters
  const resetFilters = useCallback(() => {
    setFilters(defaultFilters);
  }, []);

  // Check if any filters are active
  const hasActiveFilters = useMemo(() => {
    return !!(
      filters.search ||
      filters.status ||
      filters.location ||
      filters.startDate ||
      filters.endDate
    );
  }, [filters]);

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
      // Search filter
      if (filters.search) {
        const search = filters.search.toLowerCase();
        const matchesTitle = event.title.toLowerCase().includes(search);
        const matchesVenue = event.venue?.toLowerCase().includes(search) || false;
        const matchesCity = event.city?.toLowerCase().includes(search) || false;
        if (!matchesTitle && !matchesVenue && !matchesCity) {
          return false;
        }
      }

      // Status filter
      if (filters.status && event.status !== filters.status) {
        return false;
      }

      // Location filter
      if (filters.location) {
        const eventLocation = event.state
          ? `${event.city}, ${event.state}`
          : event.city || '';
        if (eventLocation !== filters.location) {
          return false;
        }
      }

      // Date range filter
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

      return true;
    });
  }, [events, filters]);

  return {
    filters,
    setFilters,
    resetFilters,
    filteredEvents,
    uniqueLocations,
    hasActiveFilters,
  };
}
