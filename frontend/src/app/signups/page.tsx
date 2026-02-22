'use client';

import { useEffect, useState, useCallback } from 'react';
import { format, subMonths, startOfMonth, parseISO, startOfWeek, endOfWeek, addWeeks, subWeeks } from 'date-fns';
import { signupsApi, eventsApi, ambassadorsApi, operatorsApi } from '@/lib/api';
import type { Signup, Event, Ambassador, Operator } from '@/types';
import { Search, Eye, Check, X, Loader2 } from 'lucide-react';
import { SignupDetailModal } from '@/components/signups';

function getMonthOptions() {
  const options = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const date = subMonths(startOfMonth(now), i);
    options.push({
      value: format(date, 'yyyy-MM'),
      label: format(date, 'MMMM yyyy'),
    });
  }
  return options;
}

function getWeekOptions() {
  const options = [];
  const now = new Date();
  // Get current week start (Monday)
  const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 });
  
  for (let i = 0; i < 12; i++) {
    const weekStart = subWeeks(currentWeekStart, i);
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    options.push({
      value: format(weekStart, 'yyyy-MM-dd'),
      label: `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d, yyyy')}`,
    });
  }
  return options;
}

export default function SignupsPage() {
  const [signups, setSignups] = useState<Signup[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [ambassadors, setAmbassadors] = useState<Ambassador[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<'month' | 'week'>('month');
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [selectedWeek, setSelectedWeek] = useState(format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedSignup, setSelectedSignup] = useState<Signup | null>(null);
  const [totalSignups, setTotalSignups] = useState(0);
  
  const monthOptions = getMonthOptions();
  const weekOptions = getWeekOptions();

  // Calculate date range based on filter type
  const getDateRange = useCallback(() => {
    if (filterType === 'week') {
      const weekStart = parseISO(selectedWeek);
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      return {
        startDate: format(weekStart, 'yyyy-MM-dd'),
        endDate: format(weekEnd, 'yyyy-MM-dd'),
      };
    } else {
      const [year, month] = selectedMonth.split('-').map(Number);
      return {
        startDate: format(new Date(year, month - 1, 1), 'yyyy-MM-dd'),
        endDate: format(new Date(year, month, 0), 'yyyy-MM-dd'),
      };
    }
  }, [filterType, selectedMonth, selectedWeek]);

  // Load signups
  const loadSignups = useCallback(async () => {
    setLoading(true);
    try {
      const { startDate, endDate } = getDateRange();
      
      // Try with date filter first, fallback to no filter if it fails
      let response;
      try {
        response = await signupsApi.list({
          startDate,
          endDate,
          limit: 500,
        });
      } catch {
        // Fallback: load without date filter
        response = await signupsApi.list({ limit: 500 });
      }
      setSignups(response.data || []);
      setTotalSignups(response.meta?.total || response.data?.length || 0);
    } catch (error) {
      console.error('Failed to load signups:', error);
    } finally {
      setLoading(false);
    }
  }, [getDateRange]);

  // Load reference data
  const loadReferenceData = useCallback(async () => {
    try {
      const [eventsRes, ambassadorsRes, operatorsRes] = await Promise.all([
        eventsApi.list(),
        ambassadorsApi.list(),
        operatorsApi.list(),
      ]);
      setEvents(eventsRes.data || []);
      setAmbassadors(ambassadorsRes.data || []);
      setOperators(operatorsRes.data || []);
    } catch (error) {
      console.error('Failed to load reference data:', error);
    }
  }, []);

  useEffect(() => {
    loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    loadSignups();
  }, [loadSignups]);

  // Filter signups
  const filteredSignups = signups.filter(signup => {
    // Date filter (client-side fallback when backend filter fails)
    if (signup.submittedAt) {
      const { startDate, endDate } = getDateRange();
      const signupDate = signup.submittedAt.split('T')[0];
      if (signupDate < startDate || signupDate > endDate) {
        return false;
      }
    }
    
    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      const name = `${signup.customerFirstName || ''} ${signup.customerLastName || ''}`.toLowerCase();
      const email = (signup.customerEmail || '').toLowerCase();
      const ambassadorName = signup.ambassador 
        ? `${signup.ambassador.firstName} ${signup.ambassador.lastName}`.toLowerCase()
        : '';
      if (!name.includes(searchLower) && !email.includes(searchLower) && !ambassadorName.includes(searchLower)) {
        return false;
      }
    }
    
    // Status filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'pending' && signup.validationStatus !== 'pending') return false;
      if (statusFilter === 'validated' && signup.validationStatus !== 'validated') return false;
      if (statusFilter === 'rejected' && signup.validationStatus !== 'rejected') return false;
    }
    
    return true;
  });

  // Compute stats
  const stats = {
    total: filteredSignups.length,
    validated: filteredSignups.filter(s => s.validationStatus === 'validated').length,
    revenue: filteredSignups.reduce((sum, s) => sum + Number(s.cpaAmount || 0), 0),
  };

  // Action handlers
  const handleValidate = async (id: string, status: 'validated' | 'rejected') => {
    try {
      await signupsApi.validate(id, status);
      loadSignups();
      setSelectedSignup(null);
    } catch (error) {
      console.error('Failed to validate signup:', error);
    }
  };

  // Get ambassador name helper
  const getAmbassadorName = (signup: Signup) => {
    if (signup.ambassador) {
      return `${signup.ambassador.firstName} ${signup.ambassador.lastName}`;
    }
    // Fallback: try to find in ambassadors list
    const ambassador = ambassadors.find(a => a.id === signup.ambassadorId);
    if (ambassador) {
      return `${ambassador.firstName} ${ambassador.lastName}`;
    }
    return null;
  };

  // Get operator name helper
  const getOperatorName = (signup: Signup) => {
    if (signup.operatorName) return signup.operatorName;
    const operator = operators.find(o => o.id === String(signup.operatorId));
    return operator?.name || `Operator #${signup.operatorId}`;
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Sign-ups</h1>
          <p className="text-gray-500 text-sm mt-1">
            All customer sign-ups and conversions
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Filter Type Toggle */}
          <div className="flex rounded-xl border border-gray-200 bg-white overflow-hidden">
            <button
              onClick={() => setFilterType('month')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                filterType === 'month' 
                  ? 'bg-[#22C55E] text-white' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setFilterType('week')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                filterType === 'week' 
                  ? 'bg-[#22C55E] text-white' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Week
            </button>
          </div>
          
          {/* Date Selector */}
          {filterType === 'month' ? (
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#22C55E] focus:border-transparent"
            >
              {monthOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <select
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(e.target.value)}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#22C55E] focus:border-transparent"
            >
              {weekOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="text-2xl font-semibold text-gray-900">{stats.total}</div>
          <div className="text-sm text-gray-500">Total Sign-ups</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="text-2xl font-semibold text-gray-900">{stats.validated}</div>
          <div className="text-sm text-gray-500">Validated</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <div className="text-2xl font-semibold text-[#22C55E]">${stats.revenue.toLocaleString()}</div>
          <div className="text-sm text-gray-500">Revenue</div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Search by name, email, or ambassador..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#22C55E] focus:border-transparent"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#22C55E] focus:border-transparent"
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="validated">Validated</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center text-gray-400">
            <Loader2 className="h-8 w-8 animate-spin mb-2" />
            <span>Loading sign-ups...</span>
          </div>
        ) : filteredSignups.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            No sign-ups found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ambassador
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Operator
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    CPA
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Extraction
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredSignups.map((signup) => {
                  const ambassadorName = getAmbassadorName(signup);
                  const operatorName = getOperatorName(signup);
                  
                  return (
                    <tr key={signup.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900 text-sm">
                          {signup.customerFirstName} {signup.customerLastName}
                        </div>
                        <div className="text-xs text-gray-400">
                          {signup.customerEmail || signup.customerPhone || 'No contact'}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {ambassadorName || (
                          <span className="text-amber-500 text-xs font-medium px-2 py-1 bg-amber-50 rounded-full">
                            Unassigned
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {operatorName}
                      </td>
                      <td className="px-6 py-4 text-sm font-semibold text-[#22C55E]">
                        ${signup.cpaAmount || '—'}
                      </td>
                      <td className="px-6 py-4">
                        {signup.extractionStatus && (
                          <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                            signup.extractionStatus === 'confirmed' || signup.extractionStatus === 'completed'
                              ? 'bg-green-50 text-green-600'
                              : signup.extractionStatus === 'pending'
                              ? 'bg-yellow-50 text-yellow-600'
                              : signup.extractionStatus === 'failed'
                              ? 'bg-red-50 text-red-600'
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {signup.extractionStatus}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                          signup.validationStatus === 'validated' 
                            ? 'bg-green-50 text-green-600'
                            : signup.validationStatus === 'rejected'
                            ? 'bg-red-50 text-red-600'
                            : signup.validationStatus === 'pending'
                            ? 'bg-yellow-50 text-yellow-600'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {signup.validationStatus}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {signup.submittedAt 
                          ? format(parseISO(signup.submittedAt), 'MMM d, yyyy')
                          : '—'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => setSelectedSignup(signup)}
                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {signup.validationStatus === 'pending' && (
                            <>
                              <button
                                onClick={() => handleValidate(signup.id, 'validated')}
                                className="p-2 text-green-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleValidate(signup.id, 'rejected')}
                                className="p-2 text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Signup Detail Modal */}
      {selectedSignup && (
        <SignupDetailModal
          signup={selectedSignup}
          open={!!selectedSignup}
          onClose={() => setSelectedSignup(null)}
          onValidate={handleValidate}
        />
      )}
    </div>
  );
}
