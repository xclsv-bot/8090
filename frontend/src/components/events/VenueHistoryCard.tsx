'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Calendar,
  History,
  Loader2,
  TrendingUp,
  UserRound,
} from 'lucide-react';
import { get } from '@/lib/api/client';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useTrafficPrediction } from '@/hooks/useTrafficPrediction';
import type { ManualInsight } from '@/types/trafficPrediction';

interface VenueHistoryCardProps {
  venueId: string;
  date?: string;
  time?: string;
}

export function VenueHistoryCard({ venueId, date, time = '18:00' }: VenueHistoryCardProps) {
  const [manualInsight, setManualInsight] = useState<ManualInsight | null>(null);

  const { venueHistory, score } = useTrafficPrediction({
    venueId,
    date,
    time,
    autoFetch: Boolean(venueId),
  });

  useEffect(() => {
    async function loadManualInsight() {
      if (!date) {
        setManualInsight(null);
        return;
      }

      try {
        const response = await get<{ date: string; insightType: 'recurring' | 'specific'; trafficExpectation: 'high' | 'moderate' | 'low'; label: string; notes?: string }>(
          `/api/v1/manual-insights/effective?date=${date}`
        );

        if (!response.data) {
          setManualInsight(null);
          return;
        }

        setManualInsight({
          trafficExpectation: response.data.trafficExpectation,
          insightType: response.data.insightType,
          notes: response.data.notes || response.data.label || 'No additional notes',
          applicableDate: response.data.date,
        });
      } catch {
        setManualInsight(null);
      }
    }

    void loadManualInsight();
  }, [date]);

  const summary = venueHistory.data?.summaryStats;
  const recentEvents = venueHistory.data?.recentEvents || [];

  const variance = useMemo(() => {
    if (!summary || !score.data) return null;
    return Math.round(score.data.eventScore - summary.avgSignups);
  }, [summary, score.data]);

  if (!venueId) return null;

  if (venueHistory.loading && !venueHistory.data) {
    return (
      <Card className="p-4 bg-blue-50 border-blue-200">
        <div className="flex items-center gap-2 text-blue-700 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading venue insights...
        </div>
      </Card>
    );
  }

  if (!venueHistory.data || !summary) {
    return null;
  }

  return (
    <Card className="p-4 bg-gradient-to-br from-slate-50 to-blue-50 border-blue-200 space-y-3">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-blue-700" />
        <h4 className="font-medium text-sm text-blue-900">Venue Insights</h4>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <Stat label="Avg Signups" value={summary.avgSignups.toFixed(1)} icon={<TrendingUp className="h-3 w-3" />} />
        <Stat label="Total Events" value={String(summary.totalEvents)} />
        <Stat label="Success Rate" value={`${Math.round(summary.successRate * 100)}%`} />
        <Stat label="Confidence" value={summary.confidenceLevel} />
      </div>

      <div className="rounded-md border bg-white p-2 text-xs space-y-2">
        <div className="font-medium text-gray-700">Real-time Event Score</div>
        {score.loading ? (
          <div className="flex items-center gap-2 text-gray-500">
            <Loader2 className="h-3 w-3 animate-spin" />
            Calculating score...
          </div>
        ) : score.data ? (
          <>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Event Score</span>
              <Badge className={score.data.eventScore >= 70 ? 'bg-green-600 text-white' : score.data.eventScore >= 40 ? 'bg-amber-500 text-white' : 'bg-red-600 text-white'}>
                {Math.round(score.data.eventScore)}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-1 text-[11px]">
              <span>Game: {Math.round(score.data.breakdown.gameRelevance)}</span>
              <span>History: {Math.round(score.data.breakdown.historicalPerformance)}</span>
              <span>Day/Time: {Math.round(score.data.breakdown.dayTimeFactor)}</span>
              <span>Seasonal: {Math.round(score.data.breakdown.seasonalFactor)}</span>
            </div>
            <div className="text-[11px] text-gray-600">{score.data.explanation}</div>
          </>
        ) : (
          <div className="text-gray-500">Select date/time for a live score.</div>
        )}
      </div>

      {variance !== null && Math.abs(variance) >= 20 && (
        <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 flex items-start gap-2">
          <AlertTriangle className="h-3 w-3 mt-0.5" />
          Score variance detected ({variance > 0 ? '+' : ''}{variance}) vs average signup baseline.
        </div>
      )}

      {summary.totalEvents < 3 && (
        <div className="rounded border border-orange-300 bg-orange-50 p-2 text-xs text-orange-800 flex items-start gap-2">
          <AlertTriangle className="h-3 w-3 mt-0.5" />
          Confidence warning: fewer than 3 historical events at this venue.
        </div>
      )}

      {manualInsight && (
        <div className="rounded border border-indigo-200 bg-indigo-50 p-2 text-xs text-indigo-900">
          <div className="font-medium">Manual Insight ({manualInsight.insightType})</div>
          <div className="capitalize">Traffic expectation: {manualInsight.trafficExpectation}</div>
          <div>{manualInsight.notes}</div>
        </div>
      )}

      {recentEvents.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-gray-600">Recent Events</div>
          {recentEvents.slice(0, 8).map((event) => (
            <div key={event.eventId} className="rounded border bg-white p-2 text-xs flex items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-1 text-gray-700">
                  <Calendar className="h-3 w-3" />
                  {new Date(event.date).toLocaleDateString()} {event.time || ''}
                </div>
                <div className="flex items-center gap-1 text-gray-500">
                  <UserRound className="h-3 w-3" />
                  {event.ambassador || `${event.ambassadorCount} ambassadors`}
                </div>
              </div>
              <Badge variant="outline">{event.signups} signups</Badge>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="rounded bg-white border p-2">
      <div className="text-gray-500">{label}</div>
      <div className="font-semibold flex items-center gap-1 capitalize">
        {icon}
        {value}
      </div>
    </div>
  );
}
