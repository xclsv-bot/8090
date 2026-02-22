/**
 * API Module Index
 * WO-98: Re-exports all domain APIs for backward compatibility
 */

// ============================================
// Core client utilities
// ============================================
export {
  ApiError,
  setAuthToken,
  getAuthToken,
  fetchApi,
  get,
  post,
  put,
  patch,
  del,
  buildQueryString,
  transformKeysToCamel,
  transformKeysToSnake,
  snakeToCamel,
  camelToSnake,
  BASE_URL,
  type ApiResponse,
  type RequestOptions,
} from './client';

// ============================================
// Domain APIs
// ============================================

// Events
export { eventsApi } from './events';
export type {
  RecurrencePattern,
  DuplicateEventInput,
  BulkDuplicateEventInput,
  BulkDuplicateResult,
  BulkDuplicatePreview,
} from './events';

// Ambassadors
export { ambassadorsApi } from './ambassadors';

// Assignments
export { assignmentsApi } from './assignments';
export type { EventAssignment, SuggestedAmbassador } from './assignments';

// Operators
export { operatorsApi } from './operators';

// CPA Rates
export { cpaApi } from './cpas';

// Signups
export { signupsApi } from './signups';

// Payroll
export { payrollApi } from './payroll';

// Financial
export { financialApi } from './financial';

// Analytics
export { analyticsApi } from './analytics';

// Imports
export { importsApi, ImportApiError } from './imports';
// Legacy function exports for api-client.ts compatibility
export {
  parseFile,
  validateImport,
  reconcileImport,
  updateReconciliation,
  executeImport,
  getImportHistory,
  getImportStats,
  getImport,
  downloadReport,
  getAuditTrail,
  cancelImport,
} from './imports';

// Health
export { healthApi } from './health';
