// Historical Data Import - Utility Functions

import type { DataType, DetectedDataType, ImportStatus } from '../types/import';

// File size formatting
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// Date formatting
export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Relative time formatting
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(dateString);
}

// Data type display names
export const DATA_TYPE_LABELS: Record<DataType, string> = {
  sign_ups: 'Sign-Ups',
  budgets_actuals: 'Event Budgets & Actuals',
  payroll: 'Ambassador Payroll',
};

// Data type descriptions
export const DATA_TYPE_DESCRIPTIONS: Record<DataType, string> = {
  sign_ups: 'Ambassador sign-up records with customer info, operator, and timestamps',
  budgets_actuals: 'Event financial data including budgets, actual costs, and revenue',
  payroll: 'Ambassador compensation records including payments and bonuses',
};

// Expected columns for each data type
export const EXPECTED_COLUMNS: Record<DataType, string[]> = {
  sign_ups: [
    'ambassador_name', 'ambassador_email', 'customer_name', 'customer_email',
    'operator', 'sign_up_date', 'event_name', 'venue'
  ],
  budgets_actuals: [
    'event_name', 'event_date', 'venue', 'budget', 'actual_cost',
    'revenue', 'attendees', 'sign_ups_target', 'sign_ups_actual'
  ],
  payroll: [
    'ambassador_name', 'ambassador_email', 'period_start', 'period_end',
    'base_pay', 'bonus', 'total_pay', 'sign_up_count'
  ],
};

// Detect likely data types from column headers
export function detectDataTypes(columns: string[]): DetectedDataType[] {
  const normalizedColumns = columns.map(c => c.toLowerCase().replace(/[^a-z0-9]/g, '_'));
  const results: DetectedDataType[] = [];

  for (const [dataType, expectedCols] of Object.entries(EXPECTED_COLUMNS) as [DataType, string[]][]) {
    const matchingColumns: string[] = [];
    
    for (const expected of expectedCols) {
      const found = normalizedColumns.find(col => 
        col.includes(expected) || expected.includes(col)
      );
      if (found) {
        matchingColumns.push(columns[normalizedColumns.indexOf(found)]);
      }
    }

    if (matchingColumns.length > 0) {
      const confidence = (matchingColumns.length / expectedCols.length) * 100;
      results.push({
        dataType,
        confidence: Math.round(confidence),
        matchingColumns,
      });
    }
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}

// Status badge colors
export function getStatusColor(status: ImportStatus): string {
  const colors: Record<ImportStatus, string> = {
    pending: 'bg-gray-100 text-gray-700',
    parsing: 'bg-blue-100 text-blue-700',
    validating: 'bg-blue-100 text-blue-700',
    reconciling: 'bg-yellow-100 text-yellow-700',
    ready: 'bg-green-100 text-green-700',
    importing: 'bg-blue-100 text-blue-700',
    completed: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
  };
  return colors[status] || 'bg-gray-100 text-gray-700';
}

// Status labels
export function getStatusLabel(status: ImportStatus): string {
  const labels: Record<ImportStatus, string> = {
    pending: 'Pending',
    parsing: 'Parsing...',
    validating: 'Validating...',
    reconciling: 'Reconciling...',
    ready: 'Ready',
    importing: 'Importing...',
    completed: 'Completed',
    failed: 'Failed',
  };
  return labels[status] || status;
}

// Confidence score color
export function getConfidenceColor(score: number): string {
  if (score >= 90) return 'text-green-600';
  if (score >= 70) return 'text-yellow-600';
  return 'text-red-600';
}

// Truncate text
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

// Validate file extension
export function isValidFileType(file: File): boolean {
  const validTypes = [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ];
  const validExtensions = ['.csv', '.xls', '.xlsx'];
  
  const hasValidType = validTypes.includes(file.type);
  const hasValidExtension = validExtensions.some(ext => 
    file.name.toLowerCase().endsWith(ext)
  );
  
  return hasValidType || hasValidExtension;
}

// cn utility for className merging
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
