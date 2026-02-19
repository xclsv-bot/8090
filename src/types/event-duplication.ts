/**
 * Event Duplication Types
 * WO-59: Enhanced Event Duplication API with Bulk Operations
 */

import type { EventExtended } from './event.js';

// ============================================
// RECURRENCE PATTERNS
// ============================================

export type RecurrencePattern = 'weekly' | 'bi-weekly' | 'monthly';

// ============================================
// SINGLE DUPLICATION
// ============================================

export interface DuplicateEventInput {
  /** New date for the duplicated event (YYYY-MM-DD format) */
  eventDate: string;
  /** New start time (HH:MM format, optional) */
  startTime?: string;
  /** New end time (HH:MM format, optional) */
  endTime?: string;
  /** Optional title override (defaults to original title) */
  title?: string;
}

export interface DuplicateEventResult {
  success: boolean;
  event?: EventExtended;
  error?: string;
}

// ============================================
// BULK DUPLICATION
// ============================================

export interface BulkDuplicateEventInput {
  /** Recurrence pattern for generating dates */
  recurrencePattern: RecurrencePattern;
  /** Start date of the recurrence range (YYYY-MM-DD) */
  startDate: string;
  /** End date of the recurrence range (YYYY-MM-DD) */
  endDate: string;
  /** Optional start time override (applies to all duplicates) */
  startTime?: string;
  /** Optional end time override (applies to all duplicates) */
  endTime?: string;
  /** Whether to skip dates that fall on existing events at the same venue */
  skipConflicts?: boolean;
}

export interface BulkDuplicateResult {
  /** Total events requested */
  totalRequested: number;
  /** Successfully created events */
  successCount: number;
  /** Failed event creations */
  failureCount: number;
  /** Skipped dates (conflicts, past dates) */
  skippedCount: number;
  /** Successfully created events */
  createdEvents: EventExtended[];
  /** Details of any failures or skips */
  failures: BulkDuplicateFailure[];
}

export interface BulkDuplicateFailure {
  /** Date that failed */
  date: string;
  /** Reason for failure */
  reason: string;
  /** Error code for programmatic handling */
  code: 'PAST_DATE' | 'CONFLICT' | 'VALIDATION_ERROR' | 'DATABASE_ERROR';
}

// ============================================
// DATE GENERATION
// ============================================

export interface GeneratedDate {
  date: string;
  dayOfWeek: number;
}

// ============================================
// API RESPONSES
// ============================================

export interface DuplicateEventResponse {
  success: boolean;
  data: EventExtended;
}

export interface BulkDuplicateEventResponse {
  success: boolean;
  data: BulkDuplicateResult;
}
