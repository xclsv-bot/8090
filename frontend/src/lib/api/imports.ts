/**
 * Imports API
 * WO-98: Domain module for data import operations
 * (Migrated from api-client.ts)
 */

import type {
  DataType,
  ValidationMode,
  ParseResponse,
  ValidateResponse,
  ReconcileResponse,
  ReconciliationUpdate,
  ImportResult,
  ImportHistoryItem,
  ImportStats,
} from '@/types/import';
import { ApiError, BASE_URL, buildQueryString } from './client';

const API_BASE = `${BASE_URL}/api/v1/admin/imports`;

// ============================================
// HELPERS
// ============================================

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw ApiError.fromResponse(response.status, errorData);
  }
  const json = await response.json();
  // API returns { success: true, data: {...} } - unwrap the data
  return json.data as T;
}

// ============================================
// IMPORTS API
// ============================================

export const importsApi = {
  /** Parse uploaded file */
  parseFile: async (file: File): Promise<ParseResponse> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/parse`, {
      method: 'POST',
      body: formData,
    });

    return handleResponse<ParseResponse>(response);
  },

  /** Validate import data */
  validateImport: async (
    fileId: string,
    dataTypes: DataType[],
    validationMode: ValidationMode
  ): Promise<ValidateResponse> => {
    const response = await fetch(`${API_BASE}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_id: fileId,
        data_types: dataTypes,
        validation_mode: validationMode,
      }),
    });

    return handleResponse<ValidateResponse>(response);
  },

  /** Reconcile import data */
  reconcileImport: async (
    fileId: string,
    dataTypes: DataType[]
  ): Promise<ReconcileResponse> => {
    const response = await fetch(`${API_BASE}/reconcile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_id: fileId,
        data_types: dataTypes,
      }),
    });

    return handleResponse<ReconcileResponse>(response);
  },

  /** Update reconciliation decisions */
  updateReconciliation: async (
    fileId: string,
    updates: ReconciliationUpdate[]
  ): Promise<void> => {
    const response = await fetch(`${API_BASE}/${fileId}/reconciliation`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates }),
    });

    return handleResponse<void>(response);
  },

  /** Execute confirmed import */
  executeImport: async (fileId: string): Promise<ImportResult> => {
    const response = await fetch(`${API_BASE}/${fileId}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true }),
    });

    return handleResponse<ImportResult>(response);
  },

  /** Get import history */
  getHistory: async (params?: {
    page?: number;
    limit?: number;
    status?: string;
  }): Promise<{ items: ImportHistoryItem[]; total: number }> => {
    const query = buildQueryString(params);
    const response = await fetch(`${API_BASE}${query}`);
    return handleResponse<{ items: ImportHistoryItem[]; total: number }>(response);
  },

  /** Get import statistics */
  getStats: async (): Promise<ImportStats> => {
    const response = await fetch(`${API_BASE}/stats`);
    return handleResponse<ImportStats>(response);
  },

  /** Get single import */
  getImport: async (importId: string): Promise<ImportHistoryItem> => {
    const response = await fetch(`${API_BASE}/${importId}`);
    return handleResponse<ImportHistoryItem>(response);
  },

  /** Download import report */
  downloadReport: async (
    importId: string,
    format: 'csv' | 'pdf'
  ): Promise<Blob> => {
    const response = await fetch(`${API_BASE}/${importId}/report?format=${format}`);

    if (!response.ok) {
      throw new ApiError('Failed to download report', response.status);
    }

    return response.blob();
  },

  /** Get audit trail for import */
  getAuditTrail: async (importId: string): Promise<{
    entries: Array<{
      timestamp: string;
      action: string;
      details: string;
      user: string;
    }>;
  }> => {
    const response = await fetch(`${API_BASE}/${importId}/audit-trail`);
    return handleResponse(response);
  },

  /** Cancel import */
  cancelImport: async (fileId: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/${fileId}`, {
      method: 'DELETE',
    });
    return handleResponse<void>(response);
  },
};

// Legacy exports for backward compatibility with api-client.ts
export const parseFile = importsApi.parseFile;
export const validateImport = importsApi.validateImport;
export const reconcileImport = importsApi.reconcileImport;
export const updateReconciliation = importsApi.updateReconciliation;
export const executeImport = importsApi.executeImport;
export const getImportHistory = importsApi.getHistory;
export const getImportStats = importsApi.getStats;
export const getImport = importsApi.getImport;
export const downloadReport = importsApi.downloadReport;
export const getAuditTrail = importsApi.getAuditTrail;
export const cancelImport = importsApi.cancelImport;

// Re-export ApiError for backward compatibility (was ImportApiError)
export { ApiError as ImportApiError };
