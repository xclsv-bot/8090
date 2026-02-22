/**
 * API Module (Legacy Re-export Shim)
 * WO-98: This file re-exports from ./api/index for backward compatibility
 * 
 * New code should import directly from '@/lib/api' (which resolves to ./api/index.ts)
 * This file will be removed once all imports are migrated.
 */

// Re-export everything from the new modular API
export * from './api/index';

// Re-export types that were previously in this file
export type {
  RecurrencePattern,
  DuplicateEventInput,
  BulkDuplicateEventInput,
  BulkDuplicateResult,
  BulkDuplicatePreview,
} from './api/events';

export type {
  EventAssignment,
  SuggestedAmbassador,
} from './api/assignments';
