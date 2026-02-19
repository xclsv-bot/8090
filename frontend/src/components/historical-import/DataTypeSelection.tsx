'use client';

import React, { useState, useEffect } from 'react';
import type { DataType, DetectedDataType } from '@/types/import';
import { DATA_TYPE_LABELS, DATA_TYPE_DESCRIPTIONS, detectDataTypes, cn } from '@/lib/utils';

interface DataTypeSelectionProps {
  columns: string[];
  selectedTypes: DataType[];
  onSelect: (types: DataType[]) => void;
  onBack: () => void;
  onContinue: () => void;
}

export function DataTypeSelection({
  columns,
  selectedTypes,
  onSelect,
  onBack,
  onContinue,
}: DataTypeSelectionProps) {
  const [detectedTypes, setDetectedTypes] = useState<DetectedDataType[]>([]);

  useEffect(() => {
    const detected = detectDataTypes(columns);
    setDetectedTypes(detected);
    
    // Auto-select high confidence types
    const autoSelected = detected
      .filter(d => d.confidence >= 70)
      .map(d => d.dataType);
    
    if (autoSelected.length > 0 && selectedTypes.length === 0) {
      onSelect(autoSelected);
    }
  }, [columns]);

  const toggleType = (type: DataType) => {
    if (selectedTypes.includes(type)) {
      onSelect(selectedTypes.filter(t => t !== type));
    } else {
      onSelect([...selectedTypes, type]);
    }
  };

  const allDataTypes: DataType[] = ['sign_ups', 'budgets_actuals', 'payroll'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Select Data Type</h2>
        <p className="mt-1 text-sm text-gray-500">
          Choose what type of data this file contains. This determines which validation rules apply.
        </p>
      </div>

      {/* Auto-Detection Notice */}
      {detectedTypes.length > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-start gap-3">
            <svg className="h-5 w-5 flex-shrink-0 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <h3 className="font-medium text-blue-900">Auto-Detection Results</h3>
              <p className="mt-1 text-sm text-blue-700">
                Based on your column headers, we detected the following data types:
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {detectedTypes.map(({ dataType, confidence, matchingColumns }) => (
                  <span
                    key={dataType}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium',
                      confidence >= 70
                        ? 'bg-green-100 text-green-800'
                        : confidence >= 40
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-gray-100 text-gray-700'
                    )}
                    title={`Matching columns: ${matchingColumns.join(', ')}`}
                  >
                    {DATA_TYPE_LABELS[dataType]}
                    <span className={cn(
                      'text-xs font-normal',
                      confidence >= 70 ? 'text-green-600' : confidence >= 40 ? 'text-yellow-600' : 'text-gray-500'
                    )}>
                      {confidence}% match
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Data Type Options */}
      <div className="space-y-3">
        {allDataTypes.map((type) => {
          const detected = detectedTypes.find(d => d.dataType === type);
          const isSelected = selectedTypes.includes(type);

          return (
            <button
              key={type}
              onClick={() => toggleType(type)}
              className={cn(
                'w-full rounded-xl border-2 p-5 text-left transition-all',
                isSelected
                  ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
              )}
            >
              <div className="flex items-start gap-4">
                <div className={cn(
                  'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2',
                  isSelected
                    ? 'border-blue-500 bg-blue-500'
                    : 'border-gray-300 bg-white'
                )}>
                  {isSelected && (
                    <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className={cn(
                      'font-semibold',
                      isSelected ? 'text-blue-900' : 'text-gray-900'
                    )}>
                      {DATA_TYPE_LABELS[type]}
                    </h3>
                    {detected && detected.confidence >= 70 && (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        Recommended
                      </span>
                    )}
                  </div>
                  <p className={cn(
                    'mt-1 text-sm',
                    isSelected ? 'text-blue-700' : 'text-gray-500'
                  )}>
                    {DATA_TYPE_DESCRIPTIONS[type]}
                  </p>
                  {detected && (
                    <div className="mt-2">
                      <p className="text-xs text-gray-500">
                        Matching columns: {detected.matchingColumns.join(', ')}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Multiple Type Warning */}
      {selectedTypes.length > 1 && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <div className="flex items-start gap-3">
            <svg className="h-5 w-5 flex-shrink-0 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h3 className="font-medium text-yellow-900">Multiple Data Types Selected</h3>
              <p className="mt-1 text-sm text-yellow-700">
                Your file appears to contain multiple data types. For best results, consider splitting the 
                data into separate files for each type. Validation rules may conflict when importing 
                multiple types together.
              </p>
            </div>
          </div>
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
        
        <button
          onClick={onContinue}
          disabled={selectedTypes.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Continue to Validation
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default DataTypeSelection;
