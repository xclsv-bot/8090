/**
 * Ambassadors API
 * WO-98: Domain module for ambassador operations
 */

import type { Ambassador } from '@/types';
import { get, post, put, buildQueryString } from './client';

// ============================================
// AMBASSADORS API
// ============================================

export const ambassadorsApi = {
  /** List ambassadors with optional filters */
  list: (params?: { page?: number; limit?: number; status?: string }) => {
    const query = buildQueryString(params);
    return get<Ambassador[]>(`/api/v1/ambassadors${query}`);
  },

  /** Get single ambassador by ID */
  get: (id: string) => get<Ambassador>(`/api/v1/ambassadors/${id}`),

  /** Create new ambassador */
  create: (data: Partial<Ambassador>) => post<Ambassador>('/api/v1/ambassadors', data),

  /** Update existing ambassador */
  update: (id: string, data: Partial<Ambassador>) => put<Ambassador>(`/api/v1/ambassadors/${id}`, data),

  /** Get ambassador performance metrics */
  getPerformance: (id: string) =>
    get<{ signups: number; events: number; earnings: number }>(`/api/v1/ambassadors/${id}/performance`),
};
