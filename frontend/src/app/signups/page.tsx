'use client';

import { useEffect, useState, useCallback } from 'react';
import { signupsApi, eventsApi, ambassadorsApi, operatorsApi } from '@/lib/api';
import type { 
  Signup, 
  Event, 
  Ambassador, 
  Operator, 
  ExtractionQueueItem,
  SyncFailure,
} from '@/types';
import { useWebSocket } from '@/hooks/useWebSocket';
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { 
  SignupDetailModal,
  ExtractionReviewQueue,
  SyncFailureQueue,
} from '@/components/signups';
import { 
  FileSignature, 
  Check, 
  X, 
  Search, 
  Eye,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  Users,
  Clock,
  Zap,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from 'lucide-react';

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  validated: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  duplicate: 'bg-gray-100 text-gray-700',
};

const extractionStatusColors: Record<string, string> = {
  pending: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  confirmed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  needs_review: 'bg-yellow-100 text-yellow-700',
  skipped: 'bg-gray-100 text-gray-700',
};

export default function SignupsPage() {
  // Core data
  const [signups, setSignups] = useState<Signup[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [ambassadors, setAmbassadors] = useState<Ambassador[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  
  // Extraction queue
  const [extractionQueue, setExtractionQueue] = useState<ExtractionQueueItem[]>([]);
  const [extractionTotal, setExtractionTotal] = useState(0);
  const [extractionPage, setExtractionPage] = useState(1);
  
  // Sync failures
  const [syncFailures, setSyncFailures] = useState<SyncFailure[]>([]);
  const [syncFailuresTotal, setSyncFailuresTotal] = useState(0);
  const [syncPage, setSyncPage] = useState(1);
  const [syncFilters, setSyncFilters] = useState<{ syncPhase?: string; errorType?: string }>({});
  
  // UI state
  const [loading, setLoading] = useState(true);
  const [loadingExtraction, setLoadingExtraction] = useState(false);
  const [loadingSync, setLoadingSync] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalSignups, setTotalSignups] = useState(0);
  const [filters, setFilters] = useState({
    validationStatus: '',
    extractionStatus: '',
    eventId: '',
    ambassadorId: '',
    operatorId: '',
    startDate: '',
    endDate: '',
  });
  const [selectedSignup, setSelectedSignup] = useState<Signup | null>(null);
  const [activeTab, setActiveTab] = useState('all');

  const pageSize = 50;

  // WebSocket for real-time updates
  const { subscribe, isConnected } = useWebSocket();

  // Load signups
  const loadSignups = useCallback(async () => {
    try {
      const params: Record<string, string> = {
        page: String(page),
        limit: String(pageSize),
      };
      if (filters.validationStatus) params.validationStatus = filters.validationStatus;
      if (filters.extractionStatus) params.extractionStatus = filters.extractionStatus;
      if (filters.eventId) params.eventId = filters.eventId;
      if (filters.ambassadorId) params.ambassadorId = filters.ambassadorId;
      if (filters.operatorId) params.operatorId = filters.operatorId;
      if (filters.startDate) params.startDate = filters.startDate;
      if (filters.endDate) params.endDate = filters.endDate;
      if (search) params.search = search;

      const response = await signupsApi.list(params);
      setSignups(response.data || []);
      setTotalSignups(response.meta?.total || 0);
    } catch (error) {
      console.error('Failed to load signups:', error);
    }
  }, [page, filters, search]);

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

  // Load extraction queue
  const loadExtractionQueue = useCallback(async () => {
    setLoadingExtraction(true);
    try {
      const response = await signupsApi.getExtractionQueue({
        page: extractionPage,
        pageSize: 20,
        sortBy: 'priority',
      });
      setExtractionQueue(response.data?.signups || []);
      setExtractionTotal(response.data?.totalPending || 0);
    } catch (error) {
      console.error('Failed to load extraction queue:', error);
    } finally {
      setLoadingExtraction(false);
    }
  }, [extractionPage]);

  // Load sync failures
  const loadSyncFailures = useCallback(async () => {
    setLoadingSync(true);
    try {
      const params: Record<string, string> = {
        limit: '20',
        offset: String((syncPage - 1) * 20),
      };
      if (syncFilters.syncPhase) params.syncPhase = syncFilters.syncPhase;
      if (syncFilters.errorType) params.errorType = syncFilters.errorType;

      const response = await signupsApi.getSyncFailures(params);
      setSyncFailures(response.data || []);
      setSyncFailuresTotal(response.meta?.total || 0);
    } catch (error) {
      console.error('Failed to load sync failures:', error);
    } finally {
      setLoadingSync(false);
    }
  }, [syncPage, syncFilters]);

  // Initial load
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([
        loadSignups(),
        loadReferenceData(),
        loadExtractionQueue(),
        loadSyncFailures(),
      ]);
      setLoading(false);
    };
    init();
  }, []);

  // Reload signups when filters change
  useEffect(() => {
    loadSignups();
  }, [loadSignups]);

  // Reload extraction queue when page changes
  useEffect(() => {
    if (activeTab === 'extraction') {
      loadExtractionQueue();
    }
  }, [extractionPage, activeTab, loadExtractionQueue]);

  // Reload sync failures when page/filters change
  useEffect(() => {
    if (activeTab === 'sync') {
      loadSyncFailures();
    }
  }, [syncPage, syncFilters, activeTab, loadSyncFailures]);

  // Subscribe to real-time sign-up events
  useEffect(() => {
    const unsubSubmit = subscribe('sign_up.submitted', () => {
      loadSignups();
      loadExtractionQueue();
    });
    const unsubValidate = subscribe('sign_up.validated', loadSignups);
    const unsubExtraction = subscribe('sign_up.extraction_confirmed', () => {
      loadSignups();
      loadExtractionQueue();
    });
    const unsubSkip = subscribe('sign_up.extraction_skipped', () => {
      loadSignups();
      loadExtractionQueue();
    });
    
    return () => {
      unsubSubmit();
      unsubValidate();
      unsubExtraction();
      unsubSkip();
    };
  }, [subscribe, loadSignups, loadExtractionQueue]);

  // Action handlers
  const handleValidate = useCallback(async (id: string, status: 'validated' | 'rejected') => {
    try {
      await signupsApi.validate(id, status);
      loadSignups();
      setSelectedSignup(null);
    } catch (error) {
      console.error('Failed to validate signup:', error);
    }
  }, [loadSignups]);

  const handleConfirmExtraction = useCallback(async (
    id: string, 
    corrections?: { betAmount?: number; teamBetOn?: string; odds?: string }
  ) => {
    await signupsApi.confirmExtraction(id, corrections);
    loadExtractionQueue();
    loadSignups();
  }, [loadExtractionQueue, loadSignups]);

  const handleSkipExtraction = useCallback(async (id: string, reason?: string) => {
    await signupsApi.skipExtraction(id, reason);
    loadExtractionQueue();
    loadSignups();
  }, [loadExtractionQueue, loadSignups]);

  const handleRetrySync = useCallback(async (id: string, syncPhase?: 'initial' | 'enriched') => {
    await signupsApi.retrySync(id, syncPhase);
    loadSyncFailures();
  }, [loadSyncFailures]);

  // Computed values
  const pendingCount = signups.filter(s => s.validationStatus === 'pending').length;
  const needsReviewCount = extractionTotal;
  const totalPages = Math.ceil(totalSignups / pageSize);

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Sign-up Management</h1>
          <p className="text-gray-600">Dashboard for customer registrations and validation</p>
        </div>
        <div className="flex gap-2 items-center">
          <Badge className={isConnected ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}>
            {isConnected ? "● Live" : "○ Offline"}
          </Badge>
          {needsReviewCount > 0 && (
            <Badge className="bg-yellow-100 text-yellow-700">
              {needsReviewCount} need review
            </Badge>
          )}
          {syncFailuresTotal > 0 && (
            <Badge className="bg-red-100 text-red-700">
              {syncFailuresTotal} sync failures
            </Badge>
          )}
        </div>
      </div>

      {/* Stats Dashboard */}
      <div className="mb-6 grid gap-4 md:grid-cols-5">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <FileSignature className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Sign-ups</p>
              <p className="text-2xl font-bold">{totalSignups}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <Clock className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Pending Validation</p>
              <p className="text-2xl font-bold text-yellow-600">{pendingCount}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Zap className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Needs Review</p>
              <p className="text-2xl font-bold text-orange-600">{needsReviewCount}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <AlertCircle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Sync Failures</p>
              <p className="text-2xl font-bold text-red-600">{syncFailuresTotal}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Today</p>
              <p className="text-2xl font-bold text-green-600">
                {signups.filter(s => {
                  const today = new Date().toDateString();
                  return new Date(s.submittedAt).toDateString() === today;
                }).length}
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6 p-4">
        <div className="flex flex-wrap gap-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              className="pl-10"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="rounded-md border px-3 py-2 text-sm"
            value={filters.validationStatus}
            onChange={(e) => setFilters({ ...filters, validationStatus: e.target.value })}
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="validated">Validated</option>
            <option value="rejected">Rejected</option>
            <option value="duplicate">Duplicate</option>
          </select>
          <select
            className="rounded-md border px-3 py-2 text-sm"
            value={filters.extractionStatus}
            onChange={(e) => setFilters({ ...filters, extractionStatus: e.target.value })}
          >
            <option value="">All Extraction</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="skipped">Skipped</option>
            <option value="failed">Failed</option>
          </select>
          <select
            className="rounded-md border px-3 py-2 text-sm"
            value={filters.eventId}
            onChange={(e) => setFilters({ ...filters, eventId: e.target.value })}
          >
            <option value="">All Events</option>
            {events.map(e => (
              <option key={e.id} value={e.id}>{e.title}</option>
            ))}
          </select>
          <select
            className="rounded-md border px-3 py-2 text-sm"
            value={filters.ambassadorId}
            onChange={(e) => setFilters({ ...filters, ambassadorId: e.target.value })}
          >
            <option value="">All Ambassadors</option>
            {ambassadors.map(a => (
              <option key={a.id} value={a.id}>{a.firstName} {a.lastName}</option>
            ))}
          </select>
          <select
            className="rounded-md border px-3 py-2 text-sm"
            value={filters.operatorId}
            onChange={(e) => setFilters({ ...filters, operatorId: e.target.value })}
          >
            <option value="">All Operators</option>
            {operators.map(o => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          <Input
            type="date"
            value={filters.startDate}
            onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
            className="w-auto"
          />
          <Input
            type="date"
            value={filters.endDate}
            onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
            className="w-auto"
          />
        </div>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">
            All Sign-ups
            <Badge variant="secondary" className="ml-2">{totalSignups}</Badge>
          </TabsTrigger>
          <TabsTrigger value="extraction">
            Extraction Review
            {needsReviewCount > 0 && (
              <Badge className="ml-2 bg-yellow-100 text-yellow-700">{needsReviewCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="sync">
            Sync Failures
            {syncFailuresTotal > 0 && (
              <Badge className="ml-2 bg-red-100 text-red-700">{syncFailuresTotal}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* All Sign-ups Tab */}
        <TabsContent value="all">
          <Card>
            {loading ? (
              <div className="p-8 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : signups.length === 0 ? (
              <div className="p-8 text-center">
                <FileSignature className="mx-auto h-12 w-12 text-gray-300" />
                <h3 className="mt-4 text-lg font-medium text-gray-900">No sign-ups found</h3>
                <p className="mt-1 text-gray-500">Sign-ups will appear here once recorded.</p>
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Operator</TableHead>
                      <TableHead>Ambassador</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Extraction</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {signups.map((signup) => (
                      <TableRow key={signup.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">
                              {signup.customerFirstName} {signup.customerLastName}
                            </p>
                            {signup.customerEmail && (
                              <p className="text-sm text-gray-500">{signup.customerEmail}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>{signup.operatorName || `#${signup.operatorId}`}</TableCell>
                        <TableCell>
                          {signup.ambassador 
                            ? `${signup.ambassador.firstName} ${signup.ambassador.lastName}`
                            : signup.ambassadorId.slice(0, 8) + '...'}
                        </TableCell>
                        <TableCell>
                          {new Date(signup.submittedAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          {signup.extractionStatus && (
                            <Badge className={extractionStatusColors[signup.extractionStatus]}>
                              {signup.extractionStatus}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={statusColors[signup.validationStatus]}>
                            {signup.validationStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setSelectedSignup(signup)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {signup.validationStatus === 'pending' && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-green-600 hover:text-green-700"
                                  onClick={() => handleValidate(signup.id, 'validated')}
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-600 hover:text-red-700"
                                  onClick={() => handleValidate(signup.id, 'rejected')}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 py-4 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page <= 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-gray-500">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </Card>
        </TabsContent>

        {/* Extraction Review Tab */}
        <TabsContent value="extraction">
          <Card className="p-4">
            <ExtractionReviewQueue
              items={extractionQueue}
              totalPending={extractionTotal}
              currentPage={extractionPage}
              pageSize={20}
              onPageChange={setExtractionPage}
              onConfirm={handleConfirmExtraction}
              onSkip={handleSkipExtraction}
              onRefresh={loadExtractionQueue}
              loading={loadingExtraction}
            />
          </Card>
        </TabsContent>

        {/* Sync Failures Tab */}
        <TabsContent value="sync">
          <Card className="p-4">
            <SyncFailureQueue
              failures={syncFailures}
              total={syncFailuresTotal}
              currentPage={syncPage}
              pageSize={20}
              onPageChange={setSyncPage}
              onRetry={handleRetrySync}
              onRefresh={loadSyncFailures}
              onFilterChange={(f) => {
                setSyncFilters(f);
                setSyncPage(1);
              }}
              loading={loadingSync}
            />
          </Card>
        </TabsContent>
      </Tabs>

      {/* Sign-up Detail Modal */}
      <SignupDetailModal
        signup={selectedSignup}
        open={!!selectedSignup}
        onClose={() => setSelectedSignup(null)}
        onValidate={handleValidate}
        onConfirmExtraction={(id) => handleConfirmExtraction(id)}
        onSkipExtraction={(id) => handleSkipExtraction(id)}
        onRetrySync={(id) => handleRetrySync(id)}
      />
    </div>
  );
}
