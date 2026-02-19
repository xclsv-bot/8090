/**
 * Historical Data Import - TypeScript Interfaces
 * Work Order WO-77
 * 
 * These types match the deployed Prisma schema with hist_import_* namespacing.
 * Integrates with existing XCLSV Core database.
 */

// =============================================================================
// ENUMS (matching database hist_import_* types)
// =============================================================================

export enum HistImportJobStatus {
  PENDING = 'PENDING',
  PARSING = 'PARSING',
  PARSED = 'PARSED',
  VALIDATING = 'VALIDATING',
  VALIDATED = 'VALIDATED',
  RECONCILING = 'RECONCILING',
  RECONCILED = 'RECONCILED',
  AWAITING_CONFIRMATION = 'AWAITING_CONFIRMATION',
  EXECUTING = 'EXECUTING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum HistImportPhase {
  UPLOAD = 'UPLOAD',
  PARSE = 'PARSE',
  VALIDATE = 'VALIDATE',
  RECONCILE = 'RECONCILE',
  CONFIRM = 'CONFIRM',
  EXECUTE = 'EXECUTE',
  COMPLETE = 'COMPLETE',
}

export enum HistImportDataType {
  SIGN_UPS = 'SIGN_UPS',
  BUDGETS_ACTUALS = 'BUDGETS_ACTUALS',
  PAYROLL = 'PAYROLL',
  AMBASSADORS = 'AMBASSADORS',
  EVENTS = 'EVENTS',
  EVENT_ASSIGNMENTS = 'EVENT_ASSIGNMENTS',
}

export enum HistImportValidationMode {
  STRICT = 'STRICT',
  PERMISSIVE = 'PERMISSIVE',
}

export enum HistImportValidationStatus {
  PENDING = 'PENDING',
  VALID = 'VALID',
  INVALID = 'INVALID',
  WARNING = 'WARNING',
}

export enum HistImportReconciliationStatus {
  PENDING = 'PENDING',
  MATCHED = 'MATCHED',
  AMBIGUOUS = 'AMBIGUOUS',
  NEW_RECORD = 'NEW_RECORD',
  RESOLVED = 'RESOLVED',
}

export enum HistImportRecordStatus {
  PENDING = 'PENDING',
  IMPORTED = 'IMPORTED',
  SKIPPED = 'SKIPPED',
  FAILED = 'FAILED',
}

export enum HistImportEntityType {
  AMBASSADOR = 'AMBASSADOR',
  EVENT = 'EVENT',
  OPERATOR = 'OPERATOR',
  VENUE = 'VENUE',
  SIGN_UP = 'SIGN_UP',
  BUDGET = 'BUDGET',
  PAYROLL = 'PAYROLL',
  EVENT_ASSIGNMENT = 'EVENT_ASSIGNMENT',
}

export enum HistImportMatchType {
  EXACT = 'EXACT',
  FUZZY = 'FUZZY',
  NEW_RECORD = 'NEW_RECORD',
  AMBIGUOUS = 'AMBIGUOUS',
  MANUAL = 'MANUAL',
}

export enum HistImportReconDecision {
  USE_EXISTING = 'USE_EXISTING',
  CREATE_NEW = 'CREATE_NEW',
  MERGE = 'MERGE',
  SKIP = 'SKIP',
}

export enum HistImportOperation {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  LINK = 'LINK',
  SKIP = 'SKIP',
}

export enum HistImportAuditAction {
  IMPORT_STARTED = 'IMPORT_STARTED',
  FILE_UPLOADED = 'FILE_UPLOADED',
  FILE_PARSED = 'FILE_PARSED',
  VALIDATION_STARTED = 'VALIDATION_STARTED',
  VALIDATION_COMPLETED = 'VALIDATION_COMPLETED',
  RECONCILIATION_STARTED = 'RECONCILIATION_STARTED',
  RECONCILIATION_DECISION = 'RECONCILIATION_DECISION',
  RECONCILIATION_COMPLETED = 'RECONCILIATION_COMPLETED',
  IMPORT_CONFIRMED = 'IMPORT_CONFIRMED',
  IMPORT_EXECUTED = 'IMPORT_EXECUTED',
  IMPORT_COMPLETED = 'IMPORT_COMPLETED',
  IMPORT_FAILED = 'IMPORT_FAILED',
  IMPORT_CANCELLED = 'IMPORT_CANCELLED',
  RECORD_CREATED = 'RECORD_CREATED',
  RECORD_UPDATED = 'RECORD_UPDATED',
  RECORD_LINKED = 'RECORD_LINKED',
  RECORD_SKIPPED = 'RECORD_SKIPPED',
  USER_OVERRIDE = 'USER_OVERRIDE',
  ROLLBACK_INITIATED = 'ROLLBACK_INITIATED',
  ROLLBACK_COMPLETED = 'ROLLBACK_COMPLETED',
}

export enum HistImportAuditSeverity {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL',
}

// =============================================================================
// CORE INTERFACES
// =============================================================================

export interface HistImportJob {
  id: string;
  jobNumber: number;
  fileName: string;
  originalFileName: string;
  fileSize: bigint;
  mimeType: string;
  fileHash: string;
  storagePath: string | null;
  
  status: HistImportJobStatus;
  phase: HistImportPhase;
  
  dataTypes: HistImportDataType[];
  validationMode: HistImportValidationMode;
  
  // Statistics
  totalRows: number | null;
  parsedRows: number | null;
  validRows: number | null;
  invalidRows: number | null;
  importedRows: number | null;
  skippedRows: number | null;
  
  // Timestamps
  uploadedAt: Date;
  parsedAt: Date | null;
  validatedAt: Date | null;
  reconciledAt: Date | null;
  confirmedAt: Date | null;
  executedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  
  // Error handling
  errorMessage: string | null;
  errorDetails: Record<string, unknown> | null;
  
  // User tracking
  createdBy: string;
  confirmedBy: string | null;
  
  notes: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface HistImportParsedRecord {
  id: string;
  importJobId: string;
  rowNumber: number;
  recordType: HistImportDataType;
  
  rawData: Record<string, unknown>;
  normalizedData: Record<string, unknown> | null;
  
  validationStatus: HistImportValidationStatus;
  validationErrors: ValidationError[] | null;
  validationWarnings: ValidationWarning[] | null;
  
  reconciliationStatus: HistImportReconciliationStatus;
  
  importStatus: HistImportRecordStatus;
  importedEntityId: string | null;
  importedEntityType: string | null;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface ValidationError {
  field: string;
  value: unknown;
  message: string;
  code: string;
}

export interface ValidationWarning {
  field: string;
  value: unknown;
  message: string;
  code: string;
}

export interface HistImportReconciliationMatch {
  id: string;
  importJobId: string;
  parsedRecordId: string | null;
  
  entityType: HistImportEntityType;
  importedValue: string;
  importedFields: Record<string, unknown> | null;
  
  matchType: HistImportMatchType;
  matchConfidence: number | null;
  matchMethod: string | null;
  
  // References to existing master tables (UUID as string)
  matchedAmbassadorId: string | null;
  matchedEventId: string | null;
  matchedOperatorId: string | null;
  matchedVenueId: string | null;
  
  candidateMatches: CandidateMatch[] | null;
  
  userDecision: HistImportReconDecision | null;
  decisionNotes: string | null;
  decidedBy: string | null;
  decidedAt: Date | null;
  
  finalEntityId: string | null;
  wasCreated: boolean;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface CandidateMatch {
  entityId: string;
  entityName: string;
  entityType: HistImportEntityType;
  similarityScore: number;
  matchedFields: string[];
}

export interface HistImportResult {
  id: string;
  importJobId: string;
  entityType: HistImportEntityType;
  entityId: string;
  operation: HistImportOperation;
  
  parsedRecordIds: string[];
  rowNumbers: number[];
  
  importedData: Record<string, unknown>;
  
  createdAt: Date;
}

export interface HistImportAuditTrail {
  id: string;
  importJobId: string | null;
  
  action: HistImportAuditAction;
  entityType: string | null;
  entityId: string | null;
  
  summary: string;
  details: Record<string, unknown> | null;
  previousState: Record<string, unknown> | null;
  newState: Record<string, unknown> | null;
  
  userId: string;
  userEmail: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  
  severity: HistImportAuditSeverity;
  
  createdAt: Date;
}

// =============================================================================
// API REQUEST/RESPONSE TYPES
// =============================================================================

export interface ParseRequest {
  file: File;
}

export interface ParseResponse {
  fileId: string;
  fileName: string;
  fileSizeBytes: number;
  totalRows: number;
  previewRows: Record<string, unknown>[];
  columnsDetected: string[];
  parsingErrors?: Array<{
    rowNumber: number;
    error: string;
  }>;
}

export interface ValidateRequest {
  fileId: string;
  dataTypes: HistImportDataType[];
  validationMode: HistImportValidationMode;
}

export interface ValidateResponse {
  validationPassed: boolean;
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  errors: Array<{
    rowNumber: number;
    field: string;
    value: unknown;
    error: string;
  }>;
}

export interface ReconcileRequest {
  fileId: string;
  dataTypes: HistImportDataType[];
}

export interface ReconcileResponse {
  fileId: string;
  newAmbassadors: number;
  newEvents: number;
  newOperators: number;
  newVenues: number;
  linkedRecords: number;
  ambiguousMatches: AmbiguousMatch[];
}

export interface AmbiguousMatch {
  importValue: string;
  candidateMatches: Array<{
    entityId: string;
    entityName: string;
    entityType: string;
    similarityScore: number;
  }>;
  userSelection?: string;
}

export interface ReconciliationUpdateRequest {
  ambiguousMatchId: string;
  userSelection: 'use_match' | 'use_candidate' | 'create_new';
  selectedCandidateId?: string;
  notes?: string;
}

export interface ExecuteRequest {
  confirm: true;
}

export interface ExecuteResponse {
  importId: string;
  status: string;
  summary: {
    signUpsImported: number;
    budgetsImported: number;
    payrollImported: number;
    newAmbassadorsCreated: number;
    newEventsCreated: number;
  };
  auditTrailId: string;
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/** Create type - omit auto-generated fields */
export type CreateHistImportJob = Omit<HistImportJob, 'id' | 'jobNumber' | 'createdAt' | 'updatedAt' | 'uploadedAt'>;
export type CreateHistImportParsedRecord = Omit<HistImportParsedRecord, 'id' | 'createdAt' | 'updatedAt'>;
export type CreateHistImportReconciliationMatch = Omit<HistImportReconciliationMatch, 'id' | 'createdAt' | 'updatedAt'>;
export type CreateHistImportResult = Omit<HistImportResult, 'id' | 'createdAt'>;
export type CreateHistImportAuditTrail = Omit<HistImportAuditTrail, 'id' | 'createdAt'>;

/** Update type - partial except id */
export type UpdateHistImportJob = Partial<Omit<HistImportJob, 'id' | 'jobNumber' | 'createdAt' | 'updatedAt'>> & { id: string };
export type UpdateHistImportParsedRecord = Partial<Omit<HistImportParsedRecord, 'id' | 'createdAt' | 'updatedAt'>> & { id: string };
export type UpdateHistImportReconciliationMatch = Partial<Omit<HistImportReconciliationMatch, 'id' | 'createdAt' | 'updatedAt'>> & { id: string };

/** Import job with relations */
export interface HistImportJobWithRelations extends HistImportJob {
  parsedRecords?: HistImportParsedRecord[];
  reconciliationMatches?: HistImportReconciliationMatch[];
  auditTrailEntries?: HistImportAuditTrail[];
  importResults?: HistImportResult[];
}

/** Dashboard summary */
export interface ImportDashboardSummary {
  recentImports: HistImportJob[];
  totalImportsLast30Days: number;
  totalRecordsImported: number;
  newMasterRecordsCreated: number;
  failedImports: number;
  pendingImports: number;
}

/** Field mapping for different data types */
export interface FieldMapping {
  sourceField: string;
  targetField: string;
  transform?: 'date' | 'number' | 'boolean' | 'lowercase' | 'uppercase' | 'trim';
  required: boolean;
  defaultValue?: unknown;
}

export interface DataTypeFieldMappings {
  [HistImportDataType.SIGN_UPS]: FieldMapping[];
  [HistImportDataType.BUDGETS_ACTUALS]: FieldMapping[];
  [HistImportDataType.PAYROLL]: FieldMapping[];
  [HistImportDataType.AMBASSADORS]: FieldMapping[];
  [HistImportDataType.EVENTS]: FieldMapping[];
  [HistImportDataType.EVENT_ASSIGNMENTS]: FieldMapping[];
}

// =============================================================================
// LEGACY ALIASES (for compatibility with original schema design)
// =============================================================================

// Aliases that map to the new namespaced types
export type ImportJob = HistImportJob;
export type ImportJobStatus = HistImportJobStatus;
export type ImportPhase = HistImportPhase;
export type ImportDataType = HistImportDataType;
export type ValidationMode = HistImportValidationMode;
export type ValidationStatus = HistImportValidationStatus;
export type ReconciliationStatus = HistImportReconciliationStatus;
export type RecordImportStatus = HistImportRecordStatus;
export type EntityType = HistImportEntityType;
export type MatchType = HistImportMatchType;
export type ReconciliationDecision = HistImportReconDecision;
export type ImportOperation = HistImportOperation;
export type AuditAction = HistImportAuditAction;
export type AuditSeverity = HistImportAuditSeverity;
export type ParsedRecord = HistImportParsedRecord;
export type ReconciliationMatch = HistImportReconciliationMatch;
export type ImportResult = HistImportResult;
export type AuditTrailEntry = HistImportAuditTrail;
