/**
 * Events API
 * WO-98: Domain module for event operations
 */

import type { Event, EventBudgetData, ApiResponse } from '@/types';
import { get, post, put, del, buildQueryString, transformKeysToCamel } from './client';

// ============================================
// TYPES
// ============================================

export type RecurrencePattern = 'weekly' | 'bi-weekly' | 'monthly';

export interface DuplicateEventInput {
  eventDate: string;
  startTime?: string;
  endTime?: string;
  title?: string;
}

export interface BulkDuplicateEventInput {
  recurrencePattern: RecurrencePattern;
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
  skipConflicts?: boolean;
}

export interface BulkDuplicateResult {
  totalRequested: number;
  successCount: number;
  failureCount: number;
  skippedCount: number;
  createdEvents: Event[];
  failures: Array<{
    date: string;
    reason: string;
    code: 'PAST_DATE' | 'CONFLICT' | 'VALIDATION_ERROR' | 'DATABASE_ERROR';
  }>;
}

export interface BulkDuplicatePreview {
  totalDates: number;
  dates: string[];
  conflicts: string[];
  conflictCount: number;
  pastDates: string[];
  pastDateCount: number;
  validCount: number;
}

// ============================================
// BUDGET HELPERS
// ============================================

/**
 * Transform budget response, converting numeric strings to numbers
 */
function transformBudgetResponse(data: Record<string, unknown> | null | undefined): EventBudgetData | null {
  if (!data) return null;
  const transformed = transformKeysToCamel(data) as Record<string, unknown>;
  
  const numericFields = [
    'budgetStaff', 'budgetReimbursements', 'budgetRewards', 'budgetBase',
    'budgetBonusKickback', 'budgetParking', 'budgetSetup', 'budgetAdditional1',
    'budgetAdditional2', 'budgetAdditional3', 'budgetAdditional4', 'budgetTotal',
    'projectedSignups', 'projectedRevenue', 'projectedProfit', 'projectedMarginPercent'
  ];
  
  for (const field of numericFields) {
    if (transformed[field] !== undefined && transformed[field] !== null) {
      transformed[field] = parseFloat(String(transformed[field])) || 0;
    }
  }
  
  return transformed as EventBudgetData;
}

// ============================================
// EVENTS API
// ============================================

export const eventsApi = {
  /** List events with optional filters */
  list: (params?: { page?: number; limit?: number; status?: string }) => {
    const query = buildQueryString(params);
    return get<Event[]>(`/api/v1/events${query}`);
  },

  /** Get single event by ID */
  get: (id: string) => get<Event>(`/api/v1/events/${id}`),

  /** Create new event */
  create: (data: Partial<Event>) => post<Event>('/api/v1/events', data),

  /** Update existing event */
  update: (id: string, data: Partial<Event>) => put<Event>(`/api/v1/events/${id}`, data),

  /** Delete event */
  delete: (id: string) => del<void>(`/api/v1/events/${id}`),

  // ----------------------------------------
  // WO-59/WO-60: Event Duplication
  // ----------------------------------------

  /** Duplicate single event to new date */
  duplicate: (id: string, input: DuplicateEventInput) =>
    post<Event>(`/api/v1/events/${id}/duplicate`, input),

  /** Bulk duplicate event with recurrence pattern */
  bulkDuplicate: (id: string, input: BulkDuplicateEventInput) =>
    post<BulkDuplicateResult>(`/api/v1/events/${id}/duplicate/bulk`, input),

  /** Preview bulk duplication without executing */
  previewBulkDuplicate: (id: string, params: {
    recurrencePattern: RecurrencePattern;
    startDate: string;
    endDate: string;
    skipConflicts?: boolean;
  }) => {
    const query = buildQueryString(params);
    return get<BulkDuplicatePreview>(`/api/v1/events/${id}/duplicate/preview${query}`);
  },

  // ----------------------------------------
  // WO-96: Event Budget
  // ----------------------------------------

  /** Get event budget */
  getBudget: async (eventId: string): Promise<ApiResponse<EventBudgetData | null>> => {
    const res = await get<Record<string, unknown>>(`/api/v1/events/${eventId}/budget`);
    // Handle both wrapped {data: {...}} and unwrapped {...} responses
    const rawRes = res as unknown as Record<string, unknown>;
    const budgetData = res.data ?? (rawRes.id ? rawRes : null);
    return { success: true, data: transformBudgetResponse(budgetData as Record<string, unknown> | null) };
  },

  /** Update event budget */
  updateBudget: async (eventId: string, data: Partial<EventBudgetData>): Promise<ApiResponse<EventBudgetData | null>> => {
    const res = await put<Record<string, unknown>>(`/api/v1/events/${eventId}/budget`, data);
    const rawRes = res as unknown as Record<string, unknown>;
    const budgetData = res.data ?? (rawRes.id ? rawRes : null);
    return { success: true, data: transformBudgetResponse(budgetData as Record<string, unknown> | null) };
  },
};
