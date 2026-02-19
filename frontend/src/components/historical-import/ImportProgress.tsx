'use client';

import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface ImportProgressProps {
  totalRecords: number;
  status?: 'preparing' | 'importing' | 'finalizing';
}

export function ImportProgress({ totalRecords, status = 'importing' }: ImportProgressProps) {
  const [progress, setProgress] = useState(0);
  const [currentPhase, setCurrentPhase] = useState<string>('Preparing import...');

  // Simulate progress updates (in real implementation, this would come from SSE or polling)
  useEffect(() => {
    const phases = [
      { threshold: 0, message: 'Preparing import...' },
      { threshold: 10, message: 'Creating new entities...' },
      { threshold: 30, message: 'Linking records...' },
      { threshold: 60, message: 'Importing data...' },
      { threshold: 90, message: 'Finalizing...' },
    ];

    const interval = setInterval(() => {
      setProgress(p => {
        const next = Math.min(p + Math.random() * 5, 95);
        const phase = [...phases].reverse().find(ph => next >= ph.threshold);
        if (phase) setCurrentPhase(phase.message);
        return next;
      });
    }, 500);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-blue-100">
          <svg className="h-10 w-10 animate-pulse text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-gray-900">Import in Progress</h2>
        <p className="mt-2 text-gray-500">
          Please wait while we import your data. Do not close this page.
        </p>
      </div>

      {/* Progress Bar */}
      <div className="mx-auto max-w-md">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium text-gray-700">{currentPhase}</span>
          <span className="text-gray-500">{Math.round(progress)}%</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="mx-auto max-w-lg rounded-xl border border-gray-200 bg-white p-6">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-gray-900">{totalRecords.toLocaleString()}</p>
            <p className="text-sm text-gray-500">Total Records</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-blue-600">
              {Math.round(totalRecords * progress / 100).toLocaleString()}
            </p>
            <p className="text-sm text-gray-500">Processed</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-400">
              {Math.round(totalRecords * (100 - progress) / 100).toLocaleString()}
            </p>
            <p className="text-sm text-gray-500">Remaining</p>
          </div>
        </div>
      </div>

      {/* Activity Log */}
      <div className="mx-auto max-w-lg">
        <h3 className="mb-3 text-sm font-medium text-gray-700">Activity Log</h3>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="space-y-2 font-mono text-xs text-gray-600">
            <LogEntry time="00:00" message="Import started" />
            {progress > 10 && <LogEntry time="00:02" message="Created new entities" status="success" />}
            {progress > 30 && <LogEntry time="00:05" message="Linking records to existing data" />}
            {progress > 60 && <LogEntry time="00:12" message="Importing sign-up records..." />}
            {progress > 90 && <LogEntry time="00:18" message="Finalizing import..." />}
            <LogEntry time="--:--" message={currentPhase} status="active" />
          </div>
        </div>
      </div>

      {/* Warning */}
      <div className="mx-auto max-w-lg rounded-lg border border-yellow-200 bg-yellow-50 p-4">
        <div className="flex items-center gap-3">
          <svg className="h-5 w-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-sm text-yellow-800">
            Please keep this page open until the import completes. Closing this page may interrupt the process.
          </p>
        </div>
      </div>
    </div>
  );
}

interface LogEntryProps {
  time: string;
  message: string;
  status?: 'success' | 'error' | 'active';
}

function LogEntry({ time, message, status }: LogEntryProps) {
  return (
    <div className={cn(
      'flex items-center gap-3',
      status === 'active' && 'text-blue-600 font-medium'
    )}>
      <span className="w-12 text-gray-400">[{time}]</span>
      {status === 'success' && <span className="text-green-500">✓</span>}
      {status === 'error' && <span className="text-red-500">✗</span>}
      {status === 'active' && (
        <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
      )}
      {!status && <span className="w-2" />}
      <span>{message}</span>
    </div>
  );
}

export default ImportProgress;
