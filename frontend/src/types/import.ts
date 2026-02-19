// Historical Data Import - Type Definitions

export type DataType = 'sign_ups' | 'budgets_actuals' | 'payroll';
export type ValidationMode = 'strict' | 'permissive';
export type ImportStatus = 'pending' | 'parsing' | 'validating' | 'reconciling' | 'ready' | 'importing' | 'completed' | 'failed';
export type MatchSelection = 'use_match' | 'use_candidate' | 'create_new';

// File Upload & Parsing
export interface ParseResponse {
  file_id: string;
  file_name: string;
  file_size_bytes: number;
  total_rows: number;
  preview_rows: Record<string, unknown>[];
  columns_detected: string[];
  parsing_errors?: ParsingError[];
}

export interface ParsingError {
  row_number: number;
  error: string;
}

// Validation
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
  suggestion?: string;
}

export interface ValidateResponse {
  validation_passed: boolean;
  total_records: number;
  valid_records: number;
  invalid_records: number;
  errors: ValidationError[];
}

// Reconciliation
export interface CandidateMatch {
  entity_id: string;
  entity_name: string;
  entity_type: 'ambassador' | 'event' | 'operator' | 'venue';
  similarity_score: number;
  matching_fields?: string[];
}

export interface AmbiguousMatch {
  id: string;
  import_value: string;
  import_row: number;
  field_type: 'ambassador' | 'event' | 'operator' | 'venue';
  candidate_matches: CandidateMatch[];
  user_selection?: MatchSelection;
  selected_candidate_id?: string;
  notes?: string;
}

export interface ReconcileResponse {
  file_id: string;
  new_ambassadors: number;
  new_events: number;
  new_operators: number;
  new_venues: number;
  linked_records: number;
  ambiguous_matches: AmbiguousMatch[];
}

export interface ReconciliationUpdate {
  ambiguous_match_id: string;
  user_selection: MatchSelection;
  selected_candidate_id?: string;
  notes?: string;
}

// Import Execution
export interface ImportSummary {
  sign_ups_imported: number;
  budgets_imported: number;
  payroll_imported: number;
  new_ambassadors_created: number;
  new_events_created: number;
  new_operators_created: number;
  new_venues_created: number;
}

export interface ImportResult {
  import_id: string;
  status: 'success' | 'partial' | 'failed';
  summary: ImportSummary;
  audit_trail_id: string;
  errors?: ImportError[];
}

export interface ImportError {
  row_number: number;
  record_type: DataType;
  error: string;
}

// Import History
export interface ImportHistoryItem {
  import_id: string;
  file_name: string;
  file_id: string;
  status: ImportStatus;
  data_types: DataType[];
  total_records: number;
  imported_records: number;
  failed_records: number;
  new_entities_created: number;
  created_at: string;
  completed_at?: string;
  created_by: string;
}

export interface ImportStats {
  total_imports: number;
  total_records_imported: number;
  new_ambassadors_created: number;
  new_events_created: number;
  imports_last_30_days: number;
  warnings_count: number;
}

// Wizard State
export interface ImportWizardState {
  step: ImportStep;
  file?: File;
  parseResponse?: ParseResponse;
  selectedDataTypes: DataType[];
  validationMode: ValidationMode;
  validateResponse?: ValidateResponse;
  reconcileResponse?: ReconcileResponse;
  reconciliationUpdates: Map<string, ReconciliationUpdate>;
  importResult?: ImportResult;
  error?: string;
}

export type ImportStep = 
  | 'upload'
  | 'preview'
  | 'data-type'
  | 'validation'
  | 'reconciliation'
  | 'confirmation'
  | 'importing'
  | 'complete';

// Column Detection
export interface DetectedDataType {
  dataType: DataType;
  confidence: number;
  matchingColumns: string[];
}
