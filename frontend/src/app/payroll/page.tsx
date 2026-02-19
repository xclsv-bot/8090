'use client';

import { useEffect, useState, useMemo } from 'react';
import { payrollApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { 
  DollarSign, 
  Calendar, 
  Users,
  Search,
  Download,
  RefreshCw,
  Filter,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface PayrollEntry {
  id: string;
  ambassadorName: string;
  ambassadorId: string | null;
  eventName: string | null;
  eventId: string | null;
  workDate: string;
  scheduledHours: number | null;
  hoursWorked: number | null;
  solos: number;
  bonus: string;
  reimbursements: string;
  other: string;
  total: string;
  status: string;
  payDate: string | null;
  notes: string | null;
  source: string;
  importId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PayrollSummary {
  totalEntries: number;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  uniqueAmbassadors: number;
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

const PAGE_SIZE = 50;

export default function PayrollPage() {
  const [entries, setEntries] = useState<PayrollEntry[]>([]);
  const [summary, setSummary] = useState<PayrollSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [searchAmbassador, setSearchAmbassador] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Pagination
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  async function loadData() {
    setLoading(true);
    setError(null);
    
    try {
      // Build query params
      const params: Record<string, string> = {
        limit: String(PAGE_SIZE),
        offset: String((page - 1) * PAGE_SIZE),
      };
      
      if (searchAmbassador) params.ambassador = searchAmbassador;
      if (statusFilter && statusFilter !== 'all') params.status = statusFilter;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      
      const [entriesRes, summaryRes] = await Promise.all([
        payrollApi.listEntries(params),
        payrollApi.getEntriesSummary(),
      ]);
      
      setEntries(entriesRes.data?.entries || []);
      setTotal(entriesRes.data?.total || 0);
      setSummary(summaryRes.data || null);
    } catch (err: any) {
      console.error('Failed to load payroll data:', err);
      setError(err.message || 'Failed to load payroll data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [page, statusFilter, startDate, endDate]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      loadData();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchAmbassador]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Get unique ambassadors for display
  const ambassadorList = useMemo(() => {
    const names = new Set(entries.map(e => e.ambassadorName));
    return Array.from(names).sort();
  }, [entries]);

  function handleExport() {
    // TODO: Implement export
    alert('Export functionality coming soon');
  }

  function clearFilters() {
    setSearchAmbassador('');
    setStatusFilter('all');
    setStartDate('');
    setEndDate('');
    setPage(1);
  }

  const hasFilters = searchAmbassador || statusFilter !== 'all' || startDate || endDate;

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Payroll</h1>
          <p className="text-gray-600">View and manage all payroll entries</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadData} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      {summary && (
        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-blue-100 p-2">
                <DollarSign className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Entries</p>
                <p className="text-2xl font-bold">{summary.totalEntries.toLocaleString()}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-green-100 p-2">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Amount</p>
                <p className="text-2xl font-bold">${summary.totalAmount.toLocaleString()}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-emerald-100 p-2">
                <DollarSign className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Paid</p>
                <p className="text-2xl font-bold">${summary.paidAmount.toLocaleString()}</p>
              </div>
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-purple-100 p-2">
                <Users className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Ambassadors</p>
                <p className="text-2xl font-bold">{summary.uniqueAmbassadors}</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card className="mb-6 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">Filters:</span>
          </div>
          
          <div className="relative flex-1 min-w-[200px] max-w-[300px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search ambassador..."
              value={searchAmbassador}
              onChange={(e) => setSearchAmbassador(e.target.value)}
              className="pl-9"
            />
          </div>
          
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 w-[140px] rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="paid">Paid</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-400" />
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-[140px]"
              placeholder="Start date"
            />
            <span className="text-gray-400">to</span>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-[140px]"
              placeholder="End date"
            />
          </div>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      </Card>

      {/* Error State */}
      {error && (
        <Card className="mb-6 border-red-200 bg-red-50 p-4">
          <p className="text-red-700">{error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={loadData}>
            Retry
          </Button>
        </Card>
      )}

      {/* Data Table */}
      <Card>
        {loading && entries.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <RefreshCw className="mx-auto h-8 w-8 animate-spin text-gray-300" />
            <p className="mt-2">Loading payroll data...</p>
          </div>
        ) : entries.length === 0 ? (
          <div className="p-8 text-center">
            <DollarSign className="mx-auto h-12 w-12 text-gray-300" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">No payroll entries</h3>
            <p className="mt-1 text-gray-500">
              {hasFilters 
                ? 'No entries match your filters. Try adjusting them.' 
                : 'Import payroll data from Settings → Historical Data Import'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Ambassador</TableHead>
                    <TableHead>Event/Description</TableHead>
                    <TableHead className="text-right">Hours</TableHead>
                    <TableHead className="text-right">Solos</TableHead>
                    <TableHead className="text-right">Bonus</TableHead>
                    <TableHead className="text-right">Other</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Pay Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap">
                        {new Date(entry.workDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="font-medium">{entry.ambassadorName}</TableCell>
                      <TableCell className="max-w-[200px] truncate" title={entry.eventName || '-'}>
                        {entry.eventName || '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {entry.hoursWorked || entry.scheduledHours || '-'}
                      </TableCell>
                      <TableCell className="text-right">{entry.solos || 0}</TableCell>
                      <TableCell className="text-right font-mono">
                        ${parseFloat(entry.bonus || '0').toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        ${parseFloat(entry.other || '0').toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold">
                        ${parseFloat(entry.total || '0').toFixed(2)}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[entry.status] || 'bg-gray-100 text-gray-700'}>
                          {entry.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {entry.payDate ? new Date(entry.payDate).toLocaleDateString() : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between border-t px-4 py-3">
              <p className="text-sm text-gray-500">
                Showing {((page - 1) * PAGE_SIZE) + 1} to {Math.min(page * PAGE_SIZE, total)} of {total} entries
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="px-2 text-sm text-gray-600">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
