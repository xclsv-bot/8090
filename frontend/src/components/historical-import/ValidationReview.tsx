'use client';

import React, { useState, useMemo } from 'react';
import type { ValidateResponse, ValidationError, ValidationMode } from '@/types/import';
import { cn } from '@/lib/utils';

interface ValidationReviewProps {
  response: ValidateResponse;
  validationMode: ValidationMode;
  onModeChange: (mode: ValidationMode) => void;
  onRetry: () => void;
  onContinue: () => void;
  onBack: () => void;
  isValidating?: boolean;
}

export function ValidationReview({
  response,
  validationMode,
  onModeChange,
  onRetry,
  onContinue,
  onBack,
  isValidating = false,
}: ValidationReviewProps) {
  const [sortField, setSortField] = useState<'row_number' | 'field'>('row_number');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [filterField, setFilterField] = useState<string>('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const { validation_passed, total_records, valid_records, invalid_records, errors } = response;

  // Get unique fields for filtering
  const uniqueFields = useMemo(() => {
    return [...new Set(errors.map(e => e.field))].sort();
  }, [errors]);

  // Sort and filter errors
  const filteredErrors = useMemo(() => {
    let result = [...errors];
    
    if (filterField) {
      result = result.filter(e => e.field === filterField);
    }
    
    result.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      const compare = typeof aVal === 'string' 
        ? aVal.localeCompare(bVal as string)
        : (aVal as number) - (bVal as number);
      return sortDirection === 'asc' ? compare : -compare;
    });
    
    return result;
  }, [errors, filterField, sortField, sortDirection]);

  const paginatedErrors = filteredErrors.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.ceil(filteredErrors.length / pageSize);

  const handleSort = (field: 'row_number' | 'field') => {
    if (sortField === field) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const validPercentage = Math.round((valid_records / total_records) * 100);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Validation Results</h2>
        <p className="mt-1 text-sm text-gray-500">
          Review validation results and fix any issues before continuing
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-500">Total Records</p>
            <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <p className="mt-2 text-3xl font-bold text-gray-900">{total_records.toLocaleString()}</p>
        </div>

        <div className="rounded-xl border border-green-200 bg-green-50 p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-green-700">Valid Records</p>
            <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="mt-2 text-3xl font-bold text-green-700">{valid_records.toLocaleString()}</p>
          <p className="text-sm text-green-600">{validPercentage}% of total</p>
        </div>

        <div className={cn(
          'rounded-xl border p-5',
          invalid_records > 0
            ? 'border-red-200 bg-red-50'
            : 'border-gray-200 bg-gray-50'
        )}>
          <div className="flex items-center justify-between">
            <p className={cn(
              'text-sm font-medium',
              invalid_records > 0 ? 'text-red-700' : 'text-gray-500'
            )}>
              Invalid Records
            </p>
            <svg className={cn(
              'h-5 w-5',
              invalid_records > 0 ? 'text-red-500' : 'text-gray-400'
            )} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className={cn(
            'mt-2 text-3xl font-bold',
            invalid_records > 0 ? 'text-red-700' : 'text-gray-500'
          )}>
            {invalid_records.toLocaleString()}
          </p>
          {invalid_records > 0 && (
            <p className="text-sm text-red-600">{100 - validPercentage}% of total</p>
          )}
        </div>
      </div>

      {/* Validation Progress */}
      <div className="rounded-lg bg-gray-100 p-1">
        <div
          className={cn(
            'h-2 rounded-full transition-all',
            validation_passed ? 'bg-green-500' : 'bg-gradient-to-r from-green-500 to-red-500'
          )}
          style={{ width: `${validPercentage}%` }}
        />
      </div>

      {/* Status Banner */}
      {validation_passed ? (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="flex items-center gap-3">
            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="font-semibold text-green-900">All Records Valid</h3>
              <p className="text-sm text-green-700">
                Your data passed all validation checks. Ready to continue to reconciliation.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <div className="flex items-start gap-3">
            <svg className="h-6 w-6 flex-shrink-0 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <h3 className="font-semibold text-yellow-900">Validation Errors Found</h3>
              <p className="text-sm text-yellow-700">
                {invalid_records} records have validation errors. Review the errors below and either 
                fix your file and retry, or continue with permissive mode to skip invalid records.
              </p>
              
              {/* Mode Toggle */}
              <div className="mt-4 flex items-center gap-4">
                <span className="text-sm font-medium text-yellow-900">Validation Mode:</span>
                <div className="inline-flex rounded-lg border border-yellow-300 bg-white p-1">
                  <button
                    onClick={() => onModeChange('strict')}
                    className={cn(
                      'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
                      validationMode === 'strict'
                        ? 'bg-yellow-100 text-yellow-900'
                        : 'text-gray-600 hover:text-gray-900'
                    )}
                  >
                    Strict
                  </button>
                  <button
                    onClick={() => onModeChange('permissive')}
                    className={cn(
                      'rounded-md px-4 py-1.5 text-sm font-medium transition-colors',
                      validationMode === 'permissive'
                        ? 'bg-yellow-100 text-yellow-900'
                        : 'text-gray-600 hover:text-gray-900'
                    )}
                  >
                    Permissive (Skip Invalid)
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Table */}
      {errors.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-gray-900">
                Validation Errors ({errors.length})
              </h3>
              <div className="flex items-center gap-3">
                <select
                  value={filterField}
                  onChange={(e) => { setFilterField(e.target.value); setPage(1); }}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="">All Fields</option>
                  {uniqueFields.map(field => (
                    <option key={field} value={field}>{field}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th 
                    onClick={() => handleSort('row_number')}
                    className="cursor-pointer px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-gray-100"
                  >
                    <span className="flex items-center gap-1">
                      Row
                      {sortField === 'row_number' && (
                        <svg className={cn('h-4 w-4', sortDirection === 'desc' && 'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      )}
                    </span>
                  </th>
                  <th 
                    onClick={() => handleSort('field')}
                    className="cursor-pointer px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-gray-100"
                  >
                    <span className="flex items-center gap-1">
                      Field
                      {sortField === 'field' && (
                        <svg className={cn('h-4 w-4', sortDirection === 'desc' && 'rotate-180')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      )}
                    </span>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Value
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Error
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Suggestion
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedErrors.map((error, idx) => (
                  <tr key={`${error.row_number}-${error.field}-${idx}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-gray-600">{error.row_number}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{error.field}</td>
                    <td className="max-w-xs truncate px-4 py-3 text-gray-600" title={String(error.value)}>
                      {error.value == null ? <span className="italic text-gray-400">(empty)</span> : String(error.value)}
                    </td>
                    <td className="px-4 py-3 text-red-600">{error.error}</td>
                    <td className="px-4 py-3 text-green-600">
                      {error.suggestion || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-sm text-gray-500">
                Page {page} of {totalPages} ({filteredErrors.length} errors)
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        
        <div className="flex items-center gap-3">
          {!validation_passed && (
            <button
              onClick={onRetry}
              disabled={isValidating}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {isValidating ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-600 border-t-transparent" />
                  Validating...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Re-validate
                </>
              )}
            </button>
          )}
          
          <button
            onClick={onContinue}
            disabled={(validationMode === 'strict' && !validation_passed) || isValidating}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {validation_passed ? 'Continue to Reconciliation' : 'Continue (Skip Invalid)'}
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export default ValidationReview;
