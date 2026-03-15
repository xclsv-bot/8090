'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { trafficPredictionAPI } from '@/services/trafficPredictionAPI';
import type {
  GameSchedule,
  Recommendation,
  TrafficScoreResponse,
  VenueHistoryData,
} from '@/types/trafficPrediction';

interface UseTrafficPredictionInput {
  venueId?: string;
  region?: string;
  date?: string;
  time?: string;
  week?: number;
  autoFetch?: boolean;
  debounceMs?: number;
}

interface EndpointState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

type CacheEntry<T> = { data: T; expiresAt: number };

const CACHE_TTL_MS = 2 * 60 * 1000;

export function useTrafficPrediction({
  venueId,
  region,
  date,
  time,
  week = 1,
  autoFetch = true,
  debounceMs = 350,
}: UseTrafficPredictionInput = {}) {
  const cacheRef = useRef<Map<string, CacheEntry<unknown>>>(new Map());

  const [scoreState, setScoreState] = useState<EndpointState<TrafficScoreResponse>>({
    data: null,
    loading: false,
    error: null,
  });

  const [recommendationsState, setRecommendationsState] = useState<EndpointState<Recommendation[]>>({
    data: null,
    loading: false,
    error: null,
  });

  const [sportsCalendarState, setSportsCalendarState] = useState<EndpointState<GameSchedule[]>>({
    data: null,
    loading: false,
    error: null,
  });

  const [venueHistoryState, setVenueHistoryState] = useState<EndpointState<VenueHistoryData>>({
    data: null,
    loading: false,
    error: null,
  });

  const readCache = useCallback(<T,>(key: string): T | null => {
    const cached = cacheRef.current.get(key) as CacheEntry<T> | undefined;
    if (!cached) return null;
    if (cached.expiresAt < Date.now()) {
      cacheRef.current.delete(key);
      return null;
    }
    return cached.data;
  }, []);

  const writeCache = useCallback(<T,>(key: string, data: T) => {
    cacheRef.current.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  }, []);

  const getTrafficScore = useCallback(async (
    targetVenueId: string,
    targetDate: string,
    targetTime: string
  ): Promise<TrafficScoreResponse | null> => {
    if (!targetVenueId || !targetDate) return null;

    const key = `score:${targetVenueId}:${targetDate}:${targetTime}`;
    const cached = readCache<TrafficScoreResponse>(key);
    if (cached) {
      setScoreState({ data: cached, loading: false, error: null });
      return cached;
    }

    setScoreState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await trafficPredictionAPI.getTrafficScore(targetVenueId, targetDate, targetTime);
      writeCache(key, data);
      setScoreState({ data, loading: false, error: null });
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load traffic score';
      setScoreState((prev) => ({ ...prev, loading: false, error: message }));
      return null;
    }
  }, [readCache, writeCache]);

  const getRecommendations = useCallback(async (
    targetWeek: number,
    targetRegion: string
  ): Promise<Recommendation[]> => {
    if (!targetRegion) return [];

    const key = `recommendations:${targetWeek}:${targetRegion}`;
    const cached = readCache<Recommendation[]>(key);
    if (cached) {
      setRecommendationsState({ data: cached, loading: false, error: null });
      return cached;
    }

    setRecommendationsState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await trafficPredictionAPI.getRecommendations(targetWeek, targetRegion);
      writeCache(key, data);
      setRecommendationsState({ data, loading: false, error: null });
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load recommendations';
      setRecommendationsState((prev) => ({ ...prev, loading: false, error: message }));
      return [];
    }
  }, [readCache, writeCache]);

  const getSportsCalendar = useCallback(async (
    targetDate: string,
    targetRegion: string
  ): Promise<GameSchedule[]> => {
    if (!targetDate || !targetRegion) return [];

    const key = `calendar:${targetDate}:${targetRegion}`;
    const cached = readCache<GameSchedule[]>(key);
    if (cached) {
      setSportsCalendarState({ data: cached, loading: false, error: null });
      return cached;
    }

    setSportsCalendarState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await trafficPredictionAPI.getSportsCalendar(targetDate, targetRegion);
      writeCache(key, data);
      setSportsCalendarState({ data, loading: false, error: null });
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load sports calendar';
      setSportsCalendarState((prev) => ({ ...prev, loading: false, error: message }));
      return [];
    }
  }, [readCache, writeCache]);

  const getVenueHistory = useCallback(async (targetVenueId: string): Promise<VenueHistoryData | null> => {
    if (!targetVenueId) return null;

    const key = `venue-history:${targetVenueId}`;
    const cached = readCache<VenueHistoryData>(key);
    if (cached) {
      setVenueHistoryState({ data: cached, loading: false, error: null });
      return cached;
    }

    setVenueHistoryState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await trafficPredictionAPI.getVenueHistory(targetVenueId);
      writeCache(key, data);
      setVenueHistoryState({ data, loading: false, error: null });
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load venue history';
      setVenueHistoryState((prev) => ({ ...prev, loading: false, error: message }));
      return null;
    }
  }, [readCache, writeCache]);

  useEffect(() => {
    if (!autoFetch) return;

    const timer = setTimeout(() => {
      if (venueId && date) {
        void getTrafficScore(venueId, date, time || '18:00');
      }
      if (region) {
        void getRecommendations(week, region);
      }
      if (region && date) {
        void getSportsCalendar(date, region);
      }
      if (venueId) {
        void getVenueHistory(venueId);
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [
    autoFetch,
    venueId,
    region,
    date,
    time,
    week,
    debounceMs,
    getTrafficScore,
    getRecommendations,
    getSportsCalendar,
    getVenueHistory,
  ]);

  const isLoading = useMemo(
    () => scoreState.loading || recommendationsState.loading || sportsCalendarState.loading || venueHistoryState.loading,
    [scoreState.loading, recommendationsState.loading, sportsCalendarState.loading, venueHistoryState.loading]
  );

  return {
    score: scoreState,
    recommendations: recommendationsState,
    sportsCalendar: sportsCalendarState,
    venueHistory: venueHistoryState,
    isLoading,
    getTrafficScore,
    getRecommendations,
    getSportsCalendar,
    getVenueHistory,
    clearCache: () => cacheRef.current.clear(),
  };
}
