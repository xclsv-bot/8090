// Historical Data Import - API Client

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
} from '../types/import';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'https://xclsv-core-platform.onrender.com';
const API_BASE = `${BACKEND_URL}/api/v1/admin/imports`;

class ImportApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ImportApiError';
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ImportApiError(
      errorData.error?.message || errorData.message || `HTTP ${response.status}`,
      response.status,
      errorData
    );
  }
  const json = await response.json();
  // API returns { success: true, data: {...} } - unwrap the data
  return json.data as T;
}

// File Upload & Parsing
export async function parseFile(file: File): Promise<ParseResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE}/parse`, {
    method: 'POST',
    body: formData,
  });

  return handleResponse<ParseResponse>(response);
}

// Validation
export async function validateImport(
  fileId: string,
  dataTypes: DataType[],
  validationMode: ValidationMode
): Promise<ValidateResponse> {
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
}

// Reconciliation
export async function reconcileImport(
  fileId: string,
  dataTypes: DataType[]
): Promise<ReconcileResponse> {
  const response = await fetch(`${API_BASE}/reconcile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file_id: fileId,
      data_types: dataTypes,
    }),
  });

  return handleResponse<ReconcileResponse>(response);
}

// Update Reconciliation Decision
export async function updateReconciliation(
  fileId: string,
  updates: ReconciliationUpdate[]
): Promise<void> {
  const response = await fetch(`${API_BASE}/${fileId}/reconciliation`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ updates }),
  });

  return handleResponse<void>(response);
}

// Execute Import
export async function executeImport(fileId: string): Promise<ImportResult> {
  const response = await fetch(`${API_BASE}/${fileId}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: true }),
  });

  return handleResponse<ImportResult>(response);
}

// Import History
export async function getImportHistory(params?: {
  page?: number;
  limit?: number;
  status?: string;
}): Promise<{ items: ImportHistoryItem[]; total: number }> {
  const searchParams = new URLSearchParams();
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.status) searchParams.set('status', params.status);

  const response = await fetch(`${API_BASE}?${searchParams.toString()}`);
  return handleResponse<{ items: ImportHistoryItem[]; total: number }>(response);
}

// Import Statistics
export async function getImportStats(): Promise<ImportStats> {
  const response = await fetch(`${API_BASE}/stats`);
  return handleResponse<ImportStats>(response);
}

// Get Single Import
export async function getImport(importId: string): Promise<ImportHistoryItem> {
  const response = await fetch(`${API_BASE}/${importId}`);
  return handleResponse<ImportHistoryItem>(response);
}

// Download Report
export async function downloadReport(
  importId: string,
  format: 'csv' | 'pdf'
): Promise<Blob> {
  const response = await fetch(`${API_BASE}/${importId}/report?format=${format}`);
  
  if (!response.ok) {
    throw new ImportApiError('Failed to download report', response.status);
  }
  
  return response.blob();
}

// Get Audit Trail
export async function getAuditTrail(importId: string): Promise<{
  entries: Array<{
    timestamp: string;
    action: string;
    details: string;
    user: string;
  }>;
}> {
  const response = await fetch(`${API_BASE}/${importId}/audit-trail`);
  return handleResponse(response);
}

// Cancel Import
export async function cancelImport(fileId: string): Promise<void> {
  const response = await fetch(`${API_BASE}/${fileId}`, {
    method: 'DELETE',
  });
  return handleResponse<void>(response);
}

export { ImportApiError };
