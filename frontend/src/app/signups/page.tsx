'use client';

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import type { Signup } from '@/types';
import { useSignups } from '@/hooks/useSignups';
import { useSignupFilters } from '@/hooks/useSignupFilters';
import { Search, Eye, Check, X, Loader2 } from 'lucide-react';
import { SignupDetailModal } from '@/components/signups';

export default function SignupsPage() {
  const { signups, loading, validate, getAmbassadorName, getOperatorName } = useSignups();
  const {
    filterType, setFilterType,
    selectedMonth, setSelectedMonth,
    selectedWeek, setSelectedWeek,
    monthOptions, weekOptions,
    filters, setSearch, setStatusFilter,
    filteredSignups,
  } = useSignupFilters(signups);

  const [selectedSignup, setSelectedSignup] = useState<Signup | null>(null);

  // Compute stats from filtered signups
  const stats = {
    total: filteredSignups.length,
    validated: filteredSignups.filter(s => s.validationStatus === 'validated').length,
    revenue: filteredSignups.reduce((sum, s) => sum + Number(s.cpaAmount || 0), 0),
  };

  const handleValidate = async (id: string, status: 'validated' | 'rejected') => {
    try {
      await validate(id, status);
      setSelectedSignup(null);
    } catch (error) {
      console.error('Failed to validate signup:', error);
    }
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Sign-ups</h1>
          <p className="text-gray-500 text-sm mt-1">All customer sign-ups and conversions</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-xl border border-gray-200 bg-white overflow-hidden">
            <button
              onClick={() => setFilterType('month')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                filterType === 'month' ? 'bg-[#22C55E] text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Month
            </button>
            <button
              onClick={() => setFilterType('week')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                filterType === 'week' ? 'bg-[#22C55E] text-white' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              Week
            </button>
          </div>

          {filterType === 'month' ? (
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700"
            >
              {monthOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          ) : (
            <select
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(e.target.value)}
              className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700"
            >
              {weekOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
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
            value={filters.search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 bg-white text-sm"
          />
        </div>
        <select
          value={filters.status}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700"
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
          <div className="p-12 text-center text-gray-400">No sign-ups found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ambassador</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Operator</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">CPA</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredSignups.map((signup) => (
                  <tr key={signup.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900 text-sm">
                        {signup.customerFirstName} {signup.customerLastName}
                      </div>
                      <div className="text-xs text-gray-400">{signup.customerEmail || signup.customerPhone || 'No contact'}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {getAmbassadorName(signup) || (
                        <span className="text-amber-500 text-xs font-medium px-2 py-1 bg-amber-50 rounded-full">Unassigned</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">{getOperatorName(signup)}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-[#22C55E]">${signup.cpaAmount || '—'}</td>
                    <td className="px-6 py-4">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                        signup.validationStatus === 'validated' ? 'bg-green-50 text-green-600' :
                        signup.validationStatus === 'rejected' ? 'bg-red-50 text-red-600' :
                        'bg-yellow-50 text-yellow-600'
                      }`}>
                        {signup.validationStatus}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {signup.submittedAt ? format(parseISO(signup.submittedAt), 'MMM d, yyyy') : '—'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setSelectedSignup(signup)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                          <Eye className="h-4 w-4" />
                        </button>
                        {signup.validationStatus === 'pending' && (
                          <>
                            <button onClick={() => handleValidate(signup.id, 'validated')} className="p-2 text-green-500 hover:bg-green-50 rounded-lg">
                              <Check className="h-4 w-4" />
                            </button>
                            <button onClick={() => handleValidate(signup.id, 'rejected')} className="p-2 text-red-500 hover:bg-red-50 rounded-lg">
                              <X className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
