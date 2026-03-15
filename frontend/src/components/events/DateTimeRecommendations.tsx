'use client';

import { useMemo } from 'react';
import { CalendarRange, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useTrafficPrediction } from '@/hooks/useTrafficPrediction';

interface DateTimeRecommendationsProps {
  region: string;
}

interface DaySlot {
  date: string;
  score: number;
  level: 'high' | 'medium' | 'low';
}

export function DateTimeRecommendations({ region }: DateTimeRecommendationsProps) {
  const week2 = useTrafficPrediction({ region, week: 2, autoFetch: Boolean(region) });
  const week3 = useTrafficPrediction({ region, week: 3, autoFetch: Boolean(region) });
  const week4 = useTrafficPrediction({ region, week: 4, autoFetch: Boolean(region) });

  const loading = week2.recommendations.loading || week3.recommendations.loading || week4.recommendations.loading;

  const calendarSlots = useMemo<DaySlot[]>(() => {
    const byDate = new Map<string, number[]>();

    [week2, week3, week4].forEach((weekData, idx) => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() + (idx + 1) * 7);

      (weekData.recommendations.data || []).forEach((rec, index) => {
        const day = new Date(start);
        day.setDate(start.getDate() + (index % 7));
        const key = day.toISOString().split('T')[0];
        const values = byDate.get(key) || [];
        values.push(rec.predictedScore);
        byDate.set(key, values);
      });
    });

    return Array.from(byDate.entries())
      .map(([date, scores]) => {
        const avg = scores.reduce((sum, current) => sum + current, 0) / scores.length;
        const level: DaySlot['level'] = avg >= 70 ? 'high' : avg >= 40 ? 'medium' : 'low';
        return {
          date,
          score: avg,
          level,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [week2.recommendations.data, week3.recommendations.data, week4.recommendations.data]);

  const bestTimes = useMemo(() => {
    const highDays = calendarSlots.filter((slot) => slot.level === 'high').length;
    const mediumDays = calendarSlots.filter((slot) => slot.level === 'medium').length;

    if (highDays >= mediumDays) {
      return ['6:00 PM', '7:30 PM', '8:00 PM'];
    }
    return ['5:00 PM', '6:00 PM', '7:00 PM'];
  }, [calendarSlots]);

  if (!region) {
    return <Card className="p-3 text-xs text-gray-500">Select a region to see optimal windows for weeks 2-4.</Card>;
  }

  return (
    <Card className="p-3 space-y-3">
      <div className="text-sm font-semibold flex items-center gap-2">
        <CalendarRange className="h-4 w-4" />
        Date/Time Recommendations (2-4 Weeks)
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          Building calendar outlook...
        </div>
      )}

      <div className="grid grid-cols-7 gap-1">
        {calendarSlots.slice(0, 21).map((slot) => (
          <div
            key={slot.date}
            className={`rounded border p-1 text-[10px] text-center ${
              slot.level === 'high'
                ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                : slot.level === 'medium'
                ? 'bg-amber-100 border-amber-300 text-amber-800'
                : 'bg-gray-100 border-gray-300 text-gray-600'
            }`}
            title={`${slot.date} (${slot.score.toFixed(1)})`}
          >
            <div>{new Date(slot.date).getDate()}</div>
            <div>{Math.round(slot.score)}</div>
          </div>
        ))}
      </div>

      <div className="text-xs space-y-2">
        <div className="flex items-center gap-2">
          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">High Opportunity</Badge>
          <span>Top projected traffic windows.</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-gray-100 text-gray-700 border-gray-300">Dead Period</Badge>
          <span>Lower projected traffic windows.</span>
        </div>
        <div>
          <span className="font-medium">Suggested start times:</span> {bestTimes.join(', ')}
        </div>
      </div>
    </Card>
  );
}
