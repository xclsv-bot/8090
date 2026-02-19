'use client';

import React, { useState, useMemo } from 'react';
import type { 
  ReconcileResponse, 
  AmbiguousMatch, 
  ReconciliationUpdate, 
  MatchSelection 
} from '@/types/import';
import { cn, getConfidenceColor } from '@/lib/utils';

interface ReconciliationReviewProps {
  response: ReconcileResponse;
  updates: Map<string, ReconciliationUpdate>;
  onUpdate: (matchId: string, update: ReconciliationUpdate) => void;
  onContinue: () => void;
  onBack: () => void;
}

export function ReconciliationReview({
  response,
  updates,
  onUpdate,
  onContinue,
  onBack,
}: ReconciliationReviewProps) {
  const [activeTab, setActiveTab] = useState<'summary' | 'ambiguous'>('summary');
  const [expandedMatch, setExpandedMatch] = useState<string | null>(null);

  const {
    new_ambassadors,
    new_events,
    new_operators,
    new_venues,
    linked_records,
    ambiguous_matches,
  } = response;

  const unresolvedCount = useMemo(() => {
    return ambiguous_matches.filter(m => !updates.has(m.id) && !m.user_selection).length;
  }, [ambiguous_matches, updates]);

  const canContinue = unresolvedCount === 0;

  const handleSelection = (match: AmbiguousMatch, selection: MatchSelection, candidateId?: string) => {
    onUpdate(match.id, {
      ambiguous_match_id: match.id,
      user_selection: selection,
      selected_candidate_id: candidateId,
    });
  };

  const getMatchResolution = (match: AmbiguousMatch) => {
    return updates.get(match.id) || (match.user_selection ? {
      ambiguous_match_id: match.id,
      user_selection: match.user_selection,
      selected_candidate_id: match.selected_candidate_id,
    } : null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Reconciliation Review</h2>
        <p className="mt-1 text-sm text-gray-500">
          Review how records will be matched to existing data
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <SummaryCard label="New Ambassadors" value={new_ambassadors} color="purple" />
        <SummaryCard label="New Events" value={new_events} color="orange" />
        <SummaryCard label="New Operators" value={new_operators} color="blue" />
        <SummaryCard label="New Venues" value={new_venues} color="teal" />
        <SummaryCard label="Linked Records" value={linked_records} color="green" />
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-8">
          <button
            onClick={() => setActiveTab('summary')}
            className={cn(
              'border-b-2 pb-3 text-sm font-medium transition-colors',
              activeTab === 'summary'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            Summary
          </button>
          <button
            onClick={() => setActiveTab('ambiguous')}
            className={cn(
              'border-b-2 pb-3 text-sm font-medium transition-colors',
              activeTab === 'ambiguous'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            )}
          >
            Ambiguous Matches
            {unresolvedCount > 0 && (
              <span className="ml-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                {unresolvedCount} to resolve
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'summary' ? (
        <div className="space-y-6">
          {/* New Entities Summary */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h3 className="font-semibold text-gray-900">New Entities to Create</h3>
            <p className="mt-1 text-sm text-gray-500">
              These records don't match any existing data and will be created as new entities
            </p>
            
            <div className="mt-4 space-y-3">
              {new_ambassadors > 0 && (
                <EntityRow
                  icon="👤"
                  label="Ambassadors"
                  count={new_ambassadors}
                  description="New ambassador profiles will be created"
                />
              )}
              {new_events > 0 && (
                <EntityRow
                  icon="📅"
                  label="Events"
                  count={new_events}
                  description="New events will be added to the system"
                />
              )}
              {new_operators > 0 && (
                <EntityRow
                  icon="🏢"
                  label="Operators"
                  count={new_operators}
                  description="New operator organizations will be created"
                />
              )}
              {new_venues > 0 && (
                <EntityRow
                  icon="📍"
                  label="Venues"
                  count={new_venues}
                  description="New venue locations will be added"
                />
              )}
              {new_ambassadors + new_events + new_operators + new_venues === 0 && (
                <p className="text-sm text-gray-500">All records matched existing entities</p>
              )}
            </div>
          </div>

          {/* Linked Records Summary */}
          <div className="rounded-xl border border-green-200 bg-green-50 p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-green-900">
                  {linked_records.toLocaleString()} Records Matched
                </h3>
                <p className="text-sm text-green-700">
                  These records were automatically linked to existing entities with high confidence
                </p>
              </div>
            </div>
          </div>

          {/* Ambiguous Notice */}
          {ambiguous_matches.length > 0 && (
            <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-6">
              <div className="flex items-start gap-3">
                <svg className="h-6 w-6 flex-shrink-0 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <h3 className="font-semibold text-yellow-900">
                    {ambiguous_matches.length} Ambiguous Matches Need Review
                  </h3>
                  <p className="mt-1 text-sm text-yellow-700">
                    Some records have multiple possible matches. Please review the "Ambiguous Matches" 
                    tab to resolve them before continuing.
                  </p>
                  <button
                    onClick={() => setActiveTab('ambiguous')}
                    className="mt-3 text-sm font-medium text-yellow-800 hover:text-yellow-900"
                  >
                    Review Ambiguous Matches →
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {ambiguous_matches.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 text-center">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="mt-4 font-medium text-gray-900">No Ambiguous Matches</h3>
              <p className="mt-1 text-sm text-gray-500">
                All records were matched with high confidence
              </p>
            </div>
          ) : (
            ambiguous_matches.map((match) => {
              const resolution = getMatchResolution(match);
              const isExpanded = expandedMatch === match.id;
              
              return (
                <div
                  key={match.id}
                  className={cn(
                    'rounded-xl border bg-white transition-all',
                    resolution ? 'border-green-200' : 'border-yellow-200'
                  )}
                >
                  <button
                    onClick={() => setExpandedMatch(isExpanded ? null : match.id)}
                    className="flex w-full items-center justify-between p-4 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-full text-sm',
                        resolution ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                      )}>
                        {resolution ? '✓' : '?'}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          "{match.import_value}"
                        </p>
                        <p className="text-sm text-gray-500">
                          Row {match.import_row} • {match.field_type} • {match.candidate_matches.length} possible matches
                        </p>
                      </div>
                    </div>
                    <svg
                      className={cn(
                        'h-5 w-5 text-gray-400 transition-transform',
                        isExpanded && 'rotate-180'
                      )}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-100 p-4">
                      <p className="mb-3 text-sm font-medium text-gray-700">
                        Select how to handle this match:
                      </p>
                      
                      <div className="space-y-2">
                        {/* Candidate matches */}
                        {match.candidate_matches.map((candidate) => (
                          <button
                            key={candidate.entity_id}
                            onClick={() => handleSelection(match, 'use_candidate', candidate.entity_id)}
                            className={cn(
                              'flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors',
                              resolution?.selected_candidate_id === candidate.entity_id
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                'h-4 w-4 rounded-full border-2',
                                resolution?.selected_candidate_id === candidate.entity_id
                                  ? 'border-blue-500 bg-blue-500'
                                  : 'border-gray-300'
                              )} />
                              <div>
                                <p className="font-medium text-gray-900">{candidate.entity_name}</p>
                                <p className="text-xs text-gray-500">
                                  {candidate.entity_type} • ID: {candidate.entity_id}
                                </p>
                              </div>
                            </div>
                            <span className={cn(
                              'text-sm font-medium',
                              getConfidenceColor(candidate.similarity_score)
                            )}>
                              {candidate.similarity_score}% match
                            </span>
                          </button>
                        ))}

                        {/* Create new option */}
                        <button
                          onClick={() => handleSelection(match, 'create_new')}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                            resolution?.user_selection === 'create_new'
                              ? 'border-green-500 bg-green-50'
                              : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                          )}
                        >
                          <div className={cn(
                            'h-4 w-4 rounded-full border-2',
                            resolution?.user_selection === 'create_new'
                              ? 'border-green-500 bg-green-500'
                              : 'border-gray-300'
                          )} />
                          <div>
                            <p className="font-medium text-gray-900">Create New {match.field_type}</p>
                            <p className="text-xs text-gray-500">
                              This is a new {match.field_type}, not any of the above
                            </p>
                          </div>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        
        <button
          onClick={onContinue}
          disabled={!canContinue}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {canContinue ? 'Continue to Confirmation' : `Resolve ${unresolvedCount} Matches`}
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}

interface SummaryCardProps {
  label: string;
  value: number;
  color: 'purple' | 'orange' | 'blue' | 'teal' | 'green';
}

function SummaryCard({ label, value, color }: SummaryCardProps) {
  const colorClasses = {
    purple: 'border-purple-200 bg-purple-50 text-purple-700',
    orange: 'border-orange-200 bg-orange-50 text-orange-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    teal: 'border-teal-200 bg-teal-50 text-teal-700',
    green: 'border-green-200 bg-green-50 text-green-700',
  };

  return (
    <div className={cn('rounded-xl border p-4 text-center', colorClasses[color])}>
      <p className="text-3xl font-bold">{value}</p>
      <p className="mt-1 text-sm font-medium">{label}</p>
    </div>
  );
}

interface EntityRowProps {
  icon: string;
  label: string;
  count: number;
  description: string;
}

function EntityRow({ icon, label, count, description }: EntityRowProps) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
      <div className="flex items-center gap-3">
        <span className="text-xl">{icon}</span>
        <div>
          <p className="font-medium text-gray-900">{label}</p>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
      </div>
      <span className="text-lg font-bold text-gray-900">+{count}</span>
    </div>
  );
}

export default ReconciliationReview;
