'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Loader2, Pencil } from 'lucide-react';
import { eventsApi } from '@/lib/api';
import type { Event } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

interface EventEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: Event | null;
  onSaved?: () => void;
}

const REGIONS = [
  'Arizona',
  'Atlanta',
  'Boston',
  'Charlotte',
  'Chicago',
  'Cleveland',
  'Dallas',
  'Denver',
  'Detroit',
  'Houston',
  'Kansas City',
  'Las Vegas',
  'Los Angeles',
  'Miami',
  'New Jersey',
  'New Orleans',
  'Philly',
  'San Francisco',
  'Seattle',
  'St Louis',
];

function normalizeDate(value?: string): string {
  if (!value) return '';
  return value.includes('T') ? value.split('T')[0] : value;
}

function normalizeTime(value?: string): string {
  if (!value) return '';
  return value.length >= 5 ? value.slice(0, 5) : value;
}

export function EventEditModal({
  open,
  onOpenChange,
  event,
  onSaved,
}: EventEditModalProps) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '',
    venue: '',
    region: '',
    eventDate: '',
    startTime: '',
    endTime: '',
    description: '',
    notes: '',
  });

  useEffect(() => {
    if (!open || !event) return;

    setForm({
      title: event.title || '',
      venue: event.venue || '',
      region: event.city || '',
      eventDate: normalizeDate(event.eventDate),
      startTime: normalizeTime(event.startTime),
      endTime: normalizeTime(event.endTime),
      description: event.description || '',
      notes: event.notes || '',
    });
  }, [open, event]);

  if (!event) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!event) return;

    if (!form.title || !form.venue || !form.region || !form.eventDate) {
      alert('Please fill in all required fields: Title, Venue, Region, Date');
      return;
    }

    setSaving(true);
    try {
      await eventsApi.update(event.id, {
        title: form.title,
        venue: form.venue,
        city: form.region,
        eventDate: form.eventDate,
        startTime: form.startTime || undefined,
        endTime: form.endTime || undefined,
        description: form.description || undefined,
        notes: form.notes || undefined,
      });

      onOpenChange(false);
      onSaved?.();
    } catch (error) {
      console.error('Failed to update event:', error);
      alert('Failed to update event');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-blue-600" />
            Edit Event
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-5 gap-6">
          <div className="md:col-span-2 overflow-y-auto pr-2 space-y-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium">Event Title *</label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium">Venue *</label>
                <Input
                  value={form.venue}
                  onChange={(e) => setForm((prev) => ({ ...prev, venue: e.target.value }))}
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium">Region *</label>
                <select
                  className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                  value={form.region}
                  onChange={(e) => setForm((prev) => ({ ...prev, region: e.target.value }))}
                  required
                >
                  <option value="">Select a region...</option>
                  {REGIONS.map((region) => (
                    <option key={region} value={region}>
                      {region}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">Date *</label>
                <Input
                  type="date"
                  value={form.eventDate}
                  onChange={(e) => setForm((prev) => ({ ...prev, eventDate: e.target.value }))}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Start Time</label>
                  <Input
                    type="time"
                    value={form.startTime}
                    onChange={(e) => setForm((prev) => ({ ...prev, startTime: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">End Time</label>
                  <Input
                    type="time"
                    value={form.endTime}
                    onChange={(e) => setForm((prev) => ({ ...prev, endTime: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Description</label>
                <textarea
                  className="w-full px-3 py-2 border rounded-md text-sm"
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-sm font-medium">Notes</label>
                <textarea
                  className="w-full px-3 py-2 border rounded-md text-sm"
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                />
              </div>

              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </form>
          </div>

          <div className="md:col-span-3 overflow-y-auto border-l pl-6 space-y-4">
            <Card className="p-4 space-y-4">
              <div>
                <p className="text-sm text-gray-500">Current Status</p>
                <div className="mt-1">
                  <Badge className="capitalize">{event.status}</Badge>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Status is read-only in this modal. Use the dedicated status update flow.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-gray-500">Created</p>
                  <p className="font-medium">{new Date(event.createdAt).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-gray-500">Last Updated</p>
                  <p className="font-medium">{new Date(event.updatedAt).toLocaleString()}</p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
