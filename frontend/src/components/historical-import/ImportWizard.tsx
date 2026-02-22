'use client';

import React, { useState, useCallback } from 'react';
import type {
  ImportWizardState,
  ImportStep,
  DataType,
  ValidationMode,
  ReconciliationUpdate,
} from '@/types/import';
import {
  parseFile,
  validateImport,
  reconcileImport,
  updateReconciliation,
  executeImport,
} from '@/lib/api';

import { FileUpload } from './FileUpload';
import { DataPreview } from './DataPreview';
import { DataTypeSelection } from './DataTypeSelection';
import { ValidationReview } from './ValidationReview';
import { ReconciliationReview } from './ReconciliationReview';
import { ImportConfirmation } from './ImportConfirmation';
import { ImportProgress } from './ImportProgress';
import { ImportResults } from './ImportResults';

interface ImportWizardProps {
  onComplete: () => void;
  onCancel: () => void;
}

const STEP_ORDER: ImportStep[] = [
  'upload',
  'preview',
  'data-type',
  'validation',
  'reconciliation',
  'confirmation',
  'importing',
  'complete',
];

export function ImportWizard({ onComplete, onCancel }: ImportWizardProps) {
  const [state, setState] = useState<ImportWizardState>({
    step: 'upload',
    selectedDataTypes: [],
    validationMode: 'strict',
    reconciliationUpdates: new Map(),
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateState = useCallback((updates: Partial<ImportWizardState>) => {
    setState(prev => ({ ...prev, ...updates }));
  }, []);

  const goToStep = useCallback((step: ImportStep) => {
    setError(null);
    updateState({ step });
  }, [updateState]);

  const currentStepIndex = STEP_ORDER.indexOf(state.step);

  // Step Handlers
  const handleFileSelect = async (file: File) => {
    setIsLoading(true);
    setError(null);

    try {
      const parseResponse = await parseFile(file);
      updateState({
        file,
        parseResponse,
        step: 'preview',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePreviewConfirm = () => {
    goToStep('data-type');
  };

  const handleDataTypeSelect = (types: DataType[]) => {
    updateState({ selectedDataTypes: types });
  };

  const handleDataTypeContinue = async () => {
    if (!state.parseResponse) return;

    setIsLoading(true);
    setError(null);

    try {
      const validateResponse = await validateImport(
        state.parseResponse.file_id,
        state.selectedDataTypes,
        state.validationMode
      );
      updateState({
        validateResponse,
        step: 'validation',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleValidationModeChange = (mode: ValidationMode) => {
    updateState({ validationMode: mode });
  };

  const handleValidationRetry = async () => {
    if (!state.parseResponse) return;

    setIsLoading(true);
    setError(null);

    try {
      const validateResponse = await validateImport(
        state.parseResponse.file_id,
        state.selectedDataTypes,
        state.validationMode
      );
      updateState({ validateResponse });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleValidationContinue = async () => {
    if (!state.parseResponse) return;

    setIsLoading(true);
    setError(null);

    try {
      const reconcileResponse = await reconcileImport(
        state.parseResponse.file_id,
        state.selectedDataTypes
      );
      updateState({
        reconcileResponse,
        step: 'reconciliation',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reconciliation failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReconciliationUpdate = (matchId: string, update: ReconciliationUpdate) => {
    const newUpdates = new Map(state.reconciliationUpdates);
    newUpdates.set(matchId, update);
    updateState({ reconciliationUpdates: newUpdates });
  };

  const handleReconciliationContinue = async () => {
    if (!state.parseResponse || state.reconciliationUpdates.size === 0) {
      goToStep('confirmation');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await updateReconciliation(
        state.parseResponse.file_id,
        Array.from(state.reconciliationUpdates.values())
      );
      goToStep('confirmation');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save reconciliation');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecuteImport = async () => {
    if (!state.parseResponse) return;

    setIsLoading(true);
    setError(null);
    goToStep('importing');

    try {
      const importResult = await executeImport(state.parseResponse.file_id);
      updateState({
        importResult,
        step: 'complete',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      goToStep('confirmation');
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewAuditTrail = () => {
    // In real implementation, navigate to audit trail page
    console.log('View audit trail:', state.importResult?.audit_trail_id);
  };

  // Render current step
  const renderStep = () => {
    switch (state.step) {
      case 'upload':
        return (
          <FileUpload
            onFileSelect={handleFileSelect}
            isUploading={isLoading}
            error={error}
          />
        );

      case 'preview':
        if (!state.parseResponse) return null;
        return (
          <DataPreview
            parseResponse={state.parseResponse}
            onConfirm={handlePreviewConfirm}
            onBack={() => goToStep('upload')}
          />
        );

      case 'data-type':
        if (!state.parseResponse) return null;
        return (
          <DataTypeSelection
            columns={state.parseResponse.columns_detected}
            selectedTypes={state.selectedDataTypes}
            onSelect={handleDataTypeSelect}
            onBack={() => goToStep('preview')}
            onContinue={handleDataTypeContinue}
          />
        );

      case 'validation':
        if (!state.validateResponse) return null;
        return (
          <ValidationReview
            response={state.validateResponse}
            validationMode={state.validationMode}
            onModeChange={handleValidationModeChange}
            onRetry={handleValidationRetry}
            onContinue={handleValidationContinue}
            onBack={() => goToStep('data-type')}
            isValidating={isLoading}
          />
        );

      case 'reconciliation':
        if (!state.reconcileResponse) return null;
        return (
          <ReconciliationReview
            response={state.reconcileResponse}
            updates={state.reconciliationUpdates}
            onUpdate={handleReconciliationUpdate}
            onContinue={handleReconciliationContinue}
            onBack={() => goToStep('validation')}
          />
        );

      case 'confirmation':
        if (!state.parseResponse || !state.validateResponse || !state.reconcileResponse) return null;
        return (
          <ImportConfirmation
            parseResponse={state.parseResponse}
            validateResponse={state.validateResponse}
            reconcileResponse={state.reconcileResponse}
            selectedDataTypes={state.selectedDataTypes}
            validationMode={state.validationMode}
            onExecute={handleExecuteImport}
            onBack={() => goToStep('reconciliation')}
            isExecuting={isLoading}
          />
        );

      case 'importing':
        return (
          <ImportProgress
            totalRecords={state.validateResponse?.valid_records || 0}
          />
        );

      case 'complete':
        if (!state.importResult) return null;
        return (
          <ImportResults
            result={state.importResult}
            onDone={onComplete}
            onViewAuditTrail={handleViewAuditTrail}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={onCancel}
                className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                title="Cancel Import"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">Historical Data Import</h1>
                <p className="text-sm text-gray-500">
                  {state.file?.name || 'Upload a file to begin'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Progress Steps */}
      {state.step !== 'complete' && (
        <div className="border-b border-gray-200 bg-white">
          <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
            <nav className="flex items-center justify-between">
              {['Upload', 'Preview', 'Data Type', 'Validate', 'Reconcile', 'Confirm'].map((label, idx) => {
                const isActive = idx === currentStepIndex;
                const isComplete = idx < currentStepIndex;
                const isFuture = idx > currentStepIndex;

                return (
                  <React.Fragment key={label}>
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                          isComplete
                            ? 'bg-green-600 text-white'
                            : isActive
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-200 text-gray-500'
                        }`}
                      >
                        {isComplete ? (
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          idx + 1
                        )}
                      </div>
                      <span
                        className={`hidden text-sm font-medium sm:block ${
                          isActive ? 'text-blue-600' : isComplete ? 'text-gray-900' : 'text-gray-500'
                        }`}
                      >
                        {label}
                      </span>
                    </div>
                    {idx < 5 && (
                      <div
                        className={`mx-2 h-0.5 flex-1 ${
                          idx < currentStepIndex ? 'bg-green-600' : 'bg-gray-200'
                        }`}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        {error && state.step !== 'upload' && (
          <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {error}
          </div>
        )}
        {renderStep()}
      </main>
    </div>
  );
}

export default ImportWizard;
