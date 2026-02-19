/**
 * Historical Data Import - Shared Types
 * API request/response models and TypeScript interfaces
 */

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

export type DataType = 'sign_ups' | 'budgets_actuals' | 'payroll';
export type ValidationMode = 'strict' | 'permissive';
export type ImportStatus = 'pending' | 'validating' | 'reconciling' | 'ready' | 'executing' | 'completed' | 'failed' | 'cancelled';
export type UserSelection = 'use_match' | 'use_candidate' | 'create_new';
export type EntityType = 'ambassador' | 'event' | 'operator' | 'venue';
export type ReportFormat = 'csv' | 'pdf' | 'json';

// ============================================================================
// FILE PARSING
// ============================================================================

export interface ParsingError {
  row_number: number;
  column?: string;
  error: string;
  suggestion?: string;
}

export interface ParseResponse {
  file_id: string;
  file_name: string;
  file_size_bytes: number;
  mime_type: string;
  total_rows: number;
  preview_rows: Array<Record<string, unknown>>;
  columns_detected: string[];
  parsing_errors: ParsingError[];
  detected_data_types: DataType[];
  created_at: string;
  expires_at: string;
}

// ============================================================================
// VALIDATION
// ============================================================================

export interface ValidateRequest {
  file_id: string;
  data_types: DataType[];
  validation_mode: ValidationMode;
}

export interface ValidationError {
  row_number: number;
  field: string;
  value: unknown;
  error: string;
  error_code: string;
  severity: 'error' | 'warning';
}

export interface ValidateResponse {
  file_id: string;
  validation_passed: boolean;
  validation_mode: ValidationMode;
  total_records: number;
  valid_records: number;
  invalid_records: number;
  warning_count: number;
  errors: ValidationError[];
  warnings: ValidationError[];
  validated_at: string;
}

// ============================================================================
// RECONCILIATION
// ============================================================================

export interface ReconcileRequest {
  file_id: string;
  data_types: DataType[];
}

export interface CandidateMatch {
  entity_id: string;
  entity_name: string;
  entity_type: EntityType;
  similarity_score: number;
  match_reason: string;
  metadata?: Record<string, unknown>;
}

export interface AmbiguousMatch {
  id: string;
  import_value: string;
  import_field: string;
  row_numbers: number[];
  candidate_matches: CandidateMatch[];
  user_selection?: UserSelection;
  selected_candidate_id?: string;
  resolved: boolean;
  resolved_at?: string;
  resolved_by?: string;
  notes?: string;
}

export interface ReconcileResponse {
  file_id: string;
  reconciliation_id: string;
  status: 'complete' | 'needs_review';
  new_ambassadors: number;
  new_events: number;
  new_operators: number;
  new_venues: number;
  linked_records: number;
  ambiguous_matches: AmbiguousMatch[];
  total_ambiguous: number;
  resolved_ambiguous: number;
  reconciled_at: string;
}

// ============================================================================
// RECONCILIATION UPDATE
// ============================================================================

export interface ReconciliationUpdateRequest {
  decisions: ReconciliationDecision[];
}

export interface ReconciliationDecision {
  ambiguous_match_id: string;
  user_selection: UserSelection;
  selected_candidate_id?: string;
  notes?: string;
}

export interface ReconciliationUpdateResponse {
  file_id: string;
  updated_count: number;
  total_ambiguous: number;
  resolved_ambiguous: number;
  all_resolved: boolean;
  updated_at: string;
}

// ============================================================================
// IMPORT EXECUTION
// ============================================================================

export interface ExecuteRequest {
  confirm: boolean;
  dry_run?: boolean;
  skip_validation?: boolean;
}

export interface ImportSummary {
  sign_ups_imported: number;
  budgets_imported: number;
  payroll_imported: number;
  new_ambassadors_created: number;
  new_events_created: number;
  new_operators_created: number;
  new_venues_created: number;
  records_skipped: number;
  records_failed: number;
}

export interface ExecuteResponse {
  import_id: string;
  file_id: string;
  status: ImportStatus;
  dry_run: boolean;
  summary: ImportSummary;
  audit_trail_id: string;
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  error?: string;
}

// ============================================================================
// IMPORT HISTORY
// ============================================================================

export interface ImportHistoryFilters {
  status?: ImportStatus[];
  data_types?: DataType[];
  from_date?: string;
  to_date?: string;
  imported_by?: string;
  search?: string;
}

export interface ImportHistoryItem {
  import_id: string;
  file_id: string;
  file_name: string;
  status: ImportStatus;
  data_types: DataType[];
  summary: ImportSummary;
  imported_by: string;
  imported_by_name: string;
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  error?: string;
}

export interface ImportHistoryResponse {
  imports: ImportHistoryItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  summary: {
    total_imports: number;
    successful_imports: number;
    failed_imports: number;
    total_records_imported: number;
  };
}

// ============================================================================
// IMPORT REPORT
// ============================================================================

export interface ImportReportRequest {
  format: ReportFormat;
  include_raw_data?: boolean;
  include_validation_details?: boolean;
  include_reconciliation_details?: boolean;
}

export interface ImportReportResponse {
  import_id: string;
  report_url?: string;
  report_data?: unknown;
  format: ReportFormat;
  generated_at: string;
  expires_at?: string;
}

// ============================================================================
// AUDIT TRAIL
// ============================================================================

export type AuditAction = 
  | 'file_uploaded'
  | 'file_parsed'
  | 'validation_started'
  | 'validation_completed'
  | 'validation_failed'
  | 'reconciliation_started'
  | 'reconciliation_completed'
  | 'reconciliation_decision_made'
  | 'import_started'
  | 'import_completed'
  | 'import_failed'
  | 'import_rolled_back'
  | 'record_created'
  | 'record_updated'
  | 'record_linked';

export interface AuditTrailEntry {
  id: string;
  import_id: string;
  action: AuditAction;
  actor_id: string;
  actor_name: string;
  timestamp: string;
  details: Record<string, unknown>;
  entity_type?: EntityType;
  entity_id?: string;
  old_value?: unknown;
  new_value?: unknown;
}

export interface AuditTrailResponse {
  import_id: string;
  entries: AuditTrailEntry[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// ============================================================================
// API ERROR RESPONSE
// ============================================================================

export interface ApiError {
  error: string;
  error_code: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

// ============================================================================
// PAGINATION
// ============================================================================

export interface PaginationParams {
  page?: number;
  page_size?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}
