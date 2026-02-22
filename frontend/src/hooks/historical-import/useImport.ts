// Historical Data Import - Custom Hooks

import { useState, useCallback } from 'react';
import type {
  ParseResponse,
  ValidateResponse,
  ReconcileResponse,
  ImportResult,
  ImportHistoryItem,
  DataType,
  ValidationMode,
} from '@/types/import';
import * as api from '@/lib/api';

interface UseImportState {
  isLoading: boolean;
  error: string | null;
  parseResponse: ParseResponse | null;
  validateResponse: ValidateResponse | null;
  reconcileResponse: ReconcileResponse | null;
  importResult: ImportResult | null;
}

export function useImport() {
  const [state, setState] = useState<UseImportState>({
    isLoading: false,
    error: null,
    parseResponse: null,
    validateResponse: null,
    reconcileResponse: null,
    importResult: null,
  });

  const setLoading = useCallback((isLoading: boolean) => {
    setState(prev => ({ ...prev, isLoading, error: isLoading ? null : prev.error }));
  }, []);

  const setError = useCallback((error: string | null) => {
    setState(prev => ({ ...prev, error, isLoading: false }));
  }, []);

  const parseFile = useCallback(async (file: File) => {
    setLoading(true);
    try {
      const parseResponse = await api.parseFile(file);
      setState(prev => ({
        ...prev,
        isLoading: false,
        parseResponse,
        error: null,
      }));
      return parseResponse;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to parse file';
      setError(message);
      throw err;
    }
  }, [setLoading, setError]);

  const validate = useCallback(async (
    fileId: string,
    dataTypes: DataType[],
    mode: ValidationMode
  ) => {
    setLoading(true);
    try {
      const validateResponse = await api.validateImport(fileId, dataTypes, mode);
      setState(prev => ({
        ...prev,
        isLoading: false,
        validateResponse,
        error: null,
      }));
      return validateResponse;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Validation failed';
      setError(message);
      throw err;
    }
  }, [setLoading, setError]);

  const reconcile = useCallback(async (fileId: string, dataTypes: DataType[]) => {
    setLoading(true);
    try {
      const reconcileResponse = await api.reconcileImport(fileId, dataTypes);
      setState(prev => ({
        ...prev,
        isLoading: false,
        reconcileResponse,
        error: null,
      }));
      return reconcileResponse;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Reconciliation failed';
      setError(message);
      throw err;
    }
  }, [setLoading, setError]);

  const execute = useCallback(async (fileId: string) => {
    setLoading(true);
    try {
      const importResult = await api.executeImport(fileId);
      setState(prev => ({
        ...prev,
        isLoading: false,
        importResult,
        error: null,
      }));
      return importResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      setError(message);
      throw err;
    }
  }, [setLoading, setError]);

  const reset = useCallback(() => {
    setState({
      isLoading: false,
      error: null,
      parseResponse: null,
      validateResponse: null,
      reconcileResponse: null,
      importResult: null,
    });
  }, []);

  return {
    ...state,
    parseFile,
    validate,
    reconcile,
    execute,
    reset,
    setError,
  };
}

// Hook for import history
export function useImportHistory() {
  const [items, setItems] = useState<ImportHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (params?: {
    page?: number;
    limit?: number;
    status?: string;
  }) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.getImportHistory(params);
      setItems(result.items);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refresh = useCallback(() => load(), [load]);

  return {
    items,
    total,
    isLoading,
    error,
    load,
    refresh,
  };
}

// Hook for single import details
export function useImportDetails(importId: string | null) {
  const [item, setItem] = useState<ImportHistoryItem | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!importId) return;
    
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.getImport(importId);
      setItem(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load import details');
    } finally {
      setIsLoading(false);
    }
  }, [importId]);

  return {
    item,
    isLoading,
    error,
    load,
  };
}
