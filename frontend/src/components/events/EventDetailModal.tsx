'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Calendar,
  MapPin,
  Clock,
  Users,
  DollarSign,
  FileText,
  Pencil,
  Copy,
  CalendarRange,
  ExternalLink,
} from 'lucide-react';
import type { Event, EventStatus } from '@/types';

interface EventDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: Event | null;
  onEdit?: (event: Event) => void;
  onDuplicate?: (event: Event) => void;
  onBulkDuplicate?: (event: Event) => void;
}

const STATUS_COLORS: Record<EventStatus, string> = {
  planned: 'bg-gray-100 text-gray-700',
  confirmed: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  completed: 'bg-purple-100 text-purple-700',
  cancelled: 'bg-red-100 text-red-700',
};

const STATUS_DOT_COLORS: Record<EventStatus, string> = {
  planned: 'bg-gray-500',
  confirmed: 'bg-blue-500',
  active: 'bg-green-500',
  completed: 'bg-purple-500',
  cancelled: 'bg-red-500',
};

export function EventDetailModal({
  open,
  onOpenChange,
  event,
  onEdit,
  onDuplicate,
  onBulkDuplicate,
}: EventDetailModalProps) {
  if (!event) return null;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (time: string | undefined) => {
    if (!time) return null;
    // Assuming time is in HH:MM format
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const formatLocation = () => {
    const parts = [];
    if (event.venue) parts.push(event.venue);
    if (event.address) parts.push(event.address);
    
    const cityState = [event.city, event.state].filter(Boolean).join(', ');
    if (cityState) parts.push(cityState);
    
    return parts;
  };

  const locationParts = formatLocation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <span
                  className={`w-3 h-3 rounded-full ${STATUS_DOT_COLORS[event.status]}`}
                />
                <Badge className={STATUS_COLORS[event.status]}>{event.status}</Badge>
              </div>
              <DialogTitle className="text-2xl">{event.title}</DialogTitle>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Date & Time */}
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Calendar className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Date & Time</p>
              <p className="font-medium text-gray-900">{formatDate(event.eventDate)}</p>
              {(event.startTime || event.endTime) && (
                <p className="text-gray-600">
                  {formatTime(event.startTime)}
                  {event.startTime && event.endTime && ' - '}
                  {formatTime(event.endTime)}
                </p>
              )}
            </div>
          </div>

          {/* Location */}
          {locationParts.length > 0 && (
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <MapPin className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Location</p>
                {locationParts.map((part, idx) => (
                  <p
                    key={idx}
                    className={idx === 0 ? 'font-medium text-gray-900' : 'text-gray-600'}
                  >
                    {part}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          {event.description && (
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                <FileText className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Description</p>
                <p className="text-gray-900">{event.description}</p>
              </div>
            </div>
          )}

          {/* Budget/Financial Info */}
          {(event.budgetAmount || event.projectedRevenue) && (
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-yellow-600" />
              </div>
              <div className="flex gap-8">
                {event.budgetAmount && (
                  <div>
                    <p className="text-sm text-gray-500">Budget</p>
                    <p className="font-medium text-gray-900">
                      ${event.budgetAmount.toLocaleString()}
                    </p>
                  </div>
                )}
                {event.projectedRevenue && (
                  <div>
                    <p className="text-sm text-gray-500">Projected Revenue</p>
                    <p className="font-medium text-gray-900">
                      ${event.projectedRevenue.toLocaleString()}
                    </p>
                  </div>
                )}
                {event.actualRevenue && (
                  <div>
                    <p className="text-sm text-gray-500">Actual Revenue</p>
                    <p className="font-medium text-gray-900">
                      ${event.actualRevenue.toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          {event.notes && (
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-sm font-medium text-gray-700 mb-1">Notes</p>
              <p className="text-gray-600 text-sm">{event.notes}</p>
            </div>
          )}

          <Separator />

          {/* Metadata */}
          <div className="flex gap-8 text-sm text-gray-500">
            <div>
              <span className="font-medium">Created:</span>{' '}
              {new Date(event.createdAt).toLocaleDateString()}
            </div>
            <div>
              <span className="font-medium">Updated:</span>{' '}
              {new Date(event.updatedAt).toLocaleDateString()}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <div className="flex items-center gap-2">
            {onDuplicate && (
              <Button
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                  onDuplicate(event);
                }}
              >
                <Copy className="mr-2 h-4 w-4" />
                Duplicate
              </Button>
            )}
            {onBulkDuplicate && (
              <Button
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                  onBulkDuplicate(event);
                }}
              >
                <CalendarRange className="mr-2 h-4 w-4" />
                Bulk Duplicate
              </Button>
            )}
            <Button
              onClick={() => {
                window.location.href = `/events/${event.id}`;
              }}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Edit Event
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
