'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  eventsApi,
  type RecurrencePattern,
  type BulkDuplicateEventInput,
  type BulkDuplicatePreview,
  type BulkDuplicateResult,
} from '@/lib/api';
import type { Event } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Copy,
  Calendar,
  Clock,
  AlertCircle,
  CheckCircle,
  Repeat,
  CalendarRange,
  AlertTriangle,
  Loader2,
} from 'lucide-react';

interface BulkDuplicateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: Event;
  onSuccess?: (result: BulkDuplicateResult) => void;
}

const RECURRENCE_OPTIONS: { value: RecurrencePattern; label: string; description: string }[] = [
  { value: 'weekly', label: 'Weekly', description: 'Every week on the same day' },
  { value: 'bi-weekly', label: 'Bi-Weekly', description: 'Every two weeks' },
  { value: 'monthly', label: 'Monthly', description: 'Same day each month' },
];

type Step = 'configure' | 'preview' | 'result';

export function BulkDuplicateModal({
  open,
  onOpenChange,
  event,
  onSuccess,
}: BulkDuplicateModalProps) {
  const [step, setStep] = useState<Step>('configure');
  const [form, setForm] = useState<BulkDuplicateEventInput>({
    recurrencePattern: 'weekly',
    startDate: '',
    endDate: '',
    startTime: event.startTime || '',
    endTime: event.endTime || '',
    skipConflicts: true,
  });
  const [preview, setPreview] = useState<BulkDuplicatePreview | null>(null);
  const [result, setResult] = useState<BulkDuplicateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get tomorrow's date as minimum
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split('T')[0];

  // Calculate max date (1 year from now)
  const maxDate = new Date();
  maxDate.setFullYear(maxDate.getFullYear() + 1);
  const maxDateStr = maxDate.toISOString().split('T')[0];

  // Validate form
  const isFormValid = form.startDate && form.endDate && form.startDate < form.endDate;

  const loadPreview = useCallback(async () => {
    if (!isFormValid) return;
    
    setLoading(true);
    setError(null);

    try {
      const response = await eventsApi.previewBulkDuplicate(event.id, {
        recurrencePattern: form.recurrencePattern,
        startDate: form.startDate,
        endDate: form.endDate,
        skipConflicts: form.skipConflicts,
      });
      setPreview(response.data);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate preview');
    } finally {
      setLoading(false);
    }
  }, [event.id, form, isFormValid]);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      const input: BulkDuplicateEventInput = {
        recurrencePattern: form.recurrencePattern,
        startDate: form.startDate,
        endDate: form.endDate,
        ...(form.startTime && { startTime: form.startTime }),
        ...(form.endTime && { endTime: form.endTime }),
        skipConflicts: form.skipConflicts,
      };

      const response = await eventsApi.bulkDuplicate(event.id, input);
      setResult(response.data);
      setStep('result');
      onSuccess?.(response.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate events');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      onOpenChange(false);
      // Reset state after animation
      setTimeout(() => {
        setStep('configure');
        setForm({
          recurrencePattern: 'weekly',
          startDate: '',
          endDate: '',
          startTime: event.startTime || '',
          endTime: event.endTime || '',
          skipConflicts: true,
        });
        setPreview(null);
        setResult(null);
        setError(null);
      }, 200);
    }
  };

  const handleBack = () => {
    if (step === 'preview') {
      setStep('configure');
      setPreview(null);
    }
  };

  // Format date for display
  const formatDate = (dateStr: string) => {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarRange className="h-5 w-5 text-blue-600" />
            Bulk Duplicate Event
          </DialogTitle>
          <DialogDescription>
            Create multiple copies of this event with a recurring schedule.
          </DialogDescription>
        </DialogHeader>

        {/* Step: Configure */}
        {step === 'configure' && (
          <div className="space-y-6">
            {/* Source Event Info */}
            <div className="rounded-lg bg-gray-50 p-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Source Event</h4>
              <p className="font-medium text-gray-900">{event.title}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-sm text-gray-600">
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {new Date(event.eventDate).toLocaleDateString()}
                </span>
                {event.venue && <span>• {event.venue}</span>}
              </div>
            </div>

            {/* Recurrence Pattern */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                <Repeat className="inline h-4 w-4 mr-1" />
                Recurrence Pattern
              </label>
              <div className="grid grid-cols-3 gap-3">
                {RECURRENCE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setForm({ ...form, recurrencePattern: option.value })}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      form.recurrencePattern === option.value
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className="font-medium text-gray-900">{option.label}</p>
                    <p className="text-xs text-gray-500 mt-1">{option.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    type="date"
                    value={form.startDate}
                    onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    min={minDate}
                    max={maxDateStr}
                    className="pl-10"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    type="date"
                    value={form.endDate}
                    onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                    min={form.startDate || minDate}
                    max={maxDateStr}
                    className="pl-10"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Time Override */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Time (all events)
                </label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    type="time"
                    value={form.startTime}
                    onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                    className="pl-10"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Time (all events)
                </label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    type="time"
                    value={form.endTime}
                    onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                    className="pl-10"
                  />
                </div>
              </div>
            </div>

            {/* Skip Conflicts Option */}
            <div className="flex items-center gap-3 p-4 rounded-lg bg-amber-50 border border-amber-200">
              <input
                type="checkbox"
                id="skipConflicts"
                checked={form.skipConflicts}
                onChange={(e) => setForm({ ...form, skipConflicts: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <label htmlFor="skipConflicts" className="text-sm font-medium text-amber-800">
                  Skip conflicting dates
                </label>
                <p className="text-xs text-amber-600">
                  Skip dates where an event already exists at the same venue
                </p>
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <div className="rounded-md bg-red-50 p-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-500" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
                Cancel
              </Button>
              <Button onClick={loadPreview} disabled={loading || !isFormValid}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    Preview Dates
                    <Calendar className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step: Preview */}
        {step === 'preview' && preview && (
          <div className="space-y-6">
            {/* Summary Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg bg-green-50 p-4 text-center">
                <p className="text-2xl font-bold text-green-700">{preview.validCount}</p>
                <p className="text-sm text-green-600">Events to Create</p>
              </div>
              {preview.conflictCount > 0 && (
                <div className="rounded-lg bg-amber-50 p-4 text-center">
                  <p className="text-2xl font-bold text-amber-700">{preview.conflictCount}</p>
                  <p className="text-sm text-amber-600">Conflicts</p>
                </div>
              )}
              {preview.pastDateCount > 0 && (
                <div className="rounded-lg bg-red-50 p-4 text-center">
                  <p className="text-2xl font-bold text-red-700">{preview.pastDateCount}</p>
                  <p className="text-sm text-red-600">Past Dates</p>
                </div>
              )}
            </div>

            {/* Preview Pattern Info */}
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 mb-3">
                <Repeat className="h-5 w-5 text-blue-500" />
                <span className="font-medium">
                  {RECURRENCE_OPTIONS.find((o) => o.value === form.recurrencePattern)?.label} from{' '}
                  {formatDate(form.startDate)} to {formatDate(form.endDate)}
                </span>
              </div>
              <p className="text-sm text-gray-600">
                {form.startTime && form.endTime
                  ? `${form.startTime} - ${form.endTime}`
                  : 'Times from original event'}
              </p>
            </div>

            {/* Date List */}
            <div className="max-h-60 overflow-y-auto rounded-lg border">
              <div className="divide-y">
                {preview.dates.map((date, idx) => {
                  const isConflict = preview.conflicts.includes(date);
                  const isPast = preview.pastDates.includes(date);
                  const isValid = !isConflict && !isPast;

                  return (
                    <div
                      key={date}
                      className={`flex items-center justify-between p-3 ${
                        isValid ? 'bg-white' : 'bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-400 w-6">#{idx + 1}</span>
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <span className={isValid ? 'text-gray-900' : 'text-gray-500'}>
                          {formatDate(date)}
                        </span>
                      </div>
                      {isConflict && (
                        <Badge variant="outline" className="text-amber-600 border-amber-300">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Conflict
                        </Badge>
                      )}
                      {isPast && (
                        <Badge variant="outline" className="text-red-600 border-red-300">
                          Past Date
                        </Badge>
                      )}
                      {isValid && (
                        <Badge variant="outline" className="text-green-600 border-green-300">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Valid
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Warning if no valid dates */}
            {preview.validCount === 0 && (
              <div className="rounded-md bg-red-50 p-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-500" />
                  <p className="text-sm font-medium text-red-700">No valid dates to create</p>
                </div>
                <p className="mt-1 text-sm text-red-600">
                  All dates are either in the past or have conflicts. Try a different date range.
                </p>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="rounded-md bg-red-50 p-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-500" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleBack} disabled={loading}>
                Back
              </Button>
              <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={loading || preview.validCount === 0}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    Create {preview.validCount} Events
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step: Result */}
        {step === 'result' && result && (
          <div className="space-y-6">
            {/* Success/Mixed Result Display */}
            <div className="py-6 text-center">
              {result.successCount > 0 ? (
                <>
                  <CheckCircle className="mx-auto h-16 w-16 text-green-500" />
                  <h3 className="mt-4 text-xl font-semibold text-gray-900">
                    {result.successCount === result.totalRequested
                      ? 'All Events Created!'
                      : `${result.successCount} Events Created`}
                  </h3>
                </>
              ) : (
                <>
                  <AlertCircle className="mx-auto h-16 w-16 text-red-500" />
                  <h3 className="mt-4 text-xl font-semibold text-gray-900">
                    No Events Created
                  </h3>
                </>
              )}
            </div>

            {/* Result Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg bg-green-50 p-4 text-center">
                <p className="text-2xl font-bold text-green-700">{result.successCount}</p>
                <p className="text-sm text-green-600">Created</p>
              </div>
              {result.skippedCount > 0 && (
                <div className="rounded-lg bg-amber-50 p-4 text-center">
                  <p className="text-2xl font-bold text-amber-700">{result.skippedCount}</p>
                  <p className="text-sm text-amber-600">Skipped</p>
                </div>
              )}
              {result.failureCount > 0 && (
                <div className="rounded-lg bg-red-50 p-4 text-center">
                  <p className="text-2xl font-bold text-red-700">{result.failureCount}</p>
                  <p className="text-sm text-red-600">Failed</p>
                </div>
              )}
            </div>

            {/* Created Events List */}
            {result.createdEvents.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Created Events</h4>
                <div className="max-h-40 overflow-y-auto rounded-lg border divide-y">
                  {result.createdEvents.map((evt) => (
                    <div key={evt.id} className="flex items-center justify-between p-3">
                      <span className="font-medium">{evt.title}</span>
                      <span className="text-sm text-gray-500">
                        {new Date(evt.eventDate).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Failures List */}
            {result.failures.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Issues</h4>
                <div className="max-h-32 overflow-y-auto rounded-lg border border-red-200 bg-red-50 divide-y divide-red-200">
                  {result.failures.map((failure, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 text-sm">
                      <span className="text-red-700">{formatDate(failure.date)}</span>
                      <span className="text-red-600">{failure.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button onClick={handleClose}>
                Done
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
