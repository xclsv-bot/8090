/**
 * Historical Data Import Schema
 * 
 * This module exports all types and utilities for the historical data import feature.
 * Tables are namespaced with `hist_import_` prefix to integrate with existing XCLSV Core database.
 * 
 * @module historical-import/schema
 * @see Work Order WO-77
 */

// Export all types
export * from './types';

// Re-export commonly used types at top level for convenience
export type {
  // Core import types (namespaced)
  HistImportJob,
  HistImportParsedRecord,
  HistImportReconciliationMatch,
  HistImportResult,
  HistImportAuditTrail,
  
  // API types
  ParseRequest,
  ParseResponse,
  ValidateRequest,
  ValidateResponse,
  ReconcileRequest,
  ReconcileResponse,
  ExecuteRequest,
  ExecuteResponse,
  
  // Utility types
  ValidationError,
  ValidationWarning,
  CandidateMatch,
  AmbiguousMatch,
  HistImportJobWithRelations,
  ImportDashboardSummary,
  FieldMapping,
  DataTypeFieldMappings,
  
  // Legacy aliases (for compatibility)
  ImportJob,
  ParsedRecord,
  ReconciliationMatch,
  ImportResult,
  AuditTrailEntry,
} from './types';

// Export enums explicitly for runtime use
export {
  // Namespaced enums
  HistImportJobStatus,
  HistImportPhase,
  HistImportDataType,
  HistImportValidationMode,
  HistImportValidationStatus,
  HistImportReconciliationStatus,
  HistImportRecordStatus,
  HistImportEntityType,
  HistImportMatchType,
  HistImportReconDecision,
  HistImportOperation,
  HistImportAuditAction,
  HistImportAuditSeverity,
} from './types';

// Convenience alias exports
export {
  HistImportJobStatus as ImportJobStatus,
  HistImportPhase as ImportPhase,
  HistImportDataType as ImportDataType,
  HistImportValidationMode as ValidationMode,
  HistImportValidationStatus as ValidationStatus,
  HistImportReconciliationStatus as ReconciliationStatus,
  HistImportRecordStatus as RecordImportStatus,
  HistImportEntityType as EntityType,
  HistImportMatchType as MatchType,
  HistImportReconDecision as ReconciliationDecision,
  HistImportOperation as ImportOperation,
  HistImportAuditAction as AuditAction,
  HistImportAuditSeverity as AuditSeverity,
} from './types';
