/**
 * Historical Data Import - Audit Trail Utilities
 */

import { AuditAction, AuditTrailEntry, EntityType } from '../types.js';
import { generateUUID } from './validation.js';

// ============================================================================
// AUDIT LOGGING
// ============================================================================

/**
 * Create an audit trail entry
 * In production, this would write to a database table
 */
export async function createAuditEntry(
  importId: string,
  action: AuditAction,
  actorId: string,
  actorName: string,
  details: Record<string, unknown>,
  entityInfo?: {
    entity_type?: EntityType;
    entity_id?: string;
    old_value?: unknown;
    new_value?: unknown;
  }
): Promise<AuditTrailEntry> {
  const entry: AuditTrailEntry = {
    id: generateUUID(),
    import_id: importId,
    action,
    actor_id: actorId,
    actor_name: actorName,
    timestamp: new Date().toISOString(),
    details,
    entity_type: entityInfo?.entity_type,
    entity_id: entityInfo?.entity_id,
    old_value: entityInfo?.old_value,
    new_value: entityInfo?.new_value,
  };

  // In production: await db.insert(auditTrailTable).values(entry);
  console.log('[AUDIT]', JSON.stringify(entry));

  return entry;
}

/**
 * Log file upload event
 */
export async function logFileUpload(
  importId: string,
  actorId: string,
  actorName: string,
  fileDetails: {
    file_name: string;
    file_size_bytes: number;
    mime_type: string;
    total_rows: number;
  }
): Promise<AuditTrailEntry> {
  return createAuditEntry(
    importId,
    'file_uploaded',
    actorId,
    actorName,
    fileDetails
  );
}

/**
 * Log file parsing complete
 */
export async function logFileParsed(
  importId: string,
  actorId: string,
  actorName: string,
  parseDetails: {
    total_rows: number;
    columns_detected: string[];
    parsing_errors_count: number;
  }
): Promise<AuditTrailEntry> {
  return createAuditEntry(
    importId,
    'file_parsed',
    actorId,
    actorName,
    parseDetails
  );
}

/**
 * Log validation started
 */
export async function logValidationStarted(
  importId: string,
  actorId: string,
  actorName: string,
  validationDetails: {
    data_types: string[];
    validation_mode: string;
    total_records: number;
  }
): Promise<AuditTrailEntry> {
  return createAuditEntry(
    importId,
    'validation_started',
    actorId,
    actorName,
    validationDetails
  );
}

/**
 * Log validation completed
 */
export async function logValidationCompleted(
  importId: string,
  actorId: string,
  actorName: string,
  results: {
    validation_passed: boolean;
    valid_records: number;
    invalid_records: number;
    error_count: number;
  }
): Promise<AuditTrailEntry> {
  return createAuditEntry(
    importId,
    'validation_completed',
    actorId,
    actorName,
    results
  );
}

/**
 * Log reconciliation started
 */
export async function logReconciliationStarted(
  importId: string,
  actorId: string,
  actorName: string,
  details: {
    data_types: string[];
    total_records: number;
  }
): Promise<AuditTrailEntry> {
  return createAuditEntry(
    importId,
    'reconciliation_started',
    actorId,
    actorName,
    details
  );
}

/**
 * Log reconciliation completed
 */
export async function logReconciliationCompleted(
  importId: string,
  actorId: string,
  actorName: string,
  results: {
    new_ambassadors: number;
    new_events: number;
    new_operators: number;
    new_venues: number;
    linked_records: number;
    ambiguous_matches: number;
  }
): Promise<AuditTrailEntry> {
  return createAuditEntry(
    importId,
    'reconciliation_completed',
    actorId,
    actorName,
    results
  );
}

/**
 * Log reconciliation decision made
 */
export async function logReconciliationDecision(
  importId: string,
  actorId: string,
  actorName: string,
  decision: {
    ambiguous_match_id: string;
    import_value: string;
    user_selection: string;
    selected_candidate_id?: string;
    notes?: string;
  }
): Promise<AuditTrailEntry> {
  return createAuditEntry(
    importId,
    'reconciliation_decision_made',
    actorId,
    actorName,
    decision
  );
}

/**
 * Log import execution started
 */
export async function logImportStarted(
  importId: string,
  actorId: string,
  actorName: string,
  details: {
    dry_run: boolean;
    expected_records: number;
  }
): Promise<AuditTrailEntry> {
  return createAuditEntry(
    importId,
    'import_started',
    actorId,
    actorName,
    details
  );
}

/**
 * Log import completed successfully
 */
export async function logImportCompleted(
  importId: string,
  actorId: string,
  actorName: string,
  summary: {
    sign_ups_imported: number;
    budgets_imported: number;
    payroll_imported: number;
    new_ambassadors_created: number;
    new_events_created: number;
    duration_ms: number;
  }
): Promise<AuditTrailEntry> {
  return createAuditEntry(
    importId,
    'import_completed',
    actorId,
    actorName,
    summary
  );
}

/**
 * Log import failed
 */
export async function logImportFailed(
  importId: string,
  actorId: string,
  actorName: string,
  error: {
    error_message: string;
    error_code?: string;
    failed_at_record?: number;
  }
): Promise<AuditTrailEntry> {
  return createAuditEntry(
    importId,
    'import_failed',
    actorId,
    actorName,
    error
  );
}

/**
 * Log import rollback
 */
export async function logImportRolledBack(
  importId: string,
  actorId: string,
  actorName: string,
  details: {
    reason: string;
    records_rolled_back: number;
  }
): Promise<AuditTrailEntry> {
  return createAuditEntry(
    importId,
    'import_rolled_back',
    actorId,
    actorName,
    details
  );
}

/**
 * Log individual record creation
 */
export async function logRecordCreated(
  importId: string,
  actorId: string,
  actorName: string,
  entityType: EntityType,
  entityId: string,
  recordDetails: Record<string, unknown>
): Promise<AuditTrailEntry> {
  return createAuditEntry(
    importId,
    'record_created',
    actorId,
    actorName,
    recordDetails,
    {
      entity_type: entityType,
      entity_id: entityId,
      new_value: recordDetails,
    }
  );
}

/**
 * Log record linked to existing entity
 */
export async function logRecordLinked(
  importId: string,
  actorId: string,
  actorName: string,
  entityType: EntityType,
  entityId: string,
  linkDetails: {
    source_value: string;
    matched_to: string;
    similarity_score?: number;
  }
): Promise<AuditTrailEntry> {
  return createAuditEntry(
    importId,
    'record_linked',
    actorId,
    actorName,
    linkDetails,
    {
      entity_type: entityType,
      entity_id: entityId,
    }
  );
}
