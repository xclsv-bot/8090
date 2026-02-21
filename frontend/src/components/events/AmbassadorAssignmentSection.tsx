'use client';

import { useState, useEffect } from 'react';
import { assignmentsApi, ambassadorsApi } from '@/lib/api';
import type { EventAssignment, SuggestedAmbassador } from '@/lib/api';
import type { Ambassador } from '@/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Users, Plus, X, AlertTriangle, Star, Search, Loader2 } from 'lucide-react';

interface AmbassadorAssignmentSectionProps {
  eventId: string;
  eventRegion?: string;
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-700',
  completed: 'bg-purple-100 text-purple-700',
};

const skillLevelColors: Record<string, string> = {
  top_performer: 'bg-purple-100 text-purple-700',
  outstanding: 'bg-blue-100 text-blue-700',
  good: 'bg-green-100 text-green-700',
  okay: 'bg-yellow-100 text-yellow-700',
  not_a_good_fit: 'bg-red-100 text-red-700',
};

export function AmbassadorAssignmentSection({ eventId, eventRegion }: AmbassadorAssignmentSectionProps) {
  const [assignments, setAssignments] = useState<EventAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [suggestions, setSuggestions] = useState<SuggestedAmbassador[]>([]);
  const [allAmbassadors, setAllAmbassadors] = useState<Ambassador[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);

  useEffect(() => {
    loadAssignments();
  }, [eventId]);

  async function loadAssignments() {
    try {
      const res = await assignmentsApi.getByEvent(eventId);
      setAssignments(res.data || []);
    } catch (error) {
      console.error('Failed to load assignments:', error);
    } finally {
      setLoading(false);
    }
  }

  async function openAddModal() {
    setShowAddModal(true);
    setLoadingSuggestions(true);
    
    try {
      // Load suggestions and all ambassadors in parallel
      const [suggestRes, ambassadorsRes] = await Promise.all([
        assignmentsApi.suggest(eventId, 10).catch(() => ({ data: [] })),
        ambassadorsApi.list({ limit: 200 }),
      ]);
      setSuggestions(suggestRes.data || []);
      setAllAmbassadors(ambassadorsRes.data || []);
    } catch (error) {
      console.error('Failed to load suggestions:', error);
    } finally {
      setLoadingSuggestions(false);
    }
  }

  async function assignAmbassador(ambassadorId: string) {
    setAssigning(ambassadorId);
    try {
      await assignmentsApi.create({ eventId, ambassadorId });
      await loadAssignments();
      // Remove from suggestions
      setSuggestions(prev => prev.filter(s => s.ambassador.id !== ambassadorId));
    } catch (error: any) {
      console.error('Failed to assign:', error);
      alert(error.message || 'Failed to assign ambassador');
    } finally {
      setAssigning(null);
    }
  }

  async function removeAssignment(assignmentId: string) {
    if (!confirm('Remove this ambassador from the event?')) return;
    
    try {
      await assignmentsApi.remove(assignmentId);
      setAssignments(prev => prev.filter(a => a.id !== assignmentId));
    } catch (error) {
      console.error('Failed to remove:', error);
    }
  }

  // Filter ambassadors by search and exclude already assigned
  const assignedIds = new Set(assignments.map(a => a.ambassadorId));
  const filteredAmbassadors = allAmbassadors.filter(amb => {
    if (assignedIds.has(amb.id)) return false;
    if (!searchQuery) return false; // Only show when searching
    const query = searchQuery.toLowerCase();
    return `${amb.firstName} ${amb.lastName}`?.toLowerCase().includes(query) || 
           amb.email?.toLowerCase().includes(query);
  });

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team ({assignments.length})
          </h3>
          <Button onClick={openAddModal} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>

        {assignments.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">
            No ambassadors assigned yet
          </p>
        ) : (
          <div className="space-y-3">
            {assignments.map((assignment) => (
              <div key={assignment.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-sm">
                    {assignment.ambassador?.name || 'Unknown'}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge className={statusColors[assignment.status] || 'bg-gray-100'}>
                      {assignment.status}
                    </Badge>
                    {assignment.ambassador?.skillLevel && (
                      <Badge variant="outline" className="text-xs">
                        {assignment.ambassador.skillLevel.replace('_', ' ')}
                      </Badge>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeAssignment(assignment.id)}
                >
                  <X className="h-4 w-4 text-gray-400" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Add Ambassador Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Ambassador</DialogTitle>
          </DialogHeader>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {loadingSuggestions ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <>
              {/* Suggestions */}
              {suggestions.length > 0 && !searchQuery && (
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-2 flex items-center gap-1">
                    <Star className="h-4 w-4" />
                    Suggested
                  </h4>
                  <div className="space-y-2">
                    {suggestions.filter(s => !assignedIds.has(s.ambassador.id)).slice(0, 5).map((suggestion) => (
                      <div
                        key={suggestion.ambassador.id}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">{suggestion.`${ambassador.firstName} ${ambassador.lastName}`}</p>
                            {suggestion.hasConflict && (
                              <AlertTriangle className="h-4 w-4 text-yellow-500" title={suggestion.conflictDetails} />
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            {suggestion.ambassador.skillLevel && (
                              <Badge className={skillLevelColors[suggestion.ambassador.skillLevel] || 'bg-gray-100'} variant="outline">
                                {suggestion.ambassador.skillLevel.replace('_', ' ')}
                              </Badge>
                            )}
                            <span className="text-xs text-gray-500">
                              Score: {suggestion.score}
                            </span>
                          </div>
                          {suggestion.reasons.length > 0 && (
                            <p className="text-xs text-gray-400 mt-1">
                              {suggestion.reasons.slice(0, 2).join(' • ')}
                            </p>
                          )}
                        </div>
                        <Button
                          size="sm"
                          onClick={() => assignAmbassador(suggestion.ambassador.id)}
                          disabled={assigning === suggestion.ambassador.id}
                        >
                          {assigning === suggestion.ambassador.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            'Assign'
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Search Results */}
              {searchQuery && (
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-2">
                    Search Results ({filteredAmbassadors.length})
                  </h4>
                  {filteredAmbassadors.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">
                      No ambassadors found
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {filteredAmbassadors.slice(0, 20).map((ambassador) => (
                        <div
                          key={ambassador.id}
                          className="flex items-center justify-between p-3 border rounded-lg"
                        >
                          <div>
                            <p className="font-medium text-sm">{`${ambassador.firstName} ${ambassador.lastName}`}</p>
                            <div className="flex items-center gap-2 mt-1">
                              {ambassador.skillLevel && (
                                <Badge className={skillLevelColors[ambassador.skillLevel] || 'bg-gray-100'} variant="outline">
                                  {ambassador.skillLevel.replace('_', ' ')}
                                </Badge>
                              )}
                              false && (
                                <span className="text-xs text-gray-500">{ambassador.homeRegion}</span>
                              )}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => assignAmbassador(ambassador.id)}
                            disabled={assigning === ambassador.id}
                          >
                            {assigning === ambassador.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              'Assign'
                            )}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {!searchQuery && suggestions.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">
                  Type to search for ambassadors
                </p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
