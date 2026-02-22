'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { eventsApi, signupsApi } from '@/lib/api';
import type { Event, Signup } from '@/types';
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
import { ArrowLeft, Calendar, MapPin, Users, Copy, CalendarRange, Trash2 } from 'lucide-react';
import { EventDuplicateModal, BulkDuplicateModal, EventBudgetSection, AmbassadorAssignmentSection } from '@/components/events';

const statusColors: Record<string, string> = {
  planned: 'bg-gray-100 text-gray-700',
  confirmed: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  completed: 'bg-purple-100 text-purple-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function EventDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [event, setEvent] = useState<Event | null>(null);
  const [signups, setSignups] = useState<Signup[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Duplicate modal state
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [showBulkDuplicateModal, setShowBulkDuplicateModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!event) return;
    if (!confirm(`Are you sure you want to delete "${event.title}"? This cannot be undone.`)) return;
    
    setDeleting(true);
    try {
      await eventsApi.delete(event.id);
      router.push('/events');
    } catch (error) {
      console.error('Failed to delete event:', error);
      alert('Failed to delete event');
    } finally {
      setDeleting(false);
    }
  }

  const loadData = useCallback(async () => {
    try {
      const [eventRes, signupsRes] = await Promise.all([
        eventsApi.get(params.id as string),
        signupsApi.list({ eventId: params.id as string }),
      ]);
      setEvent(eventRes.data);
      setSignups(signupsRes.data || []);
    } catch (error) {
      console.error('Failed to load event:', error);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    if (params.id) loadData();
  }, [params.id, loadData]);

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center text-gray-500">Loading event...</div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="p-8">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900">Event not found</h2>
          <Button className="mt-4" onClick={() => router.push('/events')}>
            Back to Events
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <Button variant="ghost" className="mb-4" onClick={() => router.push('/events')}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Events
      </Button>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Event Details */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{event.title}</h1>
                {event.description && (
                  <p className="mt-2 text-gray-600">{event.description}</p>
                )}
              </div>
              <Badge className={statusColors[event.status]}>{event.status}</Badge>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-blue-100 p-2">
                  <Calendar className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Date</p>
                  <p className="font-medium">
                    {new Date(event.eventDate).toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                </div>
              </div>

              {(event.venue || event.city) && (
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-green-100 p-2">
                    <MapPin className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Location</p>
                    <p className="font-medium">
                      {event.venue}
                      {event.city && `, ${event.city}`}
                      {event.state && `, ${event.state}`}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <div className="rounded-full bg-purple-100 p-2">
                  <Users className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Sign-ups</p>
                  <p className="font-medium">{signups.length} customers</p>
                </div>
              </div>
            </div>
          </Card>

          {/* Sign-ups Table */}
          <Card>
            <div className="p-4 border-b">
              <h2 className="text-lg font-semibold">Sign-ups ({signups.length})</h2>
            </div>
            {signups.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No sign-ups recorded for this event yet.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Operator</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {signups.slice(0, 20).map((signup) => (
                    <TableRow key={signup.id}>
                      <TableCell>
                        <p className="font-medium">
                          {signup.customerFirstName} {signup.customerLastName}
                        </p>
                        {signup.customerEmail && (
                          <p className="text-sm text-gray-500">{signup.customerEmail}</p>
                        )}
                      </TableCell>
                      <TableCell>{signup.operatorName || '—'}</TableCell>
                      <TableCell>
                        <Badge className={signup.validationStatus === 'validated' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}>
                          {signup.validationStatus}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(signup.submittedAt).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {signups.length > 20 && (
              <div className="p-4 text-center text-sm text-gray-500">
                Showing 20 of {signups.length} sign-ups
              </div>
            )}
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="font-semibold mb-4">Event Stats</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-500">Total Sign-ups</span>
                <span className="font-medium">{signups.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Validated</span>
                <span className="font-medium text-green-600">
                  {signups.filter(s => s.validationStatus === 'validated').length}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Pending</span>
                <span className="font-medium text-yellow-600">
                  {signups.filter(s => s.validationStatus === 'pending').length}
                </span>
              </div>
            </div>
          </Card>

          {/* Ambassador Assignment Section (WO-95) */}
          <AmbassadorAssignmentSection eventId={event.id} eventRegion={event.city} />

          {/* Budget Section (WO-96) */}
          <EventBudgetSection eventId={event.id} eventStatus={event.status} />

          <Card className="p-6">
            <h3 className="font-semibold mb-4">Actions</h3>
            <div className="space-y-2">
              <Button className="w-full" variant="outline">Edit Event</Button>
              <Button className="w-full" variant="outline">Export Sign-ups</Button>
              <div className="border-t pt-2 mt-2">
                <p className="text-xs text-gray-500 mb-2">Duplication</p>
                <Button 
                  className="w-full mb-2" 
                  variant="outline"
                  onClick={() => setShowDuplicateModal(true)}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Duplicate Event
                </Button>
                <Button 
                  className="w-full" 
                  variant="outline"
                  onClick={() => setShowBulkDuplicateModal(true)}
                >
                  <CalendarRange className="mr-2 h-4 w-4" />
                  Bulk Duplicate
                </Button>
              </div>
              <div className="border-t pt-2 mt-2">
                <Button 
                  className="w-full" 
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {deleting ? 'Deleting...' : 'Delete Event'}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Single Duplicate Modal */}
      {event && (
        <EventDuplicateModal
          open={showDuplicateModal}
          onOpenChange={setShowDuplicateModal}
          event={event}
          onSuccess={(newEvent) => {
            // Optionally navigate to the new event
            router.push(`/events/${newEvent.id}`);
          }}
        />
      )}

      {/* Bulk Duplicate Modal */}
      {event && (
        <BulkDuplicateModal
          open={showBulkDuplicateModal}
          onOpenChange={setShowBulkDuplicateModal}
          event={event}
          onSuccess={() => {
            // Optionally navigate to events list to see all new events
            router.push('/events');
          }}
        />
      )}
    </div>
  );
}
