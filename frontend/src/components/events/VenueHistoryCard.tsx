'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { History, TrendingUp, Users, Calendar, Loader2 } from 'lucide-react';

interface VenueHistory {
  venue: string;
  region: string;
  stats: {
    totalEvents: number;
    totalSignups: number;
    avgSignups: number;
    bestEventSignups: number;
  };
  recentEvents: Array<{
    id: string;
    title: string;
    eventDate: string;
    status: string;
    signupCount: number;
    validatedCount: number;
  }>;
}

interface VenueHistoryCardProps {
  venueId: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://xclsv-core-platform.onrender.com';

export function VenueHistoryCard({ venueId }: VenueHistoryCardProps) {
  const [history, setHistory] = useState<VenueHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!venueId) {
      setHistory(null);
      setLoading(false);
      return;
    }

    async function fetchHistory() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_URL}/api/v1/venues/${venueId}/history`);
        if (!res.ok) {
          throw new Error('Failed to fetch venue history');
        }
        const data = await res.json();
        setHistory(data.data);
      } catch (err) {
        console.error('Failed to load venue history:', err);
        setError('Could not load venue history');
      } finally {
        setLoading(false);
      }
    }

    fetchHistory();
  }, [venueId]);

  if (!venueId) return null;

  if (loading) {
    return (
      <Card className="p-4 bg-blue-50 border-blue-200">
        <div className="flex items-center gap-2 text-blue-700">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading venue history...</span>
        </div>
      </Card>
    );
  }

  if (error || !history) {
    return null; // Silently fail - history is a nice-to-have
  }

  if (history.stats.totalEvents === 0) {
    return (
      <Card className="p-4 bg-gray-50 border-gray-200">
        <div className="flex items-center gap-2 text-gray-600">
          <History className="h-4 w-4" />
          <span className="text-sm">No previous events at this venue</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 bg-gradient-to-br from-blue-50 to-purple-50 border-blue-200">
      <div className="flex items-center gap-2 mb-3">
        <History className="h-4 w-4 text-blue-600" />
        <h4 className="font-medium text-sm text-blue-900">Venue History</h4>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-white rounded-lg p-2 shadow-sm">
          <div className="text-xs text-gray-500">Past Events</div>
          <div className="text-lg font-bold text-gray-900">{history.stats.totalEvents}</div>
        </div>
        <div className="bg-white rounded-lg p-2 shadow-sm">
          <div className="text-xs text-gray-500">Avg Signups</div>
          <div className="text-lg font-bold text-green-600 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            {history.stats.avgSignups.toFixed(1)}
          </div>
        </div>
        <div className="bg-white rounded-lg p-2 shadow-sm">
          <div className="text-xs text-gray-500">Total Signups</div>
          <div className="text-lg font-bold text-gray-900">{history.stats.totalSignups}</div>
        </div>
        <div className="bg-white rounded-lg p-2 shadow-sm">
          <div className="text-xs text-gray-500">Best Event</div>
          <div className="text-lg font-bold text-purple-600">{history.stats.bestEventSignups}</div>
        </div>
      </div>

      {/* Recent Events */}
      {history.recentEvents.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-gray-500 font-medium">Recent Events</div>
          {history.recentEvents.slice(0, 3).map((event) => (
            <div key={event.id} className="bg-white rounded-lg p-2 shadow-sm flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{event.title}</div>
                <div className="text-xs text-gray-400 flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {new Date(event.eventDate).toLocaleDateString()}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge 
                  variant="outline" 
                  className={event.signupCount >= history.stats.avgSignups ? 'border-green-500 text-green-700' : 'border-gray-300'}
                >
                  <Users className="h-3 w-3 mr-1" />
                  {event.signupCount}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
