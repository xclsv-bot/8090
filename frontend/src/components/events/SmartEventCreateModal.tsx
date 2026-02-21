'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { eventsApi } from '@/lib/api';
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
import {
  Calendar,
  MapPin,
  TrendingUp,
  Zap,
  Loader2,
  ChevronRight,
  Clock,
  Trophy,
  Tv,
} from 'lucide-react';

interface SmartEventCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}

interface EventSuggestion {
  id: string;
  title: string;
  venue: string;
  city: string;
  state: string;
  date: string;
  startTime?: string;
  endTime?: string;
  trafficScore: number;
  games: Array<{
    league: string;
    homeTeam: string;
    awayTeam: string;
    time: string;
    network?: string;
  }>;
  reason: string;
}

interface SportsGame {
  id: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  gameDate: string;
  gameTime: string;
  venue?: string;
  city?: string;
  state?: string;
  broadcast?: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://xclsv-core-platform.onrender.com';

export function SmartEventCreateModal({ open, onOpenChange, onCreated }: SmartEventCreateModalProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<EventSuggestion[]>([]);
  const [upcomingGames, setUpcomingGames] = useState<SportsGame[]>([]);
  
  // Form state
  const [form, setForm] = useState({
    title: '',
    venue: '',
    city: '',
    state: '',
    eventDate: '',
    startTime: '17:00',
    endTime: '22:00',
    description: '',
  });

  // Load suggestions when modal opens
  useEffect(() => {
    if (open) {
      loadSuggestions();
    }
  }, [open]);

  // Filter suggestions when form changes
  useEffect(() => {
    // Could add real-time filtering here based on form.city, form.state, form.eventDate
  }, [form.city, form.state, form.eventDate]);

  async function loadSuggestions() {
    setLoadingSuggestions(true);
    try {
      // Try to fetch recommendations and upcoming games in parallel
      const [recsRes, gamesRes] = await Promise.allSettled([
        fetch(`${API_URL}/api/v1/traffic-prediction/recommendations?limit=10`).then(r => r.json()),
        fetch(`${API_URL}/api/v1/sports-calendar/upcoming?days=14`).then(r => r.json()),
      ]);

      // Process recommendations
      if (recsRes.status === 'fulfilled' && recsRes.value?.data) {
        setSuggestions(recsRes.value.data.map((r: any) => ({
          id: r.id || Math.random().toString(),
          title: r.suggestedTitle || r.title || 'Suggested Event',
          venue: r.venue || r.venueName || '',
          city: r.city || '',
          state: r.state || '',
          date: r.date || r.eventDate || '',
          startTime: r.startTime || '17:00',
          endTime: r.endTime || '22:00',
          trafficScore: r.trafficScore || r.score || 0,
          games: r.games || [],
          reason: r.reason || 'High traffic potential',
        })));
      }

      // Process upcoming games as backup suggestions
      if (gamesRes.status === 'fulfilled' && gamesRes.value?.data) {
        setUpcomingGames(gamesRes.value.data.slice(0, 10));
      }
    } catch (error) {
      console.error('Failed to load suggestions:', error);
    } finally {
      setLoadingSuggestions(false);
    }
  }

  function applyGameSuggestion(game: SportsGame) {
    const gameDate = game.gameDate?.split('T')[0] || '';
    setForm(prev => ({
      ...prev,
      title: `${game.homeTeam} vs ${game.awayTeam} Watch Party`,
      city: game.city || prev.city,
      state: game.state || prev.state,
      eventDate: gameDate,
      startTime: game.gameTime ? game.gameTime.substring(0, 5) : '17:00',
    }));
  }

  function applySuggestion(suggestion: EventSuggestion) {
    const suggestionDate = suggestion.date?.split('T')[0] || '';
    setForm({
      title: suggestion.title,
      venue: suggestion.venue,
      city: suggestion.city,
      state: suggestion.state,
      eventDate: suggestionDate,
      startTime: suggestion.startTime || '17:00',
      endTime: suggestion.endTime || '22:00',
      description: '',
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    // Validate required fields
    if (!form.title || !form.venue || !form.eventDate || !form.city || !form.state) {
      alert('Please fill in all required fields: Title, Venue, Date, City, State');
      return;
    }

    setSaving(true);
    try {
      const res = await eventsApi.create({
        title: form.title,
        venue: form.venue,
        city: form.city,
        state: form.state,
        eventDate: form.eventDate,
        startTime: form.startTime,
        endTime: form.endTime,
        description: form.description,
        status: 'planned',
      });

      if (res.data?.id) {
        onOpenChange(false);
        onCreated?.();
        router.push(`/events/${res.data.id}`);
      }
    } catch (error) {
      console.error('Failed to create event:', error);
      alert('Failed to create event');
    } finally {
      setSaving(false);
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'bg-green-100 text-green-700';
    if (score >= 60) return 'bg-yellow-100 text-yellow-700';
    if (score >= 40) return 'bg-orange-100 text-orange-700';
    return 'bg-red-100 text-red-700';
  };

  // Filter games by region if user has entered city/state
  const filteredGames = upcomingGames.filter(game => {
    if (!form.state) return true;
    return game.state?.toLowerCase() === form.state.toLowerCase();
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-yellow-500" />
            Smart Event Creation
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left Panel - Form */}
          <div className="overflow-y-auto pr-2">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium">Event Title *</label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Super Bowl Watch Party"
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium">Venue *</label>
                <Input
                  value={form.venue}
                  onChange={(e) => setForm(prev => ({ ...prev, venue: e.target.value }))}
                  placeholder="The Sports Bar"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">City *</label>
                  <Input
                    value={form.city}
                    onChange={(e) => setForm(prev => ({ ...prev, city: e.target.value }))}
                    placeholder="Phoenix"
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">State *</label>
                  <Input
                    value={form.state}
                    onChange={(e) => setForm(prev => ({ ...prev, state: e.target.value }))}
                    placeholder="AZ"
                    maxLength={2}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Date *</label>
                <Input
                  type="date"
                  value={form.eventDate}
                  onChange={(e) => setForm(prev => ({ ...prev, eventDate: e.target.value }))}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">Start Time</label>
                  <Input
                    type="time"
                    value={form.startTime}
                    onChange={(e) => setForm(prev => ({ ...prev, startTime: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">End Time</label>
                  <Input
                    type="time"
                    value={form.endTime}
                    onChange={(e) => setForm(prev => ({ ...prev, endTime: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Description</label>
                <textarea
                  className="w-full px-3 py-2 border rounded-md text-sm"
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
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
          </div>

          {/* Right Panel - Suggestions */}
          <div className="overflow-y-auto border-l pl-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              <h3 className="font-medium text-sm">AI Suggestions</h3>
            </div>

            {loadingSuggestions ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="space-y-3">
                {/* Traffic Prediction Suggestions */}
                {suggestions.length > 0 && (
                  <>
                    <p className="text-xs text-gray-500">Based on traffic prediction</p>
                    {suggestions.slice(0, 3).map((suggestion) => (
                      <Card
                        key={suggestion.id}
                        className="p-3 cursor-pointer hover:bg-gray-50 transition-colors"
                        onClick={() => applySuggestion(suggestion)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-medium text-sm">{suggestion.title}</p>
                            <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                              <MapPin className="h-3 w-3" />
                              {suggestion.venue}, {suggestion.city}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <Calendar className="h-3 w-3" />
                              {suggestion.date}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <Badge className={getScoreColor(suggestion.trafficScore)}>
                              {suggestion.trafficScore}
                            </Badge>
                            <ChevronRight className="h-4 w-4 text-gray-300" />
                          </div>
                        </div>
                      </Card>
                    ))}
                  </>
                )}

                {/* Upcoming Games */}
                {filteredGames.length > 0 && (
                  <>
                    <p className="text-xs text-gray-500 mt-4 flex items-center gap-1">
                      <Trophy className="h-3 w-3" />
                      Upcoming games {form.state && `in ${form.state}`}
                    </p>
                    {filteredGames.slice(0, 5).map((game) => (
                      <Card
                        key={game.id}
                        className="p-3 cursor-pointer hover:bg-gray-50 transition-colors"
                        onClick={() => applyGameSuggestion(game)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-medium text-sm">
                              {game.homeTeam} vs {game.awayTeam}
                            </p>
                            <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {new Date(game.gameDate).toLocaleDateString()}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {game.gameTime}
                              </span>
                            </div>
                            {game.broadcast && (
                              <div className="flex items-center gap-1 text-xs text-gray-500">
                                <Tv className="h-3 w-3" />
                                {game.broadcast}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col items-end">
                            <Badge variant="outline" className="text-xs">
                              {game.league}
                            </Badge>
                            <ChevronRight className="h-4 w-4 text-gray-300 mt-1" />
                          </div>
                        </div>
                      </Card>
                    ))}
                  </>
                )}

                {suggestions.length === 0 && filteredGames.length === 0 && (
                  <div className="text-center py-8 text-gray-400">
                    <Zap className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No suggestions available</p>
                    <p className="text-xs mt-1">Enter a state to see relevant games</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
