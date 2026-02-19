/**
 * Sign-Up Management Types
 * WO-52: Core sign-up types
 * WO-66: Sign-up management data models and database extensions
 */

import type { ValidationStatus } from './models.js';

// ============================================
// ENUMS (WO-66)
// ============================================

/**
 * Source type for sign-up submission
 * - event: Submitted through event chat during an event
 * - solo: Submitted through regional solo chat outside of events
 */
export type SignUpSourceType = 'event' | 'solo';

/**
 * Status of AI extraction for bet slip images
 * - pending: Extraction completed, awaiting admin review
 * - reviewed: Admin has reviewed but not confirmed
 * - confirmed: Admin confirmed extraction accuracy
 * - skipped: Extraction failed or bypassed
 */
export type ExtractionStatus = 'pending' | 'reviewed' | 'confirmed' | 'skipped';

/**
 * Status of background jobs (extraction, sync)
 */
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Phase of Customer.io sync
 * - initial: Immediate sync after sign-up submission
 * - enriched: Sync after extraction confirmation with bet data
 */
export type SyncPhase = 'initial' | 'enriched';

/**
 * Actions tracked in the sign-up audit log
 */
export type SignUpAuditAction =
  | 'submitted'
  | 'duplicate_detected'
  | 'extraction_started'
  | 'extraction_completed'
  | 'extraction_failed'
  | 'extraction_reviewed'
  | 'customerio_synced'
  | 'customerio_sync_failed';

// ============================================
// EXISTING TYPES (WO-52)
// ============================================

export interface SignUpExtended {
  id: string;
  eventId?: string;
  ambassadorId: string;
  payPeriodId?: string;
  customerFirstName: string;
  customerLastName: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;
  customerCity?: string;
  customerState?: string;
  customerZip?: string;
  customerDob?: Date;
  operatorId: number;
  operatorName?: string;
  validationStatus: ValidationStatus;
  submittedAt: Date;
  validatedAt?: Date;
  rejectionReason?: string;
  betSlipImageKey?: string;
  promoCodeUsed?: string;
  deviceType?: string;
  ipAddress?: string;
  latitude?: number;
  longitude?: number;
  source: string;
  externalId?: string;
  isDuplicate: boolean;
  duplicateOfId?: string;
  notes?: string;
  createdAt: Date;
}

export interface SignupValidationQueue {
  id: string;
  signupId: string;
  queueReason: string;
  priority: number;
  assignedTo?: string;
  assignedAt?: Date;
  notes?: string;
  createdAt: Date;
}

export interface SignupImportBatch {
  id: string;
  source: string;
  fileName?: string;
  totalRecords: number;
  processedRecords: number;
  successfulRecords: number;
  failedRecords: number;
  duplicateRecords: number;
  status: string;
  errorLog?: Record<string, unknown>;
  startedAt?: Date;
  completedAt?: Date;
  createdBy?: string;
  createdAt: Date;
}

export interface CreateSignUpInput {
  eventId?: string;
  ambassadorId: string;
  customerFirstName: string;
  customerLastName: string;
  customerEmail?: string;
  customerPhone?: string;
  customerState?: string;
  operatorId: number;
  betSlipImageKey?: string;
  promoCodeUsed?: string;
  source?: string;
}

export interface SignUpSearchFilters {
  eventId?: string;
  ambassadorId?: string;
  operatorId?: number;
  validationStatus?: ValidationStatus;
  fromDate?: string;
  toDate?: string;
  state?: string;
  source?: string;
  search?: string;
}

// ============================================
// WO-66: SIGN-UP MANAGEMENT DATA MODELS
// ============================================

/**
 * Sign-Up with all management fields (WO-66 extensions)
 * Extends the base SignUp model with extraction, sync, and audit fields
 */
export interface SignUpManaged extends SignUpExtended {
  // Source tracking
  sourceType: SignUpSourceType;
  soloChatId?: string;
  idempotencyKey?: string;

  // AI extraction fields
  extractionStatus: ExtractionStatus;
  extractionConfidence?: number; // 0-100
  betAmount?: number;
  teamBetOn?: string;
  odds?: string;
  extractionReviewedBy?: string;
  extractionReviewedAt?: Date;

  // Customer.io sync fields
  customerioSynced: boolean;
  customerioSyncedAt?: Date;
  customerioContactId?: string;
  customerioSyncFailed: boolean;
  customerioSyncError?: string;

  // Image reference (S3 URL)
  imageUrl?: string;

  // CPA locked at submission time
  cpaApplied?: number;

  // Timestamps
  updatedAt: Date;
}

/**
 * SignUpExtractionJob - Tracks AI extraction jobs for bet slip images
 */
export interface SignUpExtractionJob {
  id: string;
  signupId: string;
  status: JobStatus;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt?: Date;
  errorMessage?: string;
  aiResponse?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * SignUpCustomerioSyncJob - Tracks Customer.io sync jobs
 */
export interface SignUpCustomerioSyncJob {
  id: string;
  signupId: string;
  status: JobStatus;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt?: Date;
  errorMessage?: string;
  syncPhase: SyncPhase;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * SignUpAuditLog - Records all significant sign-up actions
 */
export interface SignUpAuditLog {
  id: string;
  signupId: string;
  action: SignUpAuditAction;
  userId?: string;
  details?: Record<string, unknown>;
  createdAt: Date;
}

/**
 * IdempotencyKey - Maps idempotency keys to sign-up records
 */
export interface SignUpIdempotencyKey {
  id: string;
  idempotencyKey: string;
  signupId: string;
  createdAt: Date;
  expiresAt: Date;
}

// ============================================
// WO-66: API REQUEST/RESPONSE TYPES
// ============================================

/**
 * Request to submit a sign-up through event chat
 */
export interface SubmitEventSignUpRequest {
  betSlipPhoto: File | string; // File or base64
  customerName: string;
  customerEmail: string;
  operatorId: string;
  idempotencyKey: string; // UUID v4
}

/**
 * Request to submit a sign-up through solo chat
 */
export interface SubmitSoloSignUpRequest extends SubmitEventSignUpRequest {
  soloChatId: string;
}

/**
 * Response for sign-up operations
 */
export interface SignUpResponse {
  id: string;
  eventId?: string;
  ambassadorId: string;
  operatorId: string;
  customerName: string;
  customerEmail: string;
  sourceType: SignUpSourceType;
  status: ValidationStatus;
  cpaApplied: number;
  extractionStatus: ExtractionStatus;
  extractionConfidence?: number;
  betAmount?: number;
  teamBetOn?: string;
  odds?: string;
  imageUrl: string;
  customerioSynced: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Error response for sign-up submission
 */
export interface SubmitSignUpErrorResponse {
  error: string;
  errorCode:
    | 'duplicate_detected'
    | 'invalid_operator'
    | 'image_upload_failed'
    | 'cpa_lookup_failed'
    | 'validation_error';
  details?: Record<string, string>;
}

/**
 * Query parameters for sign-up list
 */
export interface SignUpListQuery {
  dateFrom?: string; // ISO 8601 date
  dateTo?: string; // ISO 8601 date
  ambassadorId?: string;
  eventId?: string;
  operatorId?: string;
  location?: string;
  extractionStatus?: ExtractionStatus;
  search?: string; // Search customer_name, customer_email
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

/**
 * Response for extraction review queue
 */
export interface ExtractionReviewQueueResponse {
  signups: ExtractionReviewItem[];
  totalPending: number;
}

/**
 * Item in the extraction review queue
 */
export interface ExtractionReviewItem {
  id: string;
  customerName: string;
  customerEmail: string;
  operator: string;
  ambassador: string;
  imageUrl: string;
  extractionConfidence: number;
  betAmount?: number;
  teamBetOn?: string;
  odds?: string;
  missingFields: string[];
}

/**
 * Request to confirm extraction
 */
export interface ConfirmExtractionRequest {
  betAmount?: number;
  teamBetOn?: string;
  odds?: string;
}

/**
 * Response for Customer.io sync failures
 */
export interface CustomerioSyncFailureResponse {
  signups: SyncFailureItem[];
  totalFailed: number;
}

/**
 * Item in the sync failure queue
 */
export interface SyncFailureItem {
  id: string;
  customerName: string;
  customerEmail: string;
  syncPhase: SyncPhase;
  errorMessage: string;
  attemptCount: number;
  lastAttemptAt: string;
}

/**
 * Audit log entry with formatted output
 */
export interface SignUpAuditLogEntry {
  action: SignUpAuditAction;
  user?: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

// ============================================
// WO-66: WEBSOCKET EVENT TYPES
// ============================================

/**
 * WebSocket event for new sign-up submission
 */
export interface SignUpSubmittedEvent {
  type: 'signup.submitted';
  signup: SignUpResponse;
  eventId?: string;
  soloChatId?: string;
}

/**
 * WebSocket event for extraction completion
 */
export interface SignUpExtractionCompletedEvent {
  type: 'signup.extraction_completed';
  signupId: string;
  extractionStatus: ExtractionStatus;
  extractionConfidence?: number;
  betAmount?: number;
  teamBetOn?: string;
  odds?: string;
}

/**
 * WebSocket event for Customer.io sync status change
 */
export interface SignUpCustomerioSyncEvent {
  type: 'signup.customerio_synced' | 'signup.customerio_sync_failed';
  signupId: string;
  syncPhase: SyncPhase;
  success: boolean;
  error?: string;
}

/**
 * Union type for all sign-up related WebSocket events
 */
export type SignUpWebSocketEvent =
  | SignUpSubmittedEvent
  | SignUpExtractionCompletedEvent
  | SignUpCustomerioSyncEvent;

// ============================================
// WO-66: CREATE/UPDATE INPUT TYPES
// ============================================

/**
 * Input for creating a managed sign-up (internal use)
 */
export interface CreateManagedSignUpInput {
  eventId?: string;
  soloChatId?: string;
  ambassadorId: string;
  customerFirstName: string;
  customerLastName: string;
  customerEmail: string;
  customerPhone?: string;
  customerState?: string;
  operatorId: number;
  imageUrl: string;
  idempotencyKey: string;
  sourceType: SignUpSourceType;
  cpaApplied: number;
}

/**
 * Input for creating an extraction job
 */
export interface CreateExtractionJobInput {
  signupId: string;
}

/**
 * Input for creating a Customer.io sync job
 */
export interface CreateCustomerioSyncJobInput {
  signupId: string;
  syncPhase: SyncPhase;
}

/**
 * Input for creating an audit log entry
 */
export interface CreateAuditLogInput {
  signupId: string;
  action: SignUpAuditAction;
  userId?: string;
  details?: Record<string, unknown>;
}

/**
 * Input for creating an idempotency key record
 */
export interface CreateIdempotencyKeyInput {
  idempotencyKey: string;
  signupId: string;
}
