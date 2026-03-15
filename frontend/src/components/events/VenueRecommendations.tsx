'use client';

import { AlertTriangle, Loader2, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useTrafficPrediction } from '@/hooks/useTrafficPrediction';

interface VenueRecommendationsProps {
  region: string;
  date: string;
}

export function VenueRecommendations({ region, date }: VenueRecommendationsProps) {
  const { recommendations } = useTrafficPrediction({
    region,
    date,
    week: 1,
    autoFetch: Boolean(region && date),
  });

  if (!region || !date) {
    return (
      <Card className="p-3 text-xs text-gray-500">
        Select region and date to generate ranked venue recommendations.
      </Card>
    );
  }

  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="h-4 w-4 text-emerald-600" />
        Venue Recommendations
      </div>

      {recommendations.loading && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          Calculating recommendations...
        </div>
      )}

      {recommendations.error && <div className="text-xs text-red-600">{recommendations.error}</div>}

      <div className="space-y-2 max-h-72 overflow-auto pr-1">
        {(recommendations.data || []).map((venue, index) => {
          const topRank = index === 0;
          return (
            <div
              key={venue.venueId}
              className={`border rounded p-2 text-xs ${topRank ? 'bg-emerald-50 border-emerald-300' : 'bg-white'}`}
            >
              <div className="flex items-center justify-between">
                <div className="font-medium">{venue.venueName}</div>
                <Badge className={topRank ? 'bg-emerald-600 text-white' : ''}>
                  {Math.round(venue.predictedScore)}
                </Badge>
              </div>

              <div className="mt-1 flex flex-wrap gap-1">
                {venue.contributingFactors.map((factor) => (
                  <Badge key={factor} variant="outline" className="text-[10px]">
                    {factor}
                  </Badge>
                ))}
              </div>

              {venue.alerts.length > 0 && (
                <div className="mt-2 space-y-1">
                  {venue.alerts.map((alert, alertIndex) => (
                    <div key={`${venue.venueId}-${alert.type}-${alertIndex}`} className="text-[11px] text-amber-700 flex items-start gap-1">
                      <AlertTriangle className="h-3 w-3 mt-0.5" />
                      {alert.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!recommendations.loading && (recommendations.data || []).length === 0 && (
        <div className="text-xs text-gray-500">No recommendations available for this region and date.</div>
      )}
    </Card>
  );
}
