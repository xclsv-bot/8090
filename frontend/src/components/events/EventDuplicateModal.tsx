'use client';

import { useState } from 'react';
import { eventsApi, type DuplicateEventInput } from '@/lib/api';
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
import { Copy, Calendar, Clock, AlertCircle, CheckCircle } from 'lucide-react';

interface EventDuplicateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: Event;
  onSuccess?: (newEvent: Event) => void;
}

export function EventDuplicateModal({
  open,
  onOpenChange,
  event,
  onSuccess,
}: EventDuplicateModalProps) {
  const [form, setForm] = useState<DuplicateEventInput>({
    eventDate: '',
    startTime: event.startTime || '',
    endTime: event.endTime || '',
    title: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<Event | null>(null);

  // Get tomorrow's date as minimum
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split('T')[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const input: DuplicateEventInput = {
        eventDate: form.eventDate,
        ...(form.startTime && { startTime: form.startTime }),
        ...(form.endTime && { endTime: form.endTime }),
        ...(form.title && { title: form.title }),
      };

      const response = await eventsApi.duplicate(event.id, input);
      setSuccess(response.data);
      onSuccess?.(response.data);
      
      // Reset and close after brief success display
      setTimeout(() => {
        onOpenChange(false);
        setSuccess(null);
        setForm({
          eventDate: '',
          startTime: event.startTime || '',
          endTime: event.endTime || '',
          title: '',
        });
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate event');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting) {
      onOpenChange(false);
      setError(null);
      setSuccess(null);
      setForm({
        eventDate: '',
        startTime: event.startTime || '',
        endTime: event.endTime || '',
        title: '',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5 text-blue-600" />
            Duplicate Event
          </DialogTitle>
          <DialogDescription>
            Create a copy of this event with a new date. All details will be copied except
            status (set to planned) and ambassador assignments.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="py-8 text-center">
            <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">Event Duplicated!</h3>
            <p className="mt-2 text-sm text-gray-500">
              Created: <span className="font-medium">{success.title}</span>
            </p>
            <p className="text-sm text-gray-500">
              Date: {new Date(success.eventDate).toLocaleDateString()}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Source Event Info */}
            <div className="rounded-lg bg-gray-50 p-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Source Event</h4>
              <p className="font-medium text-gray-900">{event.title}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-sm text-gray-600">
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  {new Date(event.eventDate).toLocaleDateString()}
                </span>
                {event.venue && (
                  <span>• {event.venue}</span>
                )}
                <Badge variant="outline" className="ml-auto">
                  {event.status}
                </Badge>
              </div>
            </div>

            {/* New Event Details */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  New Event Date <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    type="date"
                    value={form.eventDate}
                    onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
                    min={minDate}
                    required
                    className="pl-10"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Event date must be in the future
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Time
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
                    End Time
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

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Title Override
                </label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder={event.title}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Leave blank to keep original title: &quot;{event.title}&quot;
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
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || !form.eventDate}>
                {submitting ? (
                  <>
                    <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Duplicating...
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    Duplicate Event
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
