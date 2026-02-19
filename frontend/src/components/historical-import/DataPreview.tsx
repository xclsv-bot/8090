'use client';

import React, { useState } from 'react';
import type { ParseResponse } from '@/types/import';
import { formatFileSize, truncate, cn } from '@/lib/utils';

interface DataPreviewProps {
  parseResponse: ParseResponse;
  onConfirm: () => void;
  onBack: () => void;
}

export function DataPreview({ parseResponse, onConfirm, onBack }: DataPreviewProps) {
  const [showAllColumns, setShowAllColumns] = useState(false);
  
  // Handle case where parseResponse might be malformed
  if (!parseResponse || !parseResponse.columns_detected) {
    return (
      <div className="p-6 text-center text-red-600">
        <p>Error: Invalid parse response. Please try uploading the file again.</p>
        <button 
          onClick={onBack}
          className="mt-4 px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
        >
          Go Back
        </button>
      </div>
    );
  }
  
  const {
    file_name = 'Unknown',
    file_size_bytes = 0,
    total_rows = 0,
    preview_rows = [],
    columns_detected = [],
    parsing_errors = [],
  } = parseResponse;

  const displayColumns = showAllColumns 
    ? columns_detected 
    : (columns_detected || []).slice(0, 8);
  const hasMoreColumns = (columns_detected || []).length > 8;
  const hasErrors = parsing_errors && parsing_errors.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Preview Data</h2>
        <p className="mt-1 text-sm text-gray-500">
          Review the parsed data before continuing
        </p>
      </div>

      {/* File Info */}
      <div className="flex items-center gap-6 rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
          <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="font-medium text-gray-900">{file_name}</p>
          <p className="text-sm text-gray-500">
            {formatFileSize(file_size_bytes)} • {columns_detected.length} columns
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-gray-900">{total_rows.toLocaleString()}</p>
          <p className="text-sm text-gray-500">Total Rows</p>
        </div>
      </div>

      {/* Parsing Errors */}
      {hasErrors && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <svg className="h-5 w-5 flex-shrink-0 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <h3 className="font-medium text-red-900">Parsing Issues Detected</h3>
              <p className="mt-1 text-sm text-red-700">
                {parsing_errors!.length} row{parsing_errors!.length !== 1 ? 's' : ''} could not be parsed correctly
              </p>
              <div className="mt-3 max-h-40 overflow-y-auto rounded-lg bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-red-200">
                      <th className="px-3 py-2 text-left font-medium text-red-900">Row</th>
                      <th className="px-3 py-2 text-left font-medium text-red-900">Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-red-100">
                    {parsing_errors!.slice(0, 10).map((error, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2 font-mono text-red-700">{error.row_number}</td>
                        <td className="px-3 py-2 text-red-700">{error.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsing_errors!.length > 10 && (
                  <p className="border-t border-red-200 px-3 py-2 text-center text-xs text-red-600">
                    And {parsing_errors!.length - 10} more errors...
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Columns Detected */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-gray-900">Columns Detected ({columns_detected.length})</h3>
          {hasMoreColumns && (
            <button
              onClick={() => setShowAllColumns(!showAllColumns)}
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              {showAllColumns ? 'Show Less' : `Show All ${columns_detected.length}`}
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {displayColumns.map((col, idx) => (
            <span
              key={idx}
              className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700"
            >
              {col}
            </span>
          ))}
          {!showAllColumns && hasMoreColumns && (
            <span className="inline-flex items-center rounded-full bg-gray-50 px-3 py-1 text-sm text-gray-500">
              +{columns_detected.length - 8} more
            </span>
          )}
        </div>
      </div>

      {/* Data Preview Table */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3">
          <h3 className="font-medium text-gray-900">
            Data Preview (First {preview_rows.length} rows)
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="sticky left-0 bg-gray-50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Row
                </th>
                {columns_detected.map((col, idx) => (
                  <th
                    key={idx}
                    className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {preview_rows.map((row, rowIdx) => (
                <tr key={rowIdx} className="hover:bg-gray-50">
                  <td className="sticky left-0 bg-white px-4 py-3 font-mono text-xs text-gray-500">
                    {rowIdx + 1}
                  </td>
                  {columns_detected.map((col, colIdx) => {
                    const value = row[col];
                    const displayValue = value == null 
                      ? '' 
                      : typeof value === 'object' 
                        ? JSON.stringify(value)
                        : String(value);
                    
                    return (
                      <td
                        key={colIdx}
                        className={cn(
                          'whitespace-nowrap px-4 py-3',
                          value == null || value === '' 
                            ? 'text-gray-400 italic' 
                            : 'text-gray-900'
                        )}
                        title={displayValue}
                      >
                        {displayValue === '' ? '(empty)' : truncate(displayValue, 30)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-gray-200 bg-gray-50 px-4 py-2 text-center text-xs text-gray-500">
          Showing {preview_rows.length} of {total_rows.toLocaleString()} rows
        </div>
      </div>

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
          {hasErrors && (
            <span className="text-sm text-yellow-600">
              ⚠️ Some rows have parsing issues
            </span>
          )}
          <button
            onClick={onConfirm}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            Looks Good, Continue
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export default DataPreview;
