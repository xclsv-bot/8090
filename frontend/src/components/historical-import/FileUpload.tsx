'use client';

import React, { useState, useCallback, useRef } from 'react';
import { formatFileSize, isValidFileType, cn } from '@/lib/utils';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  isUploading?: boolean;
  error?: string | null;
}

export function FileUpload({ onFileSelect, isUploading = false, error }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const validateAndSelectFile = useCallback((file: File) => {
    setValidationError(null);
    
    if (!isValidFileType(file)) {
      setValidationError('Invalid file type. Please upload a CSV or Excel file (.csv, .xls, .xlsx)');
      return;
    }

    if (file.size > 50 * 1024 * 1024) { // 50MB limit
      setValidationError('File is too large. Maximum file size is 50MB.');
      return;
    }

    setSelectedFile(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      validateAndSelectFile(files[0]);
    }
  }, [validateAndSelectFile]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      validateAndSelectFile(files[0]);
    }
  }, [validateAndSelectFile]);

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setValidationError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUpload = () => {
    if (selectedFile) {
      onFileSelect(selectedFile);
    }
  };

  const displayError = error || validationError;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Upload File</h2>
        <p className="mt-1 text-sm text-gray-500">
          Select a CSV or Excel file containing your historical data
        </p>
      </div>

      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'relative rounded-xl border-2 border-dashed p-8 text-center transition-colors',
          isDragging
            ? 'border-blue-500 bg-blue-50'
            : selectedFile
            ? 'border-green-300 bg-green-50'
            : 'border-gray-300 bg-gray-50 hover:border-gray-400',
          displayError && 'border-red-300 bg-red-50'
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          onChange={handleFileChange}
          className="hidden"
          disabled={isUploading}
        />

        {selectedFile ? (
          <div className="space-y-4">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-xl bg-green-100">
              <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-gray-900">{selectedFile.name}</p>
              <p className="text-sm text-gray-500">{formatFileSize(selectedFile.size)}</p>
            </div>
            {!isUploading && (
              <button
                onClick={handleClearFile}
                className="text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Choose a different file
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-xl bg-gray-100">
              <svg className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <div>
              <p className="text-gray-700">
                <button
                  type="button"
                  onClick={handleBrowseClick}
                  className="font-semibold text-blue-600 hover:text-blue-700"
                >
                  Click to browse
                </button>
                {' '}or drag and drop
              </p>
              <p className="mt-1 text-sm text-gray-500">
                CSV or Excel files up to 50MB
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Error Message */}
      {displayError && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {displayError}
        </div>
      )}

      {/* Format Guide */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-medium text-gray-900">Supported Formats</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <FormatItem
            icon="📄"
            format="CSV"
            description="Comma-separated values"
            extensions=".csv"
          />
          <FormatItem
            icon="📊"
            format="Excel"
            description="Microsoft Excel"
            extensions=".xls, .xlsx"
          />
          <FormatItem
            icon="📋"
            format="Headers"
            description="First row should contain column names"
            extensions=""
          />
        </div>
      </div>

      {/* Data Type Examples */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-medium text-gray-900">Expected Data Formats</h3>
        <div className="mt-3 space-y-3">
          <DataTypeExample
            type="Sign-Ups"
            columns={['Ambassador Name', 'Ambassador Email', 'Customer Name', 'Operator', 'Sign-Up Date']}
          />
          <DataTypeExample
            type="Budgets & Actuals"
            columns={['Event Name', 'Event Date', 'Venue', 'Budget', 'Actual Cost', 'Revenue']}
          />
          <DataTypeExample
            type="Payroll"
            columns={['Ambassador Name', 'Period Start', 'Period End', 'Base Pay', 'Bonus']}
          />
        </div>
      </div>

      {/* Action Button */}
      {selectedFile && !validationError && (
        <div className="flex justify-end">
          <button
            onClick={handleUpload}
            disabled={isUploading}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {isUploading ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Uploading...
              </>
            ) : (
              <>
                Continue to Preview
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

interface FormatItemProps {
  icon: string;
  format: string;
  description: string;
  extensions: string;
}

function FormatItem({ icon, format, description, extensions }: FormatItemProps) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-2xl">{icon}</span>
      <div>
        <p className="font-medium text-gray-900">{format}</p>
        <p className="text-xs text-gray-500">{description}</p>
        {extensions && <p className="text-xs font-mono text-gray-400">{extensions}</p>}
      </div>
    </div>
  );
}

interface DataTypeExampleProps {
  type: string;
  columns: string[];
}

function DataTypeExample({ type, columns }: DataTypeExampleProps) {
  return (
    <div>
      <p className="text-sm font-medium text-gray-700">{type}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        {columns.map((col) => (
          <span
            key={col}
            className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
          >
            {col}
          </span>
        ))}
      </div>
    </div>
  );
}

export default FileUpload;
