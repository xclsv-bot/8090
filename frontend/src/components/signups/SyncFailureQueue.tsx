'use client';

import { useState, useCallback } from 'react';
import type { SyncFailure } from '@/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  RefreshCw,
  AlertCircle,
  Clock,
  Loader2,
  Info,
  ChevronLeft,
  ChevronRight,
  Filter,
} from 'lucide-react';

interface SyncFailureQueueProps {
  failures: SyncFailure[];
  total: number;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onRetry: (id: string, syncPhase?: 'initial' | 'enriched') => Promise<void>;
  onRefresh: () => void;
  onFilterChange?: (filters: { syncPhase?: string; errorType?: string }) => void;
  loading?: boolean;
}

const errorTypeColors: Record<string, string> = {
  rate_limit: 'bg-yellow-100 text-yellow-700',
  server_error: 'bg-red-100 text-red-700',
  network: 'bg-orange-100 text-orange-700',
  other: 'bg-gray-100 text-gray-700',
};

const syncPhaseColors: Record<string, string> = {
  initial: 'bg-blue-100 text-blue-700',
  enriched: 'bg-purple-100 text-purple-700',
};

export function SyncFailureQueue({
  failures,
  total,
  currentPage,
  pageSize,
  onPageChange,
  onRetry,
  onRefresh,
  onFilterChange,
  loading = false,
}: SyncFailureQueueProps) {
  const [retrying, setRetrying] = useState<string | null>(null);
  const [selectedFailure, setSelectedFailure] = useState<SyncFailure | null>(null);
  const [filters, setFilters] = useState<{ syncPhase: string; errorType: string }>({
    syncPhase: '',
    errorType: '',
  });

  const totalPages = Math.ceil(total / pageSize);

  const handleRetry = useCallback(async (failure: SyncFailure) => {
    setRetrying(failure.id);
    try {
      await onRetry(failure.signupId, failure.syncPhase);
    } finally {
      setRetrying(null);
    }
  }, [onRetry]);

  const handleFilterChange = useCallback((key: string, value: string) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    onFilterChange?.({
      syncPhase: newFilters.syncPhase || undefined,
      errorType: newFilters.errorType || undefined,
    });
  }, [filters, onFilterChange]);

  const formatRelativeTime = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (failures.length === 0 && !filters.syncPhase && !filters.errorType) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="mx-auto h-12 w-12 text-gray-300" />
        <h3 className="mt-4 text-lg font-medium text-gray-900">No sync failures</h3>
        <p className="mt-1 text-gray-500">
          Customer.io sync failures will appear here for manual intervention.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters and header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <select
            className="rounded-md border px-3 py-1.5 text-sm"
            value={filters.syncPhase}
            onChange={(e) => handleFilterChange('syncPhase', e.target.value)}
          >
            <option value="">All Phases</option>
            <option value="initial">Initial Sync</option>
            <option value="enriched">Enriched Sync</option>
          </select>
          <select
            className="rounded-md border px-3 py-1.5 text-sm"
            value={filters.errorType}
            onChange={(e) => handleFilterChange('errorType', e.target.value)}
          >
            <option value="">All Errors</option>
            <option value="rate_limit">Rate Limit</option>
            <option value="server_error">Server Error</option>
            <option value="network">Network Error</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-sm text-gray-500">
            {total} failure{total !== 1 ? 's' : ''}
          </p>
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Failures table */}
      {failures.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-gray-500">No failures match the selected filters</p>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Phase</TableHead>
                <TableHead>Error</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Last Attempt</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {failures.map((failure) => (
                <TableRow key={failure.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{failure.customerName}</p>
                      <p className="text-sm text-gray-500">{failure.customerEmail}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={syncPhaseColors[failure.syncPhase]}>
                      {failure.syncPhase}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Badge className={errorTypeColors[failure.errorType]}>
                        {failure.errorType.replace('_', ' ')}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => setSelectedFailure(failure)}
                      >
                        <Info className="h-4 w-4 text-gray-400" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <span className={failure.attemptCount >= 3 ? 'text-red-600 font-medium' : ''}>
                        {failure.attemptCount}
                      </span>
                      <span className="text-gray-400">/ 5</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-gray-500">
                      <Clock className="h-4 w-4" />
                      <span className="text-sm">
                        {formatRelativeTime(failure.lastAttemptAt)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRetry(failure)}
                      disabled={retrying === failure.id}
                    >
                      {retrying === failure.id ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-1" />
                      )}
                      Retry
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-gray-500">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Error detail dialog */}
      <Dialog open={!!selectedFailure} onOpenChange={() => setSelectedFailure(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sync Failure Details</DialogTitle>
          </DialogHeader>
          
          {selectedFailure && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Customer</p>
                  <p className="font-medium">{selectedFailure.customerName}</p>
                  <p className="text-sm text-gray-500">{selectedFailure.customerEmail}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Sync Phase</p>
                  <Badge className={syncPhaseColors[selectedFailure.syncPhase]}>
                    {selectedFailure.syncPhase}
                  </Badge>
                </div>
              </div>

              <div>
                <p className="text-sm text-gray-500 mb-2">Error Type</p>
                <Badge className={errorTypeColors[selectedFailure.errorType]}>
                  {selectedFailure.errorType.replace('_', ' ')}
                </Badge>
              </div>

              <div>
                <p className="text-sm text-gray-500 mb-2">Error Message</p>
                <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                  <p className="text-sm text-red-700 font-mono whitespace-pre-wrap">
                    {selectedFailure.errorMessage}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Attempt Count</p>
                  <p className="font-medium">
                    {selectedFailure.attemptCount} of 5
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Last Attempt</p>
                  <p className="font-medium">
                    {new Date(selectedFailure.lastAttemptAt).toLocaleString()}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-sm text-gray-500">Created</p>
                <p className="text-sm">
                  {new Date(selectedFailure.createdAt).toLocaleString()}
                </p>
              </div>

              <div className="pt-4 border-t">
                <Button
                  onClick={() => {
                    handleRetry(selectedFailure);
                    setSelectedFailure(null);
                  }}
                  disabled={retrying === selectedFailure.id}
                  className="w-full"
                >
                  {retrying === selectedFailure.id ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Retry Sync
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default SyncFailureQueue;
