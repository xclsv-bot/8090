/**
 * Analytics API
 * WO-98: Domain module for analytics operations (WO-4)
 */

import type { DashboardMetrics } from '@/types';
import { get, post, put } from './client';

// ============================================
// ANALYTICS API
// ============================================

export const analyticsApi = {
  /** Create daily snapshot */
  createSnapshot: () => post<unknown>('/api/v1/analytics/snapshot'),

  /** Get historical snapshots */
  getSnapshots: (type: string, from: string, to: string) =>
    get<unknown[]>(`/api/v1/analytics/snapshots?type=${type}&from=${from}&to=${to}`),

  /** Get event metrics dashboard */
  getEventMetrics: (from: string, to: string) =>
    get<Record<string, unknown>>(`/api/v1/analytics/events?from=${from}&to=${to}`),

  /** Get ambassador metrics dashboard */
  getAmbassadorMetrics: (from: string, to: string) =>
    get<Record<string, unknown>>(`/api/v1/analytics/ambassadors?from=${from}&to=${to}`),

  /** Get financial metrics dashboard */
  getFinancialMetrics: (from: string, to: string) =>
    get<Record<string, unknown>>(`/api/v1/analytics/financial?from=${from}&to=${to}`),

  /** Get KPIs */
  getKPIs: () => get<DashboardMetrics>('/api/v1/analytics/kpis'),

  /** Set KPI target */
  setKPITarget: (name: string, targetValue: number) =>
    put<{ updated: boolean }>(`/api/v1/analytics/kpis/${name}/target`, { targetValue }),

  /** Export analytics data */
  exportData: (type: string, from: string, to: string, format: 'csv' | 'json' = 'json') =>
    get<unknown>(`/api/v1/analytics/export/${type}?from=${from}&to=${to}&format=${format}`),
};
