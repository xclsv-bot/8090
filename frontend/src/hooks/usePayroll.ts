/**
 * usePayroll Hook
 * WO-99: Custom hook for payroll data and period management
 */

import { useEffect, useState, useCallback } from 'react';
import { payrollApi } from '@/lib/api';
import type { PayPeriod, PayrollRecord } from '@/types';

export interface UsePayrollReturn {
  periods: PayPeriod[];
  currentPeriod: PayPeriod | null;
  statements: PayrollRecord[];
  loading: boolean;
  error: Error | null;
  selectedPeriodId: string | null;
  setSelectedPeriodId: (id: string | null) => void;
  reload: () => Promise<void>;
  loadStatements: (periodId: string) => Promise<void>;
  calculatePayroll: (periodId: string) => Promise<void>;
  approvePeriod: (periodId: string) => Promise<void>;
  processPayments: (periodId: string) => Promise<{ processed: number; failed: number }>;
}

export function usePayroll(): UsePayrollReturn {
  const [periods, setPeriods] = useState<PayPeriod[]>([]);
  const [currentPeriod, setCurrentPeriod] = useState<PayPeriod | null>(null);
  const [statements, setStatements] = useState<PayrollRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);

  // Load periods
  const loadPeriods = useCallback(async () => {
    try {
      const [periodsRes, currentRes] = await Promise.all([
        payrollApi.listPeriods(12),
        payrollApi.getCurrentPeriod().catch(() => ({ data: null })),
      ]);
      setPeriods(periodsRes.data || []);
      setCurrentPeriod(currentRes.data);
      
      // Auto-select current period if none selected
      if (!selectedPeriodId && currentRes.data) {
        setSelectedPeriodId(currentRes.data.id);
      }
    } catch (err) {
      console.error('Failed to load periods:', err);
      setError(err instanceof Error ? err : new Error('Failed to load periods'));
    }
  }, [selectedPeriodId]);

  // Load statements for a period
  const loadStatements = useCallback(async (periodId: string) => {
    try {
      const res = await payrollApi.getStatements(periodId);
      setStatements(res.data || []);
    } catch (err) {
      console.error('Failed to load statements:', err);
      setStatements([]);
    }
  }, []);

  // Reload all
  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await loadPeriods();
      if (selectedPeriodId) {
        await loadStatements(selectedPeriodId);
      }
    } finally {
      setLoading(false);
    }
  }, [loadPeriods, loadStatements, selectedPeriodId]);

  // Calculate payroll
  const calculatePayroll = useCallback(async (periodId: string) => {
    await payrollApi.calculatePayroll(periodId);
    await loadStatements(periodId);
  }, [loadStatements]);

  // Approve period
  const approvePeriod = useCallback(async (periodId: string) => {
    await payrollApi.approvePeriod(periodId);
    await loadPeriods();
  }, [loadPeriods]);

  // Process payments
  const processPayments = useCallback(async (periodId: string) => {
    const result = await payrollApi.processPayments(periodId);
    await loadPeriods();
    return result.data;
  }, [loadPeriods]);

  // Initial load
  useEffect(() => {
    reload();
  }, []);

  // Load statements when period changes
  useEffect(() => {
    if (selectedPeriodId) {
      loadStatements(selectedPeriodId);
    }
  }, [selectedPeriodId, loadStatements]);

  return {
    periods,
    currentPeriod,
    statements,
    loading,
    error,
    selectedPeriodId,
    setSelectedPeriodId,
    reload,
    loadStatements,
    calculatePayroll,
    approvePeriod,
    processPayments,
  };
}
