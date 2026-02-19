'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, X, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import type { Ambassador, EventStatus, CompensationType } from '@/types';
import { ambassadorsApi } from '@/lib/api';

export interface EventFilters {
  search: string;
  status: EventStatus | '';
  location: string;
  ambassadorId: string;
  startDate: string;
  endDate: string;
  compensationType: CompensationType | '';
}

interface EventFiltersProps {
  filters: EventFilters;
  onFiltersChange: (filters: EventFilters) => void;
  locations: string[];
}

const STATUS_OPTIONS: { value: EventStatus | ''; label: string; color: string }[] = [
  { value: '', label: 'All Statuses', color: '' },
  { value: 'planned', label: 'Planned', color: 'bg-gray-100 text-gray-700' },
  { value: 'confirmed', label: 'Confirmed', color: 'bg-blue-100 text-blue-700' },
  { value: 'active', label: 'Active', color: 'bg-green-100 text-green-700' },
  { value: 'completed', label: 'Completed', color: 'bg-purple-100 text-purple-700' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-red-100 text-red-700' },
];

const COMPENSATION_OPTIONS: { value: CompensationType | ''; label: string }[] = [
  { value: '', label: 'All Compensation' },
  { value: 'per_signup', label: 'Per Sign-up' },
  { value: 'hourly', label: 'Hourly' },
  { value: 'hybrid', label: 'Hybrid' },
];

export function EventFiltersComponent({ filters, onFiltersChange, locations }: EventFiltersProps) {
  const [ambassadors, setAmbassadors] = useState<Ambassador[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loadingAmbassadors, setLoadingAmbassadors] = useState(false);

  // Load ambassadors for filter
  useEffect(() => {
    const loadAmbassadors = async () => {
      setLoadingAmbassadors(true);
      try {
        const res = await ambassadorsApi.list({ status: 'active' });
        setAmbassadors(res.data || []);
      } catch (error) {
        console.error('Failed to load ambassadors:', error);
      } finally {
        setLoadingAmbassadors(false);
      }
    };
    loadAmbassadors();
  }, []);

  const handleChange = (field: keyof EventFilters, value: string) => {
    onFiltersChange({ ...filters, [field]: value });
  };

  const clearFilters = () => {
    onFiltersChange({
      search: '',
      status: '',
      location: '',
      ambassadorId: '',
      startDate: '',
      endDate: '',
      compensationType: '',
    });
  };

  const activeFilterCount = [
    filters.status,
    filters.location,
    filters.ambassadorId,
    filters.startDate,
    filters.endDate,
    filters.compensationType,
  ].filter(Boolean).length;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4 space-y-4">
      {/* Search Bar - Always Visible */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search events by name, venue, or city..."
            value={filters.search}
            onChange={(e) => handleChange('search', e.target.value)}
            className="pl-10"
          />
        </div>
        <Button
          variant="outline"
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2"
        >
          <Filter className="h-4 w-4" />
          Filters
          {activeFilterCount > 0 && (
            <Badge className="bg-blue-500 text-white ml-1">{activeFilterCount}</Badge>
          )}
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
        {(activeFilterCount > 0 || filters.search) && (
          <Button variant="ghost" onClick={clearFilters} className="text-gray-500">
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Expanded Filters */}
      {expanded && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 pt-4 border-t border-gray-100">
          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={filters.status}
              onChange={(e) => handleChange('status', e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Location Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <select
              value={filters.location}
              onChange={(e) => handleChange('location', e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Locations</option>
              {locations.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </div>

          {/* Ambassador Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ambassador</label>
            <select
              value={filters.ambassadorId}
              onChange={(e) => handleChange('ambassadorId', e.target.value)}
              disabled={loadingAmbassadors}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <option value="">All Ambassadors</option>
              {ambassadors.map((amb) => (
                <option key={amb.id} value={amb.id}>
                  {amb.firstName} {amb.lastName}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range - Start */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
            <Input
              type="date"
              value={filters.startDate}
              onChange={(e) => handleChange('startDate', e.target.value)}
            />
          </div>

          {/* Date Range - End */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
            <Input
              type="date"
              value={filters.endDate}
              onChange={(e) => handleChange('endDate', e.target.value)}
            />
          </div>

          {/* Compensation Type Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Compensation</label>
            <select
              value={filters.compensationType}
              onChange={(e) => handleChange('compensationType', e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {COMPENSATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Active Filters Tags */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2 pt-2">
          {filters.status && (
            <Badge variant="secondary" className="flex items-center gap-1">
              Status: {STATUS_OPTIONS.find((s) => s.value === filters.status)?.label}
              <button onClick={() => handleChange('status', '')}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.location && (
            <Badge variant="secondary" className="flex items-center gap-1">
              Location: {filters.location}
              <button onClick={() => handleChange('location', '')}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.ambassadorId && (
            <Badge variant="secondary" className="flex items-center gap-1">
              Ambassador:{' '}
              {ambassadors.find((a) => a.id === filters.ambassadorId)?.firstName || 'Selected'}
              <button onClick={() => handleChange('ambassadorId', '')}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.startDate && (
            <Badge variant="secondary" className="flex items-center gap-1">
              From: {filters.startDate}
              <button onClick={() => handleChange('startDate', '')}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.endDate && (
            <Badge variant="secondary" className="flex items-center gap-1">
              To: {filters.endDate}
              <button onClick={() => handleChange('endDate', '')}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.compensationType && (
            <Badge variant="secondary" className="flex items-center gap-1">
              Compensation:{' '}
              {COMPENSATION_OPTIONS.find((c) => c.value === filters.compensationType)?.label}
              <button onClick={() => handleChange('compensationType', '')}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

export const defaultFilters: EventFilters = {
  search: '',
  status: '',
  location: '',
  ambassadorId: '',
  startDate: '',
  endDate: '',
  compensationType: '',
};
