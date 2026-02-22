'use client';

import { useState, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Upload, FileText, AlertCircle, CheckCircle, XCircle, Loader2 } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://xclsv-core-platform.onrender.com';

interface ParsedRow {
  rowNumber: number;
  ambassadorName: string;
  date: string;
  state: string;
  event: string;
  rate: string;
  operator: string;
  email: string;
  firstname: string;
  lastname: string;
  cpa: string;
  parsedDate: string | null;
  parsedCpa: number | null;
  issues: string[];
}

interface ValidationResult {
  totalRows: number;
  validRows: number;
  duplicateRows: number;
  missingCpaRows: number;
  errorRows: number;
  rows: ParsedRow[];
  duplicates: ParsedRow[];
  missingCpa: ParsedRow[];
  errors: ParsedRow[];
}

interface ImportResult {
  success: boolean;
  ambassadorsCreated: number;
  operatorsCreated: number;
  eventsCreated: number;
  signupsCreated: number;
  errors: string[];
}

interface HistoricalImportSectionProps {
  eventId: string;
  onImportComplete?: () => void;
}

export function HistoricalImportSection({ eventId, onImportComplete }: HistoricalImportSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAllRows, setShowAllRows] = useState(false);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setValidation(null);
    setImportResult(null);
    setValidating(true);

    try {
      const csvContent = await file.text();
      
      const response = await fetch(`${API_URL}/api/v1/imports/historical-signups/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvContent }),
      });

      const result = await response.json();

      if (!result.success) {
        setError(result.error || 'Validation failed');
        return;
      }

      setValidation(result.data);
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message || 'Failed to validate CSV');
    } finally {
      setValidating(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  async function handleCommit() {
    if (!validation) return;

    setCommitting(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/v1/imports/historical-signups/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          rows: validation.rows.filter(r => 
            r.issues.length === 0 || r.issues.every(i => i.includes('Missing CPA'))
          ),
          eventId,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        setError(result.error || 'Import failed');
        return;
      }

      setImportResult(result.data);
      setValidation(null);
      onImportComplete?.();
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message || 'Failed to import data');
    } finally {
      setCommitting(false);
    }
  }

  function resetState() {
    setValidation(null);
    setImportResult(null);
    setError(null);
  }

  const displayRows = showAllRows 
    ? validation?.rows || []
    : [...(validation?.errors || []), ...(validation?.duplicates || []), ...(validation?.missingCpa || [])].slice(0, 20);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Import Historical Sign-ups
        </h3>
      </div>

      {/* Upload Section */}
      {!validation && !importResult && (
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Upload a CSV file with historical sign-up data. The system will validate for duplicates and missing data before importing.
          </p>
          
          <div className="border-2 border-dashed rounded-lg p-8 text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="hidden"
              id="csv-upload"
            />
            <label 
              htmlFor="csv-upload" 
              className="cursor-pointer flex flex-col items-center gap-2"
            >
              {validating ? (
                <>
                  <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
                  <span className="text-sm text-gray-600">Validating CSV...</span>
                </>
              ) : (
                <>
                  <FileText className="h-8 w-8 text-gray-400" />
                  <span className="text-sm text-gray-600">
                    Click to select CSV file
                  </span>
                  <span className="text-xs text-gray-400">
                    Expected columns: Ambassador Name, Date, State, Event, Rate, Operator, Email, firstname, lastname, CPA
                  </span>
                </>
              )}
            </label>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm">
              <XCircle className="h-4 w-4" />
              {error}
            </div>
          )}
        </div>
      )}

      {/* Validation Results */}
      {validation && !importResult && (
        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold">{validation.totalRows}</p>
              <p className="text-xs text-gray-500">Total Rows</p>
            </div>
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-green-700">{validation.validRows}</p>
              <p className="text-xs text-gray-500">Valid</p>
            </div>
            <div className="bg-yellow-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-yellow-700">{validation.duplicateRows}</p>
              <p className="text-xs text-gray-500">Duplicates</p>
            </div>
            <div className="bg-orange-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-orange-700">{validation.missingCpaRows}</p>
              <p className="text-xs text-gray-500">Missing CPA</p>
            </div>
          </div>

          {/* Flagged Rows Table */}
          {displayRows.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium">
                  {showAllRows ? 'All Rows' : 'Flagged Rows'}
                </h4>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setShowAllRows(!showAllRows)}
                >
                  {showAllRows ? 'Show flagged only' : 'Show all rows'}
                </Button>
              </div>
              
              <div className="border rounded-lg max-h-64 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">Row</TableHead>
                      <TableHead>Ambassador</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Operator</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>CPA</TableHead>
                      <TableHead>Issues</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayRows.map((row) => (
                      <TableRow key={row.rowNumber} className={row.issues.length > 0 ? 'bg-red-50' : ''}>
                        <TableCell className="font-mono text-xs">{row.rowNumber}</TableCell>
                        <TableCell className="text-sm">{row.ambassadorName}</TableCell>
                        <TableCell className="text-sm">{row.email}</TableCell>
                        <TableCell className="text-sm">{row.operator}</TableCell>
                        <TableCell className="text-sm">{row.date}</TableCell>
                        <TableCell className="text-sm">{row.cpa || '—'}</TableCell>
                        <TableCell>
                          {row.issues.map((issue, idx) => (
                            <Badge 
                              key={idx} 
                              className={
                                issue.includes('Duplicate') || issue.includes('Already exists')
                                  ? 'bg-yellow-100 text-yellow-700 mr-1'
                                  : issue.includes('Missing CPA')
                                  ? 'bg-orange-100 text-orange-700 mr-1'
                                  : 'bg-red-100 text-red-700 mr-1'
                              }
                            >
                              {issue}
                            </Badge>
                          ))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={resetState}>
              Cancel
            </Button>
            <Button 
              onClick={handleCommit} 
              disabled={committing || validation.validRows === 0}
            >
              {committing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Import {validation.validRows} Sign-ups
                </>
              )}
            </Button>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm">
              <XCircle className="h-4 w-4" />
              {error}
            </div>
          )}
        </div>
      )}

      {/* Import Complete */}
      {importResult && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="h-6 w-6" />
            <span className="font-medium">Import Complete!</span>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-green-700">{importResult.signupsCreated}</p>
              <p className="text-xs text-gray-500">Sign-ups Created</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-blue-700">{importResult.ambassadorsCreated}</p>
              <p className="text-xs text-gray-500">Ambassadors Created</p>
            </div>
            <div className="bg-purple-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-purple-700">{importResult.operatorsCreated}</p>
              <p className="text-xs text-gray-500">Operators Created</p>
            </div>
            <div className="bg-indigo-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-indigo-700">{importResult.eventsCreated}</p>
              <p className="text-xs text-gray-500">Events Created</p>
            </div>
          </div>

          {importResult.errors.length > 0 && (
            <div className="bg-red-50 rounded-lg p-3">
              <p className="text-sm font-medium text-red-700 mb-1">Errors:</p>
              <ul className="text-sm text-red-600 list-disc list-inside">
                {importResult.errors.slice(0, 5).map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
                {importResult.errors.length > 5 && (
                  <li>...and {importResult.errors.length - 5} more</li>
                )}
              </ul>
            </div>
          )}

          <Button variant="outline" onClick={resetState}>
            Import Another File
          </Button>
        </div>
      )}
    </Card>
  );
}
