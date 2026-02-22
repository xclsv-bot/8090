/**
 * Signups API
 * WO-98: Domain module for signup operations (WO-55, WO-67, WO-68, WO-69, WO-70)
 */

import type {
  Signup,
  ExtractionQueueResponse,
  ExtractionStats,
  SyncFailure,
  SyncStats,
  SignupAuditEntry,
  SignupDashboardStats,
} from '@/types';
import { get, post, patch, buildQueryString } from './client';

// ============================================
// SIGNUPS API
// ============================================

export const signupsApi = {
  // ----------------------------------------
  // Core CRUD
  // ----------------------------------------

  /** List signups with filters */
  list: (params?: {
    page?: number;
    limit?: number;
    status?: string;
    validationStatus?: string;
    eventId?: string;
    ambassadorId?: string;
    operatorId?: string;
    startDate?: string;
    endDate?: string;
    extractionStatus?: string;
    search?: string;
  }) => {
    // Transform startDate/endDate to fromDate/toDate for backend compatibility
    const queryParams: Record<string, string> = {};
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          if (key === 'startDate') queryParams.fromDate = String(value);
          else if (key === 'endDate') queryParams.toDate = String(value);
          else queryParams[key] = String(value);
        }
      });
    }
    const query = buildQueryString(queryParams);
    return get<Signup[]>(`/api/v1/signups${query}`);
  },

  /** Get single signup by ID */
  get: (id: string) => get<Signup>(`/api/v1/signups/${id}`),

  /** Create new signup */
  create: (data: Partial<Signup>) => post<Signup>('/api/v1/signups', data),

  // ----------------------------------------
  // Validation
  // ----------------------------------------

  /** Validate a signup */
  validate: (id: string, status: 'validated' | 'rejected' | 'duplicate', notes?: string) =>
    patch<Signup>(`/api/v1/signups/${id}/validate`, { status, notes }),

  /** Get validation queue */
  getValidationQueue: (limit?: number) =>
    get<Signup[]>(`/api/v1/signups/queue${limit ? `?limit=${limit}` : ''}`),

  // ----------------------------------------
  // Stats
  // ----------------------------------------

  /** Get signup statistics */
  getStats: (from?: string, to?: string) => {
    const query = buildQueryString({ from, to });
    return get<SignupDashboardStats>(`/api/v1/signups/stats${query}`);
  },

  // ----------------------------------------
  // WO-68: Extraction Review
  // ----------------------------------------

  /** Get extraction review queue */
  getExtractionQueue: (params?: {
    operatorId?: number;
    ambassadorId?: string;
    minConfidence?: number;
    maxConfidence?: number;
    missingFields?: 'bet_amount' | 'team_bet_on' | 'odds' | 'any';
    sortBy?: 'confidence' | 'submitted_at' | 'priority';
    sortOrder?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
  }) => {
    const query = buildQueryString(params);
    return get<ExtractionQueueResponse>(`/api/v1/signups/extraction/review-queue${query}`);
  },

  /** Confirm extraction with optional corrections */
  confirmExtraction: (id: string, corrections?: { betAmount?: number; teamBetOn?: string; odds?: string }) =>
    post<{ id: string; extractionStatus: string; betAmount?: number; teamBetOn?: string; odds?: string }>(
      `/api/v1/signups/extraction/${id}/extraction/confirm`,
      corrections || {}
    ),

  /** Skip extraction review */
  skipExtraction: (id: string, reason?: string) =>
    post<{ id: string; extractionStatus: string }>(
      `/api/v1/signups/extraction/${id}/extraction/skip`,
      { reason }
    ),

  /** Get extraction statistics */
  getExtractionStats: () => get<ExtractionStats>('/api/v1/signups/extraction/stats'),

  // ----------------------------------------
  // WO-69: Customer.io Sync
  // ----------------------------------------

  /** Get sync failures */
  getSyncFailures: (params?: {
    syncPhase?: 'initial' | 'enriched';
    errorType?: 'rate_limit' | 'server_error' | 'network' | 'other';
    search?: string;
    limit?: number;
    offset?: number;
  }) => {
    const query = buildQueryString(params);
    return get<SyncFailure[]>(`/api/v1/signups/customerio/sync-failures${query}`);
  },

  /** Retry failed sync */
  retrySync: (id: string, syncPhase?: 'initial' | 'enriched') =>
    post<{ retriedJobs: string[]; message: string }>(
      `/api/v1/signups/customerio/${id}/retry`,
      syncPhase ? { syncPhase } : {}
    ),

  /** Get sync statistics */
  getSyncStats: () => get<SyncStats>('/api/v1/signups/customerio/stats'),

  // ----------------------------------------
  // WO-67: Audit & Submission
  // ----------------------------------------

  /** Get audit log for a signup */
  getAuditLog: (id: string) => get<SignupAuditEntry[]>(`/api/v1/signups/${id}/audit`),

  /** Submit event sign-up */
  submitEventSignup: (data: {
    eventId: string;
    operatorId: number;
    customerName: string;
    customerEmail: string;
    customerPhone?: string;
    customerState?: string;
    idempotencyKey: string;
    betSlipPhoto?: string;
    betSlipContentType?: string;
  }) => post<Signup>('/api/v1/signups/event', data),

  /** Submit solo sign-up */
  submitSoloSignup: (data: {
    soloChatId: string;
    operatorId: number;
    customerName: string;
    customerEmail: string;
    customerPhone?: string;
    customerState?: string;
    idempotencyKey: string;
    betSlipPhoto?: string;
    betSlipContentType?: string;
  }) => post<Signup>('/api/v1/signups/solo', data),

  /** Check for duplicate signup */
  checkDuplicate: (email: string, operatorId: number) =>
    post<{ isDuplicate: boolean; existingSignupId?: string }>(
      '/api/v1/signups/check-duplicate',
      { email, operatorId }
    ),
};
