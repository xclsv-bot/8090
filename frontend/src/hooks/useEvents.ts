/**
 * useEvents Hook
 * WO-99: Custom hook for event data fetching, CRUD, and WebSocket subscriptions
 */

import { useEffect, useState, useCallback } from 'react';
import { eventsApi } from '@/lib/api';
import type { Event } from '@/types';
import { useWebSocket } from './useWebSocket';

export interface UseEventsOptions {
  /** Auto-load on mount */
  autoLoad?: boolean;
  /** Enable WebSocket real-time updates */
  realtime?: boolean;
}

export interface UseEventsReturn {
  /** Events data */
  events: Event[];
  /** Loading state */
  loading: boolean;
  /** Error state */
  error: Error | null;
  /** WebSocket connection status */
  isConnected: boolean;
  /** Reload events */
  reload: () => Promise<void>;
  /** Create event */
  create: (data: Partial<Event>) => Promise<Event>;
  /** Update event */
  update: (id: string, data: Partial<Event>) => Promise<Event>;
  /** Delete event */
  remove: (id: string) => Promise<void>;
  /** Update event status */
  updateStatus: (id: string, status: Event['status']) => Promise<void>;
}

export function useEvents(options: UseEventsOptions = {}): UseEventsReturn {
  const { autoLoad = true, realtime = true } = options;

  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const { subscribe, isConnected } = useWebSocket();

  // Load events
  const reload = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await eventsApi.list();
      setEvents(res.data || []);
    } catch (err) {
      console.error('Failed to load events:', err);
      setError(err instanceof Error ? err : new Error('Failed to load events'));
    } finally {
      setLoading(false);
    }
  }, []);

  // Create event
  const create = useCallback(async (data: Partial<Event>): Promise<Event> => {
    const res = await eventsApi.create(data);
    await reload();
    return res.data;
  }, [reload]);

  // Update event
  const update = useCallback(async (id: string, data: Partial<Event>): Promise<Event> => {
    const res = await eventsApi.update(id, data);
    await reload();
    return res.data;
  }, [reload]);

  // Delete event
  const remove = useCallback(async (id: string): Promise<void> => {
    await eventsApi.delete(id);
    await reload();
  }, [reload]);

  // Update status
  const updateStatus = useCallback(async (id: string, status: Event['status']): Promise<void> => {
    await eventsApi.update(id, { status });
    await reload();
  }, [reload]);

  // Initial load
  useEffect(() => {
    if (autoLoad) {
      reload();
    }
  }, [autoLoad, reload]);

  // Real-time updates via WebSocket
  useEffect(() => {
    if (!realtime) return;

    const unsubUpdated = subscribe('event.updated', () => {
      console.log('Event updated - refreshing...');
      reload();
    });
    const unsubCreated = subscribe('event.created', () => {
      console.log('Event created - refreshing...');
      reload();
    });
    const unsubDeleted = subscribe('event.deleted', () => {
      console.log('Event deleted - refreshing...');
      reload();
    });

    return () => {
      unsubUpdated();
      unsubCreated();
      unsubDeleted();
    };
  }, [realtime, subscribe, reload]);

  return {
    events,
    loading,
    error,
    isConnected,
    reload,
    create,
    update,
    remove,
    updateStatus,
  };
}
