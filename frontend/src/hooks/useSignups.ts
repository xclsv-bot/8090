/**
 * useSignups Hook
 * WO-99: Custom hook for signup data fetching and operations
 */

import { useEffect, useState, useCallback } from 'react';
import { signupsApi, eventsApi, ambassadorsApi, operatorsApi } from '@/lib/api';
import type { Signup, Event, Ambassador, Operator } from '@/types';

export interface UseSignupsOptions {
  startDate?: string;
  endDate?: string;
  limit?: number;
}

export interface SignupStats {
  total: number;
  validated: number;
  pending: number;
  rejected: number;
  revenue: number;
}

export interface UseSignupsReturn {
  signups: Signup[];
  events: Event[];
  ambassadors: Ambassador[];
  operators: Operator[];
  loading: boolean;
  error: Error | null;
  stats: SignupStats;
  reload: () => Promise<void>;
  validate: (id: string, status: 'validated' | 'rejected', notes?: string) => Promise<void>;
  getAmbassadorName: (signup: Signup) => string | null;
  getOperatorName: (signup: Signup) => string;
}

export function useSignups(options: UseSignupsOptions = {}): UseSignupsReturn {
  const { startDate, endDate, limit = 500 } = options;

  const [signups, setSignups] = useState<Signup[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [ambassadors, setAmbassadors] = useState<Ambassador[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Load signups
  const loadSignups = useCallback(async () => {
    try {
      let response;
      try {
        response = await signupsApi.list({ startDate, endDate, limit });
      } catch {
        // Fallback: load without date filter
        response = await signupsApi.list({ limit });
      }
      setSignups(response.data || []);
    } catch (err) {
      console.error('Failed to load signups:', err);
      setError(err instanceof Error ? err : new Error('Failed to load signups'));
    }
  }, [startDate, endDate, limit]);

  // Load reference data
  const loadReferenceData = useCallback(async () => {
    try {
      const [eventsRes, ambassadorsRes, operatorsRes] = await Promise.all([
        eventsApi.list(),
        ambassadorsApi.list(),
        operatorsApi.list(),
      ]);
      setEvents(eventsRes.data || []);
      setAmbassadors(ambassadorsRes.data || []);
      setOperators(operatorsRes.data || []);
    } catch (err) {
      console.error('Failed to load reference data:', err);
    }
  }, []);

  // Reload all data
  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadSignups(), loadReferenceData()]);
    } finally {
      setLoading(false);
    }
  }, [loadSignups, loadReferenceData]);

  // Validate signup
  const validate = useCallback(async (id: string, status: 'validated' | 'rejected', notes?: string) => {
    await signupsApi.validate(id, status, notes);
    await loadSignups();
  }, [loadSignups]);

  // Get ambassador name helper
  const getAmbassadorName = useCallback((signup: Signup): string | null => {
    if (signup.ambassador) {
      return `${signup.ambassador.firstName} ${signup.ambassador.lastName}`;
    }
    const ambassador = ambassadors.find(a => a.id === signup.ambassadorId);
    if (ambassador) {
      return `${ambassador.firstName} ${ambassador.lastName}`;
    }
    return null;
  }, [ambassadors]);

  // Get operator name helper
  const getOperatorName = useCallback((signup: Signup): string => {
    if (signup.operatorName) return signup.operatorName;
    const operator = operators.find(o => o.id === String(signup.operatorId));
    return operator?.name || `Operator #${signup.operatorId}`;
  }, [operators]);

  // Calculate stats
  const stats: SignupStats = {
    total: signups.length,
    validated: signups.filter(s => s.validationStatus === 'validated').length,
    pending: signups.filter(s => s.validationStatus === 'pending').length,
    rejected: signups.filter(s => s.validationStatus === 'rejected').length,
    revenue: signups.reduce((sum, s) => sum + Number(s.cpaAmount || 0), 0),
  };

  // Initial load
  useEffect(() => {
    reload();
  }, [reload]);

  return {
    signups,
    events,
    ambassadors,
    operators,
    loading,
    error,
    stats,
    reload,
    validate,
    getAmbassadorName,
    getOperatorName,
  };
}
