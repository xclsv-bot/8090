/**
 * CPA Rates API
 * WO-98: Domain module for CPA rate operations (WO-3)
 */

import type { CpaRate } from '@/types';
import { get, post, put, del, buildQueryString } from './client';

// ============================================
// CPA API
// ============================================

export const cpaApi = {
  /** List all CPA rates */
  list: () => get<CpaRate[]>('/api/v1/cpa/rates'),

  /** Get CPA rates by operator */
  getByOperator: (operatorId: number, activeOnly = true) =>
    get<CpaRate[]>(`/api/v1/cpa/rates/operator/${operatorId}?activeOnly=${activeOnly}`),

  /** Get CPA rates by state */
  getByState: (stateCode: string, date?: string) => {
    const query = date ? `?date=${date}` : '';
    return get<CpaRate[]>(`/api/v1/cpa/rates/state/${stateCode}${query}`);
  },

  /** Get single CPA rate by ID */
  get: (id: string) => get<CpaRate>(`/api/v1/cpa/rates/${id}`),

  /** Lookup CPA rate for operator/state combination */
  lookup: (operatorId: number, stateCode: string, date?: string) => {
    const query = buildQueryString({ operatorId, stateCode, date });
    return get<CpaRate | null>(`/api/v1/cpa/lookup${query}`);
  },

  /** Create new CPA rate */
  create: (data: Partial<CpaRate>) => post<CpaRate>('/api/v1/cpa/rates', data),

  /** Update existing CPA rate */
  update: (id: string, data: Partial<CpaRate>) => put<CpaRate>(`/api/v1/cpa/rates/${id}`, data),

  /** Deactivate CPA rate */
  deactivate: (id: string) => del<{ deactivated: boolean }>(`/api/v1/cpa/rates/${id}`),

  /** Bulk import CPA rates */
  bulkImport: (rates: Partial<CpaRate>[]) =>
    post<{ imported: number; errors: string[] }>('/api/v1/cpa/rates/bulk', { rates }),

  /** Calculate CPA for a signup */
  calculateSignupCpa: (signupId: string) =>
    post<{ signupId: string; cpaAmount: number }>(`/api/v1/cpa/calculate/${signupId}`),

  /** Get CPA tiers */
  getTiers: (operatorId?: number) => {
    const query = operatorId ? `?operatorId=${operatorId}` : '';
    return get<unknown[]>(`/api/v1/cpa/tiers${query}`);
  },
};
