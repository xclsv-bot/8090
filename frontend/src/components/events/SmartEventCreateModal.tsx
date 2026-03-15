'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles, Zap } from 'lucide-react';
import { eventsApi } from '@/lib/api';
import { get } from '@/lib/api/client';
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
import { useTrafficPrediction } from '@/hooks/useTrafficPrediction';
import type { AlertData } from '@/types/trafficPrediction';
import { ContextualAlerts } from './ContextualAlerts';
import { DateTimeRecommendations } from './DateTimeRecommendations';
import { GameScheduleDisplay } from './GameScheduleDisplay';
import { VenueHistoryCard } from './VenueHistoryCard';
import { VenueRecommendations } from './VenueRecommendations';

interface SmartEventCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
  suggestionsRefreshKey?: number;
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

interface Venue {
  id: string;
  name: string;
  region: string;
  address?: string;
  status: string;
}

export function SmartEventCreateModal({
  open,
  onOpenChange,
  onCreated,
  suggestionsRefreshKey = 0,
}: SmartEventCreateModalProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loadingVenues, setLoadingVenues] = useState(false);
  const [showNewVenue, setShowNewVenue] = useState(false);
  const [newVenueName, setNewVenueName] = useState('');
  const [newVenueAddress, setNewVenueAddress] = useState('');

  const [form, setForm] = useState({
    title: '',
    venue: '',
    venueId: '',
    region: '',
    eventDate: '',
    startTime: '17:00',
    endTime: '22:00',
    description: '',
  });

  const { score, recommendations, venueHistory, isLoading } = useTrafficPrediction({
    venueId: form.venueId || undefined,
    region: form.region || undefined,
    date: form.eventDate || undefined,
    time: form.startTime || undefined,
    week: 1,
    autoFetch: open,
    debounceMs: 300,
  });

  useEffect(() => {
    if (!open) return;

    async function loadVenues() {
      setLoadingVenues(true);
      try {
        const response = await get<Venue[]>('/api/v1/venues');
        setVenues(response.data || []);
      } catch {
        setVenues([]);
      } finally {
        setLoadingVenues(false);
      }
    }

    void loadVenues();
  }, [open, suggestionsRefreshKey]);

  const contextualAlerts = useMemo<AlertData[]>(() => {
    const alerts: AlertData[] = [];

    if (score.data?.eventScore !== undefined && score.data.eventScore < 30) {
      alerts.push({
        type: 'low_traffic',
        severity: 'high',
        message: 'Projected Event Score is below 30. Consider another window.',
        dismissible: true,
      });
    }

    if (venueHistory.data && venueHistory.data.summaryStats.totalEvents < 3) {
      alerts.push({
        type: 'low_confidence',
        severity: 'medium',
        message: 'Venue confidence is low due to limited historical events.',
        dismissible: true,
      });
    }

    const deadPeriodAlerts = (recommendations.data || [])
      .flatMap((recommendation) => recommendation.alerts)
      .filter((alert) => alert.type === 'low_traffic')
      .slice(0, 2);

    alerts.push(...deadPeriodAlerts);

    return alerts;
  }, [score.data, venueHistory.data, recommendations.data]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!form.title || !form.venue || !form.eventDate || !form.region) {
      alert('Please fill in all required fields: Title, Venue, Date, Region');
      return;
    }

    setSaving(true);
    try {
      const res = await eventsApi.create({
        title: form.title,
        venue: form.venue,
        city: form.region,
        eventDate: form.eventDate,
        startTime: form.startTime,
        endTime: form.endTime,
        description: form.description,
      });

      if (res.data?.id) {
        onOpenChange(false);
        onCreated?.();
        router.push('/events');
      }
    } catch {
      alert('Failed to create event');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Smart Event Creation
            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-gray-500" />}
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
                  placeholder="Super Bowl Watch Party"
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium">Venue *</label>
                {!showNewVenue ? (
                  <select
                    className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
                    value={form.venueId}
                    onChange={(e) => {
                      if (e.target.value === 'new') {
                        setShowNewVenue(true);
                        setForm((prev) => ({ ...prev, venueId: '', venue: '' }));
                        return;
                      }

                      const selectedVenue = venues.find((v) => v.id === e.target.value);
                      setForm((prev) => ({
                        ...prev,
                        venueId: e.target.value,
                        venue: selectedVenue?.name || '',
                        region: selectedVenue?.region || prev.region,
                      }));
                    }}
                    required={!showNewVenue}
                  >
                    <option value="">{loadingVenues ? 'Loading venues...' : 'Select a venue...'}</option>
                    {venues
                      .filter((v) => !form.region || v.region === form.region)
                      .filter((v) => v.status === 'Active')
                      .map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} ({v.region})
                        </option>
                      ))}
                    <option value="" disabled>
                      ───────────
                    </option>
                    <option value="new">+ Add New Venue</option>
                  </select>
                ) : (
                  <div className="space-y-2 mt-1">
                    <Input
                      value={newVenueName}
                      onChange={(e) => {
                        setNewVenueName(e.target.value);
                        setForm((prev) => ({ ...prev, venue: e.target.value }));
                      }}
                      placeholder="Venue name"
                      required
                    />
                    <Input
                      value={newVenueAddress}
                      onChange={(e) => setNewVenueAddress(e.target.value)}
                      placeholder="Address (optional)"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowNewVenue(false);
                        setNewVenueName('');
                        setNewVenueAddress('');
                      }}
                    >
                      Back to venue list
                    </Button>
                  </div>
                )}
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
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional event description..."
                />
              </div>

              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Creating...
                  </>
                ) : (
                  'Create Event'
                )}
              </Button>
            </form>

            {form.venueId && !showNewVenue && (
              <VenueHistoryCard venueId={form.venueId} date={form.eventDate} time={form.startTime} />
            )}
          </div>

          <div className="md:col-span-3 overflow-y-auto border-l pl-6 space-y-4">
            <Card className="p-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-blue-600" />
                Live Traffic Intelligence
                {score.data && <Badge>{Math.round(score.data.eventScore)}</Badge>}
              </div>
            </Card>

            <ContextualAlerts alerts={contextualAlerts} />
            <VenueRecommendations region={form.region} date={form.eventDate} />
            <GameScheduleDisplay region={form.region} date={form.eventDate} />
            <DateTimeRecommendations region={form.region} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
