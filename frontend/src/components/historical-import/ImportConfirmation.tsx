'use client';

import React, { useState } from 'react';
import type { 
  ParseResponse, 
  ValidateResponse, 
  ReconcileResponse, 
  DataType,
  ValidationMode 
} from '@/types/import';
import { DATA_TYPE_LABELS, formatFileSize, cn } from '@/lib/utils';

interface ImportConfirmationProps {
  parseResponse: ParseResponse;
  validateResponse: ValidateResponse;
  reconcileResponse: ReconcileResponse;
  selectedDataTypes: DataType[];
  validationMode: ValidationMode;
  onExecute: () => void;
  onBack: () => void;
  isExecuting?: boolean;
}

export function ImportConfirmation({
  parseResponse,
  validateResponse,
  reconcileResponse,
  selectedDataTypes,
  validationMode,
  onExecute,
  onBack,
  isExecuting = false,
}: ImportConfirmationProps) {
  const [confirmed, setConfirmed] = useState(false);

  const {
    new_ambassadors,
    new_events,
    new_operators,
    new_venues,
    linked_records,
  } = reconcileResponse;

  const totalNewEntities = new_ambassadors + new_events + new_operators + new_venues;
  const recordsToImport = validationMode === 'strict' 
    ? validateResponse.valid_records 
    : validateResponse.total_records;
  const skippedRecords = validationMode === 'permissive' 
    ? validateResponse.invalid_records 
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Confirm Import</h2>
        <p className="mt-1 text-sm text-gray-500">
          Review the summary below and confirm to execute the import
        </p>
      </div>

      {/* File Summary */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="font-semibold text-gray-900">File Details</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-sm text-gray-500">File Name</p>
            <p className="mt-1 font-medium text-gray-900">{parseResponse.file_name}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">File Size</p>
            <p className="mt-1 font-medium text-gray-900">{formatFileSize(parseResponse.file_size_bytes)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Data Types</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {selectedDataTypes.map(type => (
                <span key={type} className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                  {DATA_TYPE_LABELS[type]}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Import Summary */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-6">
        <h3 className="flex items-center gap-2 font-semibold text-blue-900">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Import Summary
        </h3>
        
        <div className="mt-4 space-y-4">
          {/* Records */}
          <div className="flex items-center justify-between">
            <span className="text-blue-800">Records to Import</span>
            <span className="text-xl font-bold text-blue-900">{recordsToImport.toLocaleString()}</span>
          </div>
          
          {skippedRecords > 0 && (
            <div className="flex items-center justify-between text-yellow-700">
              <span>Records Skipped (Invalid)</span>
              <span className="font-medium">-{skippedRecords}</span>
            </div>
          )}

          <div className="border-t border-blue-200 pt-4">
            <p className="mb-2 text-sm font-medium text-blue-900">New Entities to Create:</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <EntityBadge label="Ambassadors" count={new_ambassadors} />
              <EntityBadge label="Events" count={new_events} />
              <EntityBadge label="Operators" count={new_operators} />
              <EntityBadge label="Venues" count={new_venues} />
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-blue-200 pt-4">
            <span className="text-blue-800">Records Linked to Existing</span>
            <span className="font-bold text-blue-900">{linked_records.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Validation Mode Notice */}
      {validationMode === 'permissive' && skippedRecords > 0 && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <div className="flex items-start gap-3">
            <svg className="h-5 w-5 flex-shrink-0 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h4 className="font-medium text-yellow-900">Permissive Mode Active</h4>
              <p className="mt-1 text-sm text-yellow-700">
                {skippedRecords} invalid records will be skipped. These records will not be imported and 
                will be listed in the final report for review.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Warning */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="flex items-start gap-3">
          <svg className="h-5 w-5 flex-shrink-0 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h4 className="font-medium text-gray-900">Important Information</h4>
            <ul className="mt-2 space-y-1 text-sm text-gray-600">
              <li>• This import is atomic — all records are imported or none</li>
              <li>• A complete audit trail will be generated</li>
              <li>• You can download a reconciliation report after completion</li>
              <li>• This action cannot be automatically undone</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Confirmation Checkbox */}
      <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:bg-gray-50">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <div>
          <p className="font-medium text-gray-900">
            I have reviewed the import summary and confirm the data is correct
          </p>
          <p className="mt-1 text-sm text-gray-500">
            By checking this box, you acknowledge that {recordsToImport.toLocaleString()} records will be 
            imported and {totalNewEntities > 0 ? `${totalNewEntities} new entities will be created` : 'no new entities will be created'}.
          </p>
        </div>
      </label>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          disabled={isExecuting}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        
        <button
          onClick={onExecute}
          disabled={!confirmed || isExecuting}
          className={cn(
            'inline-flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold shadow-sm transition-colors',
            confirmed && !isExecuting
              ? 'bg-green-600 text-white hover:bg-green-700'
              : 'cursor-not-allowed bg-gray-300 text-gray-500'
          )}
        >
          {isExecuting ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Executing Import...
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              Execute Import
            </>
          )}
        </button>
      </div>
    </div>
  );
}

interface EntityBadgeProps {
  label: string;
  count: number;
}

function EntityBadge({ label, count }: EntityBadgeProps) {
  return (
    <div className="rounded-lg bg-white px-3 py-2 text-center shadow-sm">
      <p className="text-lg font-bold text-gray-900">+{count}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

export default ImportConfirmation;
