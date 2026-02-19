'use client';

import React, { useState } from 'react';
import type { ImportResult, ImportError } from '@/types/import';
import { downloadReport } from '@/lib/api-client';
import { cn } from '@/lib/utils';

interface ImportResultsProps {
  result: ImportResult;
  onDone: () => void;
  onViewAuditTrail: () => void;
}

export function ImportResults({ result, onDone, onViewAuditTrail }: ImportResultsProps) {
  const [downloadingFormat, setDownloadingFormat] = useState<'csv' | 'pdf' | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const { status, summary, audit_trail_id, errors = [] } = result;
  const isSuccess = status === 'success';
  const isPartial = status === 'partial';
  const isFailed = status === 'failed';

  const totalImported = summary.sign_ups_imported + summary.budgets_imported + summary.payroll_imported;
  const totalEntitiesCreated = 
    summary.new_ambassadors_created + 
    summary.new_events_created +
    (summary.new_operators_created || 0) +
    (summary.new_venues_created || 0);

  const handleDownload = async (format: 'csv' | 'pdf') => {
    try {
      setDownloadingFormat(format);
      const blob = await downloadReport(result.import_id, format);
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `import-report-${result.import_id}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
    } finally {
      setDownloadingFormat(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Success/Partial/Failed Banner */}
      {isSuccess && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-green-900">Import Successful!</h2>
          <p className="mt-2 text-green-700">
            All records have been imported successfully
          </p>
        </div>
      )}

      {isPartial && (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-100">
            <svg className="h-8 w-8 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-yellow-900">Import Partially Complete</h2>
          <p className="mt-2 text-yellow-700">
            Some records were imported, but {errors.length} record{errors.length !== 1 ? 's' : ''} failed
          </p>
        </div>
      )}

      {isFailed && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <svg className="h-8 w-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-red-900">Import Failed</h2>
          <p className="mt-2 text-red-700">
            The import could not be completed. Please review the errors and try again.
          </p>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Imported"
          value={totalImported}
          color={totalImported > 0 ? 'green' : 'gray'}
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Sign-Ups"
          value={summary.sign_ups_imported}
          color="blue"
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          }
        />
        <StatCard
          label="Financial Records"
          value={summary.budgets_imported}
          color="purple"
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Payroll Records"
          value={summary.payroll_imported}
          color="orange"
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          }
        />
      </div>

      {/* New Entities Created */}
      {totalEntitiesCreated > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h3 className="font-semibold text-gray-900">New Entities Created</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {summary.new_ambassadors_created > 0 && (
              <EntityBadge label="Ambassadors" count={summary.new_ambassadors_created} icon="👤" />
            )}
            {summary.new_events_created > 0 && (
              <EntityBadge label="Events" count={summary.new_events_created} icon="📅" />
            )}
            {(summary.new_operators_created || 0) > 0 && (
              <EntityBadge label="Operators" count={summary.new_operators_created!} icon="🏢" />
            )}
            {(summary.new_venues_created || 0) > 0 && (
              <EntityBadge label="Venues" count={summary.new_venues_created!} icon="📍" />
            )}
          </div>
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-white">
          <button
            onClick={() => setShowErrors(!showErrors)}
            className="flex w-full items-center justify-between p-4"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
                <svg className="h-4 w-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="font-medium text-red-900">
                {errors.length} Record{errors.length !== 1 ? 's' : ''} Failed
              </span>
            </div>
            <svg
              className={cn('h-5 w-5 text-gray-400 transition-transform', showErrors && 'rotate-180')}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showErrors && (
            <div className="border-t border-red-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-red-50">
                    <th className="px-4 py-2 text-left font-medium text-red-900">Row</th>
                    <th className="px-4 py-2 text-left font-medium text-red-900">Type</th>
                    <th className="px-4 py-2 text-left font-medium text-red-900">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-100">
                  {errors.slice(0, 20).map((error, idx) => (
                    <tr key={idx} className="hover:bg-red-50">
                      <td className="px-4 py-2 font-mono text-red-700">{error.row_number}</td>
                      <td className="px-4 py-2 text-red-700">{error.record_type}</td>
                      <td className="px-4 py-2 text-red-600">{error.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {errors.length > 20 && (
                <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-center text-xs text-red-600">
                  Showing first 20 of {errors.length} errors. Download report for full list.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="font-semibold text-gray-900">Next Steps</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button
            onClick={() => handleDownload('csv')}
            disabled={downloadingFormat !== null}
            className="flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {downloadingFormat === 'csv' ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-600 border-t-transparent" />
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            )}
            Download Report (CSV)
          </button>
          <button
            onClick={() => handleDownload('pdf')}
            disabled={downloadingFormat !== null}
            className="flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {downloadingFormat === 'pdf' ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-600 border-t-transparent" />
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            )}
            Download Report (PDF)
          </button>
          <button
            onClick={onViewAuditTrail}
            className="flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            View Audit Trail
          </button>
          <button
            onClick={onDone}
            className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Back to Dashboard
          </button>
        </div>
      </div>

      {/* Audit Trail ID */}
      <div className="text-center text-xs text-gray-400">
        Import ID: {result.import_id} • Audit Trail: {audit_trail_id}
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number;
  color: 'green' | 'blue' | 'purple' | 'orange' | 'gray';
  icon: React.ReactNode;
}

function StatCard({ label, value, color, icon }: StatCardProps) {
  const colorClasses = {
    green: 'bg-green-50 border-green-200 text-green-600',
    blue: 'bg-blue-50 border-blue-200 text-blue-600',
    purple: 'bg-purple-50 border-purple-200 text-purple-600',
    orange: 'bg-orange-50 border-orange-200 text-orange-600',
    gray: 'bg-gray-50 border-gray-200 text-gray-600',
  };

  return (
    <div className={cn('rounded-xl border p-4', colorClasses[color])}>
      <div className="flex items-center justify-between">
        {icon}
        <span className="text-3xl font-bold">{value.toLocaleString()}</span>
      </div>
      <p className="mt-2 text-sm font-medium opacity-80">{label}</p>
    </div>
  );
}

interface EntityBadgeProps {
  label: string;
  count: number;
  icon: string;
}

function EntityBadge({ label, count, icon }: EntityBadgeProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
      <span className="text-2xl">{icon}</span>
      <div>
        <p className="text-lg font-bold text-gray-900">+{count}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );
}

export default ImportResults;
