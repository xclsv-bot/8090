/**
 * Historical Data Import - Error Handling Utilities
 */

// ============================================================================
// ERROR CODES
// ============================================================================

export const ErrorCodes = {
  // File errors
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  INVALID_FILE_FORMAT: 'INVALID_FILE_FORMAT',
  FILE_PARSING_FAILED: 'FILE_PARSING_FAILED',
  FILE_EXPIRED: 'FILE_EXPIRED',

  // Validation errors
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INVALID_DATA_TYPE: 'INVALID_DATA_TYPE',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  INVALID_FIELD_VALUE: 'INVALID_FIELD_VALUE',
  DUPLICATE_RECORD: 'DUPLICATE_RECORD',

  // Reconciliation errors
  RECONCILIATION_NOT_FOUND: 'RECONCILIATION_NOT_FOUND',
  RECONCILIATION_NOT_COMPLETE: 'RECONCILIATION_NOT_COMPLETE',
  INVALID_MATCH_DECISION: 'INVALID_MATCH_DECISION',
  AMBIGUOUS_MATCH_NOT_FOUND: 'AMBIGUOUS_MATCH_NOT_FOUND',

  // Import errors
  IMPORT_NOT_FOUND: 'IMPORT_NOT_FOUND',
  IMPORT_ALREADY_EXECUTED: 'IMPORT_ALREADY_EXECUTED',
  IMPORT_NOT_READY: 'IMPORT_NOT_READY',
  IMPORT_EXECUTION_FAILED: 'IMPORT_EXECUTION_FAILED',
  IMPORT_ROLLBACK_FAILED: 'IMPORT_ROLLBACK_FAILED',

  // Auth errors
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',

  // General errors
  BAD_REQUEST: 'BAD_REQUEST',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

// ============================================================================
// ERROR CLASSES
// ============================================================================

export class ImportApiError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    statusCode: number = 400,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ImportApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }

  toJSON() {
    return {
      error: this.code,
      error_code: this.code,
      message: this.message,
      details: this.details,
      timestamp: new Date().toISOString(),
    };
  }
}

// ============================================================================
// ERROR FACTORY FUNCTIONS
// ============================================================================

export function fileNotFoundError(fileId: string): ImportApiError {
  return new ImportApiError(
    ErrorCodes.FILE_NOT_FOUND,
    `File with ID '${fileId}' not found or has expired`,
    404
  );
}

export function fileTooLargeError(maxSize: number, actualSize: number): ImportApiError {
  return new ImportApiError(
    ErrorCodes.FILE_TOO_LARGE,
    `File size (${formatBytes(actualSize)}) exceeds maximum allowed size (${formatBytes(maxSize)})`,
    413,
    { max_size_bytes: maxSize, actual_size_bytes: actualSize }
  );
}

export function invalidFileFormatError(mimeType: string): ImportApiError {
  return new ImportApiError(
    ErrorCodes.INVALID_FILE_FORMAT,
    `Invalid file format: '${mimeType}'. Supported formats: CSV, XLSX, XLS`,
    400,
    { mime_type: mimeType, supported: ['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'] }
  );
}

export function fileParsingError(reason: string): ImportApiError {
  return new ImportApiError(
    ErrorCodes.FILE_PARSING_FAILED,
    `Failed to parse file: ${reason}`,
    422
  );
}

export function fileExpiredError(fileId: string): ImportApiError {
  return new ImportApiError(
    ErrorCodes.FILE_EXPIRED,
    `File with ID '${fileId}' has expired. Please upload the file again.`,
    410
  );
}

export function validationFailedError(errorCount: number): ImportApiError {
  return new ImportApiError(
    ErrorCodes.VALIDATION_FAILED,
    `Validation failed with ${errorCount} error(s). Review errors and correct the file or use permissive mode.`,
    422,
    { error_count: errorCount }
  );
}

export function invalidDataTypeError(dataType: string): ImportApiError {
  return new ImportApiError(
    ErrorCodes.INVALID_DATA_TYPE,
    `Invalid data type: '${dataType}'. Valid types: sign_ups, budgets_actuals, payroll`,
    400,
    { provided: dataType, valid: ['sign_ups', 'budgets_actuals', 'payroll'] }
  );
}

export function reconciliationNotFoundError(fileId: string): ImportApiError {
  return new ImportApiError(
    ErrorCodes.RECONCILIATION_NOT_FOUND,
    `No reconciliation found for file '${fileId}'. Run reconciliation first.`,
    404
  );
}

export function reconciliationNotCompleteError(unresolvedCount: number): ImportApiError {
  return new ImportApiError(
    ErrorCodes.RECONCILIATION_NOT_COMPLETE,
    `${unresolvedCount} ambiguous match(es) require resolution before import can proceed.`,
    422,
    { unresolved_count: unresolvedCount }
  );
}

export function importNotFoundError(importId: string): ImportApiError {
  return new ImportApiError(
    ErrorCodes.IMPORT_NOT_FOUND,
    `Import with ID '${importId}' not found`,
    404
  );
}

export function importAlreadyExecutedError(importId: string): ImportApiError {
  return new ImportApiError(
    ErrorCodes.IMPORT_ALREADY_EXECUTED,
    `Import '${importId}' has already been executed`,
    409
  );
}

export function importNotReadyError(currentStatus: string): ImportApiError {
  return new ImportApiError(
    ErrorCodes.IMPORT_NOT_READY,
    `Import is not ready for execution. Current status: '${currentStatus}'. Complete validation and reconciliation first.`,
    422,
    { current_status: currentStatus, required_status: 'ready' }
  );
}

export function unauthorizedError(): ImportApiError {
  return new ImportApiError(
    ErrorCodes.UNAUTHORIZED,
    'Authentication required',
    401
  );
}

export function forbiddenError(): ImportApiError {
  return new ImportApiError(
    ErrorCodes.FORBIDDEN,
    'You do not have permission to perform this action',
    403
  );
}

export function badRequestError(message: string, details?: Record<string, unknown>): ImportApiError {
  return new ImportApiError(
    ErrorCodes.BAD_REQUEST,
    message,
    400,
    details
  );
}

export function internalError(message: string = 'An unexpected error occurred'): ImportApiError {
  return new ImportApiError(
    ErrorCodes.INTERNAL_ERROR,
    message,
    500
  );
}

// ============================================================================
// ERROR HANDLER WRAPPER
// ============================================================================

export function handleApiError(error: unknown): { statusCode: number; body: object } {
  if (error instanceof ImportApiError) {
    return { statusCode: error.statusCode, body: error.toJSON() };
  }

  // Log unexpected errors
  console.error('Unexpected error in import API:', error);

  // Return generic error for unknown errors
  const internalErr = internalError();
  return { statusCode: internalErr.statusCode, body: internalErr.toJSON() };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
