'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, Filter, Loader2, Tv, Trophy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useTrafficPrediction } from '@/hooks/useTrafficPrediction';
import type { GameSchedule } from '@/types/trafficPrediction';

interface GameScheduleDisplayProps {
  region: string;
  date: string;
}

type SortMode = 'relevance' | 'date';
type FilterMode = 'all' | 'local' | 'high_impact';

export function GameScheduleDisplay({ region, date }: GameScheduleDisplayProps) {
  const [sortMode, setSortMode] = useState<SortMode>('relevance');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');

  const { sportsCalendar } = useTrafficPrediction({
    region,
    date,
    autoFetch: Boolean(region && date),
  });

  const games = useMemo(() => {
    const source = sportsCalendar.data || [];

    const filtered = source.filter((game) => {
      if (filterMode === 'local') return game.isLocalTeam;
      if (filterMode === 'high_impact') return isHighImpactGame(game);
      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      if (sortMode === 'date') {
        return new Date(`${a.date}T${a.time}`).getTime() - new Date(`${b.date}T${b.time}`).getTime();
      }
      return b.relevanceScore - a.relevanceScore;
    });

    return sorted;
  }, [sportsCalendar.data, filterMode, sortMode]);

  if (!region || !date) {
    return (
      <Card className="p-3 text-xs text-gray-500">
        Select region and date to see local team games for the next 7 days.
      </Card>
    );
  }

  return (
    <Card className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold flex items-center gap-2">
          <CalendarDays className="h-4 w-4" />
          Game Schedule
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value as FilterMode)}
            className="text-xs border rounded px-2 py-1"
            aria-label="Filter games"
          >
            <option value="all">All</option>
            <option value="local">Local Teams</option>
            <option value="high_impact">High Impact</option>
          </select>
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="text-xs border rounded px-2 py-1"
            aria-label="Sort games"
          >
            <option value="relevance">Top Relevance</option>
            <option value="date">Date/Time</option>
          </select>
        </div>
      </div>

      {sportsCalendar.loading && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading schedule...
        </div>
      )}

      {sportsCalendar.error && <div className="text-xs text-red-600">{sportsCalendar.error}</div>}

      <div className="space-y-2 max-h-64 overflow-auto pr-1">
        {games.map((game, index) => (
          <div key={`${game.date}-${game.time}-${index}`} className="border rounded p-2 text-xs">
            <div className="flex items-center justify-between">
              <div className="font-medium">{game.teams}</div>
              <Badge variant="outline">{game.league}</Badge>
            </div>
            <div className="text-gray-500 mt-1">
              {new Date(game.date).toLocaleDateString()} at {formatTime(game.time)}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-flex items-center gap-1 text-gray-600">
                <Tv className="h-3 w-3" />
                {game.broadcastStatus}
              </span>
              {isHighImpactGame(game) && (
                <Badge className="bg-amber-100 text-amber-800 border-amber-300 inline-flex items-center gap-1">
                  <Trophy className="h-3 w-3" />
                  High Impact
                </Badge>
              )}
              {game.isLocalTeam && (
                <Badge className="bg-blue-100 text-blue-700 border-blue-300">Local</Badge>
              )}
              <Badge variant="secondary" className="ml-auto">
                <Filter className="h-3 w-3 mr-1" />
                {Math.round(game.relevanceScore)}
              </Badge>
            </div>
          </div>
        ))}
        {!sportsCalendar.loading && games.length === 0 && (
          <div className="text-xs text-gray-500">No games found for this window.</div>
        )}
      </div>
    </Card>
  );
}

function isHighImpactGame(game: GameSchedule): boolean {
  return Boolean(game.isPlayoffs || game.isChampionship || game.relevanceScore >= 75);
}

function formatTime(time: string): string {
  const merged = new Date(`1970-01-01T${time}`);
  if (Number.isNaN(merged.getTime())) return time;
  return merged.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
