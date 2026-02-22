/**
 * Health API
 * WO-98: Domain module for health checks
 */

import { get } from './client';

// ============================================
// HEALTH API
// ============================================

export const healthApi = {
  /** Check API health */
  check: () => get<{ status: string }>('/health'),
};
