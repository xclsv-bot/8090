/**
 * Historical Data Import - Validation Utilities
 */

import { DataType, ValidationMode, UserSelection, ReportFormat, PaginationParams } from '../types';
import { badRequestError, ImportApiError } from './errors';
import { randomUUID } from 'crypto';

// ============================================================================
// CONSTANTS
// ============================================================================

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
export const MAX_PREVIEW_ROWS = 20;
export const FILE_EXPIRY_HOURS = 24;
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export const VALID_DATA_TYPES: DataType[] = ['sign_ups', 'budgets_actuals', 'payroll'];
export const VALID_VALIDATION_MODES: ValidationMode[] = ['strict', 'permissive'];
export const VALID_USER_SELECTIONS: UserSelection[] = ['use_match', 'use_candidate', 'create_new'];
export const VALID_REPORT_FORMATS: ReportFormat[] = ['csv', 'pdf', 'json'];

export const ALLOWED_MIME_TYPES = [
  'text/csv',
  'text/plain', // Sometimes CSV files are detected as text/plain
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/vnd.ms-excel', // xls
];

// ============================================================================
// UUID GENERATION
// ============================================================================

export function generateUUID(): string {
  return randomUUID();
}

// ============================================================================
// TIME UTILITIES
// ============================================================================

export function calculateExpiryTime(hours: number = FILE_EXPIRY_HOURS): string {
  const expiry = new Date();
  expiry.setHours(expiry.getHours() + hours);
  return expiry.toISOString();
}

export function isExpired(expiryTime: Date | string): boolean {
  const expiry = typeof expiryTime === 'string' ? new Date(expiryTime) : expiryTime;
  return new Date() > expiry;
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

export function validateDataTypes(dataTypes: unknown): DataType[] {
  if (!Array.isArray(dataTypes) || dataTypes.length === 0) {
    throw badRequestError('data_types must be a non-empty array');
  }

  const invalidTypes = dataTypes.filter(t => !VALID_DATA_TYPES.includes(t as DataType));
  if (invalidTypes.length > 0) {
    throw badRequestError(
      `Invalid data type(s): ${invalidTypes.join(', ')}. Valid types: ${VALID_DATA_TYPES.join(', ')}`,
      { invalid: invalidTypes, valid: VALID_DATA_TYPES }
    );
  }

  return dataTypes as DataType[];
}

export function validateValidationMode(mode: unknown): ValidationMode {
  if (!mode) return 'strict';
  
  if (!VALID_VALIDATION_MODES.includes(mode as ValidationMode)) {
    throw badRequestError(
      `Invalid validation_mode: '${mode}'. Valid modes: ${VALID_VALIDATION_MODES.join(', ')}`,
      { provided: mode, valid: VALID_VALIDATION_MODES }
    );
  }
  
  return mode as ValidationMode;
}

export function validateUserSelection(selection: unknown): UserSelection {
  if (!VALID_USER_SELECTIONS.includes(selection as UserSelection)) {
    throw badRequestError(
      `Invalid user_selection: '${selection}'. Valid selections: ${VALID_USER_SELECTIONS.join(', ')}`,
      { provided: selection, valid: VALID_USER_SELECTIONS }
    );
  }
  
  return selection as UserSelection;
}

export function validateReportFormat(format: unknown): ReportFormat {
  if (!format) return 'json';
  
  if (!VALID_REPORT_FORMATS.includes(format as ReportFormat)) {
    throw badRequestError(
      `Invalid format: '${format}'. Valid formats: ${VALID_REPORT_FORMATS.join(', ')}`,
      { provided: format, valid: VALID_REPORT_FORMATS }
    );
  }
  
  return format as ReportFormat;
}

export function validatePagination(page?: number, pageSize?: number): PaginationParams {
  const validPage = Math.max(1, page || 1);
  const validPageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, pageSize || DEFAULT_PAGE_SIZE));
  
  return {
    page: validPage,
    page_size: validPageSize,
  };
}

// ============================================================================
// FILE VALIDATION
// ============================================================================

export function validateMimeType(mimeType: string): boolean {
  return ALLOWED_MIME_TYPES.includes(mimeType);
}

export function validateFileSize(size: number): boolean {
  return size <= MAX_FILE_SIZE;
}

export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

export function isCSV(mimeType: string, filename: string): boolean {
  return mimeType === 'text/csv' || 
         mimeType === 'text/plain' && getFileExtension(filename) === 'csv';
}

export function isExcel(mimeType: string): boolean {
  return mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
         mimeType === 'application/vnd.ms-excel';
}
