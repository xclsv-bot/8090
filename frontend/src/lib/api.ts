import type {
  Event,
  Ambassador,
  Operator,
  OperatorContact,
  CpaRate,
  ValidationData,
  Signup,
  ExtractionReviewItem,
  ExtractionQueueItem,
  ExtractionQueueResponse,
  ExtractionStats,
  SyncFailure,
  SyncStats,
  SignupAuditEntry,
  SignupDashboardStats,
  PayPeriod,
  PayrollRecord,
  BonusThreshold,
  PayrollAdjustment,
  EventBudget,
  EventBudgetData,
  Expense,
  ExpenseReconciliationItem,
  VenuePerformance,
  DashboardMetrics,
  AuditLogEntry,
  ApiResponse,
} from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://xclsv-core-platform.onrender.com';

// Convert snake_case to camelCase
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

// Convert camelCase to snake_case
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

// Recursively transform object keys from snake_case to camelCase
function transformKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(transformKeys);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.entries(obj as Record<string, unknown>).reduce((acc, [key, value]) => {
      acc[snakeToCamel(key)] = transformKeys(value);
      return acc;
    }, {} as Record<string, unknown>);
  }
  return obj;
}

// Transform budget response from snake_case to camelCase EventBudgetData
// Also converts numeric strings to numbers (PostgreSQL returns DECIMAL as strings)
function transformBudgetResponse(data: Record<string, unknown> | null | undefined): EventBudgetData | null {
  if (!data) return null;
  const transformed = transformKeys(data) as Record<string, unknown>;
  
  // Convert numeric string fields to numbers
  const numericFields = [
    'budgetStaff', 'budgetReimbursements', 'budgetRewards', 'budgetBase',
    'budgetBonusKickback', 'budgetParking', 'budgetSetup', 'budgetAdditional1',
    'budgetAdditional2', 'budgetAdditional3', 'budgetAdditional4', 'budgetTotal',
    'projectedSignups', 'projectedRevenue', 'projectedProfit', 'projectedMarginPercent'
  ];
  
  for (const field of numericFields) {
    if (transformed[field] !== undefined && transformed[field] !== null) {
      transformed[field] = parseFloat(String(transformed[field])) || 0;
    }
  }
  
  return transformed as EventBudgetData;
}

// Recursively transform object keys from camelCase to snake_case (for sending to API)
function transformKeysToSnake(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(transformKeysToSnake);
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.entries(obj as Record<string, unknown>).reduce((acc, [key, value]) => {
      acc[camelToSnake(key)] = transformKeysToSnake(value);
      return acc;
    }, {} as Record<string, unknown>);
  }
  return obj;
}

// Token storage for authenticated requests
let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken(): string | null {
  return authToken;
}

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit & { token?: string }
): Promise<ApiResponse<T>> {
  // Keep body as-is - backend expects camelCase input
  const body = options?.body;

  // Use provided token, stored token, or none
  const token = options?.token || authToken;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    body,
    headers,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${res.status}`);
  }

  const json = await res.json();
  return transformKeys(json) as ApiResponse<T>;
}

// ============================================
// EVENT DUPLICATION TYPES (WO-59/WO-60)
// ============================================
export type RecurrencePattern = 'weekly' | 'bi-weekly' | 'monthly';

export interface DuplicateEventInput {
  eventDate: string;
  startTime?: string;
  endTime?: string;
  title?: string;
}

export interface BulkDuplicateEventInput {
  recurrencePattern: RecurrencePattern;
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
  skipConflicts?: boolean;
}

export interface BulkDuplicateResult {
  totalRequested: number;
  successCount: number;
  failureCount: number;
  skippedCount: number;
  createdEvents: Event[];
  failures: Array<{
    date: string;
    reason: string;
    code: 'PAST_DATE' | 'CONFLICT' | 'VALIDATION_ERROR' | 'DATABASE_ERROR';
  }>;
}

export interface BulkDuplicatePreview {
  totalDates: number;
  dates: string[];
  conflicts: string[];
  conflictCount: number;
  pastDates: string[];
  pastDateCount: number;
  validCount: number;
}

// ============================================
// EVENTS API
// ============================================
export const eventsApi = {
  list: (params?: { page?: number; limit?: number; status?: string }) => {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return fetchApi<Event[]>(`/api/v1/events${query ? `?${query}` : ''}`);
  },
  get: (id: string) => fetchApi<Event>(`/api/v1/events/${id}`),
  create: (data: Partial<Event>) =>
    fetchApi<Event>('/api/v1/events', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Event>) =>
    fetchApi<Event>(`/api/v1/events/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    fetchApi<void>(`/api/v1/events/${id}`, { method: 'DELETE' }),
  
  // WO-59/WO-60: Event Duplication
  duplicate: (id: string, input: DuplicateEventInput) =>
    fetchApi<Event>(`/api/v1/events/${id}/duplicate`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  bulkDuplicate: (id: string, input: BulkDuplicateEventInput) =>
    fetchApi<BulkDuplicateResult>(`/api/v1/events/${id}/duplicate/bulk`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  previewBulkDuplicate: (id: string, params: {
    recurrencePattern: RecurrencePattern;
    startDate: string;
    endDate: string;
    skipConflicts?: boolean;
  }) => {
    const query = new URLSearchParams({
      recurrencePattern: params.recurrencePattern,
      startDate: params.startDate,
      endDate: params.endDate,
      ...(params.skipConflicts !== undefined && { skipConflicts: String(params.skipConflicts) }),
    }).toString();
    return fetchApi<BulkDuplicatePreview>(`/api/v1/events/${id}/duplicate/preview?${query}`);
  },
  
  // WO-96: Event Budget (transforms snake_case response to camelCase)
  // Handles both wrapped {data: {...}} and unwrapped {...} responses
  getBudget: async (eventId: string) => {
    const res = await fetchApi<Record<string, unknown>>(`/api/v1/events/${eventId}/budget`);
    // If response has data property, use it; otherwise treat entire response as data
    const rawRes = res as unknown as Record<string, unknown>;
    const budgetData = res.data ?? (rawRes.id ? rawRes : null);
    return { success: true, data: transformBudgetResponse(budgetData as Record<string, unknown> | null) };
  },
  updateBudget: async (eventId: string, data: Partial<EventBudgetData>) => {
    const res = await fetchApi<Record<string, unknown>>(`/api/v1/events/${eventId}/budget`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    // If response has data property, use it; otherwise treat entire response as data
    const rawRes = res as unknown as Record<string, unknown>;
    const budgetData = res.data ?? (rawRes.id ? rawRes : null);
    return { success: true, data: transformBudgetResponse(budgetData as Record<string, unknown> | null) };
  },
};

// ============================================
// AMBASSADORS API
// ============================================
export const ambassadorsApi = {
  list: (params?: { page?: number; limit?: number; status?: string }) => {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return fetchApi<Ambassador[]>(`/api/v1/ambassadors${query ? `?${query}` : ''}`);
  },
  get: (id: string) => fetchApi<Ambassador>(`/api/v1/ambassadors/${id}`),
  create: (data: Partial<Ambassador>) =>
    fetchApi<Ambassador>('/api/v1/ambassadors', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Ambassador>) =>
    fetchApi<Ambassador>(`/api/v1/ambassadors/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  getPerformance: (id: string) =>
    fetchApi<{ signups: number; events: number; earnings: number }>(`/api/v1/ambassadors/${id}/performance`),
};

// ============================================
// ASSIGNMENTS API (WO-95)
// ============================================
export interface EventAssignment {
  id: string;
  eventId: string;
  ambassadorId: string;
  // Flat ambassador fields from JOIN
  firstName?: string;
  lastName?: string;
  email?: string;
  skillLevel?: string;
  // Nested ambassador (for frontend convenience)
  ambassador?: Ambassador;
  role?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  status: 'pending' | 'confirmed' | 'declined' | 'completed';
  checkInTime?: string;
  checkOutTime?: string;
  hoursWorked?: number;
  payRate?: number;
  bonusAmount?: number;
  totalSignups?: number;
}

export interface SuggestedAmbassador {
  ambassador: Ambassador;
  score: number;
  reasons: string[];
  hasConflict: boolean;
  conflictDetails?: string;
}

export const assignmentsApi = {
  getByEvent: (eventId: string) => 
    fetchApi<EventAssignment[]>(`/api/v1/assignments/event/${eventId}`),
  getByAmbassador: (ambassadorId: string, upcoming = true) =>
    fetchApi<EventAssignment[]>(`/api/v1/assignments/ambassador/${ambassadorId}?upcoming=${upcoming}`),
  create: (data: { eventId: string; ambassadorId: string; role?: string; scheduledStart?: string; scheduledEnd?: string; payRate?: number }) =>
    fetchApi<EventAssignment>('/api/v1/assignments', { method: 'POST', body: JSON.stringify(data) }),
  remove: (assignmentId: string) =>
    fetchApi<void>(`/api/v1/assignments/${assignmentId}`, { method: 'DELETE' }),
  updateStatus: (assignmentId: string, status: string, reason?: string) =>
    fetchApi<EventAssignment>(`/api/v1/assignments/${assignmentId}/status`, { 
      method: 'PATCH', 
      body: JSON.stringify({ status, declinedReason: reason }) 
    }),
  suggest: (eventId: string, limit?: number) =>
    fetchApi<SuggestedAmbassador[]>(`/api/v1/assignments/suggest/${eventId}${limit ? `?limit=${limit}` : ''}`, {
      method: 'POST',
    }),
};

// ============================================
// OPERATORS API (WO-2)
// ============================================
export const operatorsApi = {
  list: (params?: { status?: string; search?: string }) => {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return fetchApi<Operator[]>(`/api/v1/operators${query ? `?${query}` : ''}`);
  },
  get: (id: string) => fetchApi<Operator>(`/api/v1/operators/${id}`),
  create: (data: Partial<Operator>) =>
    fetchApi<Operator>('/api/v1/operators', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Operator>) =>
    fetchApi<Operator>(`/api/v1/operators/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) =>
    fetchApi<void>(`/api/v1/operators/${id}`, { method: 'DELETE' }),
  // Contacts
  getContacts: (operatorId: string) =>
    fetchApi<OperatorContact[]>(`/api/v1/operators/${operatorId}/contacts`),
  addContact: (operatorId: string, data: Partial<OperatorContact>) =>
    fetchApi<OperatorContact>(`/api/v1/operators/${operatorId}/contacts`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateContact: (operatorId: string, contactId: string, data: Partial<OperatorContact>) =>
    fetchApi<OperatorContact>(`/api/v1/operators/${operatorId}/contacts/${contactId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteContact: (operatorId: string, contactId: string) =>
    fetchApi<void>(`/api/v1/operators/${operatorId}/contacts/${contactId}`, { method: 'DELETE' }),
  // Performance
  getPerformance: (id: string) =>
    fetchApi<Operator['performanceSummary']>(`/api/v1/operators/${id}/performance`),
};

// ============================================
// CPA RATES API (WO-3)
// Backend prefix: /api/v1/cpa
// ============================================
export const cpaApi = {
  list: () => fetchApi<CpaRate[]>('/api/v1/cpa/rates'),
  getByOperator: (operatorId: number, activeOnly = true) =>
    fetchApi<CpaRate[]>(`/api/v1/cpa/rates/operator/${operatorId}?activeOnly=${activeOnly}`),
  getByState: (stateCode: string, date?: string) => {
    const query = date ? `?date=${date}` : '';
    return fetchApi<CpaRate[]>(`/api/v1/cpa/rates/state/${stateCode}${query}`);
  },
  get: (id: string) => fetchApi<CpaRate>(`/api/v1/cpa/rates/${id}`),
  lookup: (operatorId: number, stateCode: string, date?: string) => {
    const params = new URLSearchParams({ operatorId: String(operatorId), stateCode });
    if (date) params.set('date', date);
    return fetchApi<CpaRate | null>(`/api/v1/cpa/lookup?${params.toString()}`);
  },
  create: (data: Partial<CpaRate>) =>
    fetchApi<CpaRate>('/api/v1/cpa/rates', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<CpaRate>) =>
    fetchApi<CpaRate>(`/api/v1/cpa/rates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deactivate: (id: string) =>
    fetchApi<{ deactivated: boolean }>(`/api/v1/cpa/rates/${id}`, { method: 'DELETE' }),
  bulkImport: (rates: Partial<CpaRate>[]) =>
    fetchApi<{ imported: number; errors: string[] }>('/api/v1/cpa/rates/bulk', {
      method: 'POST',
      body: JSON.stringify({ rates }),
    }),
  calculateSignupCpa: (signupId: string) =>
    fetchApi<{ signupId: string; cpaAmount: number }>(`/api/v1/cpa/calculate/${signupId}`, { method: 'POST' }),
  getTiers: (operatorId?: number) => {
    const query = operatorId ? `?operatorId=${operatorId}` : '';
    return fetchApi<unknown[]>(`/api/v1/cpa/tiers${query}`);
  },
};

// ============================================
// SIGNUPS API (WO-55, WO-67, WO-68, WO-69, WO-70)
// ============================================
export const signupsApi = {
  // Core CRUD
  list: (params?: {
    page?: number;
    limit?: number;
    status?: string;
    validationStatus?: string;
    eventId?: string;
    ambassadorId?: string;
    operatorId?: string;
    startDate?: string;
    endDate?: string;
    extractionStatus?: string;
    search?: string;
  }) => {
    // Transform startDate/endDate to fromDate/toDate for backend compatibility
    const queryParams: Record<string, string> = {};
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          if (key === 'startDate') queryParams.fromDate = String(value);
          else if (key === 'endDate') queryParams.toDate = String(value);
          else queryParams[key] = String(value);
        }
      });
    }
    const query = new URLSearchParams(queryParams).toString();
    return fetchApi<Signup[]>(`/api/v1/signups${query ? `?${query}` : ''}`);
  },
  get: (id: string) => fetchApi<Signup>(`/api/v1/signups/${id}`),
  create: (data: Partial<Signup>) =>
    fetchApi<Signup>('/api/v1/signups', { method: 'POST', body: JSON.stringify(data) }),
  
  // Validation
  validate: (id: string, status: 'validated' | 'rejected' | 'duplicate', notes?: string) =>
    fetchApi<Signup>(`/api/v1/signups/${id}/validate`, {
      method: 'PATCH',
      body: JSON.stringify({ status, notes }),
    }),
  getValidationQueue: (limit?: number) =>
    fetchApi<Signup[]>(`/api/v1/signups/queue${limit ? `?limit=${limit}` : ''}`),
  
  // Stats
  getStats: (from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const query = params.toString();
    return fetchApi<SignupDashboardStats>(`/api/v1/signups/stats${query ? `?${query}` : ''}`);
  },

  // WO-68: Extraction review queue
  getExtractionQueue: (params?: {
    operatorId?: number;
    ambassadorId?: string;
    minConfidence?: number;
    maxConfidence?: number;
    missingFields?: 'bet_amount' | 'team_bet_on' | 'odds' | 'any';
    sortBy?: 'confidence' | 'submitted_at' | 'priority';
    sortOrder?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
  }) => {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return fetchApi<ExtractionQueueResponse>(`/api/v1/signups/extraction/review-queue${query ? `?${query}` : ''}`);
  },
  
  // WO-68: Confirm extraction
  // Backend route: /api/v1/signups/extraction/:id/extraction/confirm
  confirmExtraction: (id: string, corrections?: { betAmount?: number; teamBetOn?: string; odds?: string }) =>
    fetchApi<{ id: string; extractionStatus: string; betAmount?: number; teamBetOn?: string; odds?: string }>(
      `/api/v1/signups/extraction/${id}/extraction/confirm`,
      { method: 'POST', body: JSON.stringify(corrections || {}) }
    ),
  
  // WO-68: Skip extraction
  // Backend route: /api/v1/signups/extraction/:id/extraction/skip
  skipExtraction: (id: string, reason?: string) =>
    fetchApi<{ id: string; extractionStatus: string }>(
      `/api/v1/signups/extraction/${id}/extraction/skip`,
      { method: 'POST', body: JSON.stringify({ reason }) }
    ),
  
  // WO-68: Extraction stats
  getExtractionStats: () =>
    fetchApi<ExtractionStats>('/api/v1/signups/extraction/stats'),

  // WO-69: Customer.io sync failures
  getSyncFailures: (params?: {
    syncPhase?: 'initial' | 'enriched';
    errorType?: 'rate_limit' | 'server_error' | 'network' | 'other';
    search?: string;
    limit?: number;
    offset?: number;
  }) => {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return fetchApi<SyncFailure[]>(`/api/v1/signups/customerio/sync-failures${query ? `?${query}` : ''}`);
  },
  
  // WO-69: Retry sync
  // Backend route: /api/v1/signups/customerio/:id/retry
  retrySync: (id: string, syncPhase?: 'initial' | 'enriched') =>
    fetchApi<{ retriedJobs: string[]; message: string }>(
      `/api/v1/signups/customerio/${id}/retry`,
      { method: 'POST', body: JSON.stringify(syncPhase ? { syncPhase } : {}) }
    ),
  
  // WO-69: Sync stats
  getSyncStats: () =>
    fetchApi<SyncStats>('/api/v1/signups/customerio/stats'),

  // WO-67: Audit log
  getAuditLog: (id: string) =>
    fetchApi<SignupAuditEntry[]>(`/api/v1/signups/${id}/audit`),

  // WO-67: Submit event sign-up
  submitEventSignup: (data: {
    eventId: string;
    operatorId: number;
    customerName: string;
    customerEmail: string;
    customerPhone?: string;
    customerState?: string;
    idempotencyKey: string;
    betSlipPhoto?: string;
    betSlipContentType?: string;
  }) =>
    fetchApi<Signup>('/api/v1/signups/event', { method: 'POST', body: JSON.stringify(data) }),

  // WO-67: Submit solo sign-up
  submitSoloSignup: (data: {
    soloChatId: string;
    operatorId: number;
    customerName: string;
    customerEmail: string;
    customerPhone?: string;
    customerState?: string;
    idempotencyKey: string;
    betSlipPhoto?: string;
    betSlipContentType?: string;
  }) =>
    fetchApi<Signup>('/api/v1/signups/solo', { method: 'POST', body: JSON.stringify(data) }),

  // Check duplicate
  checkDuplicate: (email: string, operatorId: number) =>
    fetchApi<{ isDuplicate: boolean; existingSignupId?: string }>(
      '/api/v1/signups/check-duplicate',
      { method: 'POST', body: JSON.stringify({ email, operatorId }) }
    ),
};

// ============================================
// PAYROLL API (WO-50)
// Backend prefix: /api/v1/payroll
// ============================================
export const payrollApi = {
  // Pay periods
  listPeriods: (limit?: number) => {
    const query = limit ? `?limit=${limit}` : '';
    return fetchApi<PayPeriod[]>(`/api/v1/payroll/periods${query}`);
  },
  getPeriod: (id: string) => fetchApi<PayPeriod>(`/api/v1/payroll/periods/${id}`),
  getCurrentPeriod: () => fetchApi<PayPeriod>('/api/v1/payroll/periods/current'),
  // Statements (payroll records)
  getStatements: (payPeriodId: string) =>
    fetchApi<PayrollRecord[]>(`/api/v1/payroll/periods/${payPeriodId}/statements`),
  // Calculations
  calculatePayroll: (payPeriodId: string) =>
    fetchApi<{ calculated: number }>(`/api/v1/payroll/periods/${payPeriodId}/calculate`, { method: 'POST' }),
  // Approve pay period
  approvePeriod: (payPeriodId: string) =>
    fetchApi<PayPeriod>(`/api/v1/payroll/periods/${payPeriodId}/approve`, { method: 'POST' }),
  // Process payments
  processPayments: (payPeriodId: string) =>
    fetchApi<{ processed: number; failed: number }>(`/api/v1/payroll/periods/${payPeriodId}/process`, { method: 'POST' }),
  // Adjustments
  addAdjustment: (statementId: string, data: Partial<PayrollAdjustment>) =>
    fetchApi<PayrollRecord>(`/api/v1/payroll/statements/${statementId}/adjust`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  // Ambassador payment history
  getAmbassadorPayments: (ambassadorId: string, limit?: number) => {
    const query = limit ? `?limit=${limit}` : '';
    return fetchApi<PayrollRecord[]>(`/api/v1/payroll/ambassador/${ambassadorId}/history${query}`);
  },
  // Payroll stats
  getStats: () =>
    fetchApi<{ pendingPeriods: number; totalOwed: number; lastProcessedDate: string }>('/api/v1/payroll/stats'),
  // Historical payroll entries (imported data)
  listEntries: (params?: { limit?: string; offset?: string; ambassador?: string; startDate?: string; endDate?: string; status?: string }) => {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return fetchApi<{ entries: any[]; total: number }>(`/api/v1/payroll/entries${query ? `?${query}` : ''}`);
  },
  getEntriesSummary: () =>
    fetchApi<{ totalEntries: number; totalAmount: number; paidAmount: number; pendingAmount: number; uniqueAmbassadors: number }>('/api/v1/payroll/entries/summary'),
};

// ============================================
// FINANCIAL API (WO-40)
// Backend prefix: /api/v1/financial
// ============================================
export const financialApi = {
  // Budgets
  getBudgetReport: async (eventId?: string): Promise<ApiResponse<EventBudget[]>> => {
    const query = eventId ? `?eventId=${eventId}` : '';
    // Use the budget-actuals-report endpoint which has the actual data
    // Note: This endpoint returns { events: [...] } directly, not { data: { events: [...] } }
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'https://xclsv-core-platform.onrender.com'}/api/v1/financial/budget-actuals-report${query}`);
    const json = await res.json();
    
    // Transform to EventBudget format - events is at top level, not nested in data
    const events = json.events || [];
    const data: EventBudget[] = events.map((e: {
      id: string;
      title: string;
      event_date: string;
      status: string;
      event_type: string;
      budget_total: string | null;
      projected_signups: number | null;
      projected_revenue: string | null;
      projected_profit: string | null;
      actual_total: string | null;
      actual_signups: number | null;
      actual_revenue: string | null;
      actual_profit: string | null;
    }) => ({
      id: e.id,
      eventId: e.id,
      event: { id: e.id, title: e.title, eventDate: e.event_date, status: e.status, eventType: e.event_type } as unknown as Event,
      projectedSignups: e.projected_signups || 0,
      projectedRevenue: parseFloat(e.projected_revenue || '0'),
      projectedExpenses: parseFloat(e.budget_total || '0'),
      projectedProfit: parseFloat(e.projected_profit || '0'),
      actualSignups: e.actual_signups || 0,
      actualRevenue: parseFloat(e.actual_revenue || '0'),
      actualExpenses: parseFloat(e.actual_total || '0'),
      actualProfit: parseFloat(e.actual_profit || '0'),
      varianceRevenue: (parseFloat(e.actual_revenue || '0') - parseFloat(e.projected_revenue || '0')),
      varianceExpenses: (parseFloat(e.actual_total || '0') - parseFloat(e.budget_total || '0')),
      varianceProfit: (parseFloat(e.actual_profit || '0') - parseFloat(e.projected_profit || '0')),
      isFinalized: e.actual_signups !== null,
    }));
    
    return { success: true, data };
  },
  setBudget: (data: { eventId?: string; category: string; budgetedAmount: number; periodStart?: string; periodEnd?: string }) =>
    fetchApi<EventBudget>('/api/v1/financial/budgets', { method: 'POST', body: JSON.stringify(data) }),
  // Expenses
  listExpenses: (params?: { eventId?: string; category?: string; fromDate?: string; toDate?: string; status?: string; page?: number; limit?: number }) => {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return fetchApi<Expense[]>(`/api/v1/financial/expenses${query ? `?${query}` : ''}`);
  },
  createExpense: (data: Partial<Expense>) =>
    fetchApi<Expense>('/api/v1/financial/expenses', { method: 'POST', body: JSON.stringify(data) }),
  reconcileExpenses: (source: string) =>
    fetchApi<{ reconciled: number; unmatched: number }>('/api/v1/financial/expenses/reconcile', {
      method: 'POST',
      body: JSON.stringify({ source }),
    }),
  // Revenue
  recordRevenue: (data: { eventId?: string; operatorId?: number; revenueType: string; amount: number; revenueDate: string; source?: string; notes?: string }) =>
    fetchApi<unknown>('/api/v1/financial/revenue', { method: 'POST', body: JSON.stringify(data) }),
  getRevenueSummary: (from: string, to: string) =>
    fetchApi<unknown>(`/api/v1/financial/revenue/summary?from=${from}&to=${to}`),
  // P&L
  getProfitLoss: (from: string, to: string, eventId?: string) => {
    const params = new URLSearchParams({ from, to });
    if (eventId) params.set('eventId', eventId);
    return fetchApi<unknown>(`/api/v1/financial/pnl?${params.toString()}`);
  },
  // Venue performance (via analytics)
  getVenuePerformance: () =>
    fetchApi<VenuePerformance[]>('/api/v1/analytics/venue-performance'),
};

// ============================================
// ANALYTICS API (WO-4)
// Backend prefix: /api/v1/analytics
// ============================================
export const analyticsApi = {
  // Create daily snapshot
  createSnapshot: () =>
    fetchApi<unknown>('/api/v1/analytics/snapshot', { method: 'POST' }),
  // Get historical snapshots
  getSnapshots: (type: string, from: string, to: string) =>
    fetchApi<unknown[]>(`/api/v1/analytics/snapshots?type=${type}&from=${from}&to=${to}`),
  // Event performance dashboard
  getEventMetrics: (from: string, to: string) =>
    fetchApi<Record<string, unknown>>(`/api/v1/analytics/events?from=${from}&to=${to}`),
  // Ambassador productivity dashboard
  getAmbassadorMetrics: (from: string, to: string) =>
    fetchApi<Record<string, unknown>>(`/api/v1/analytics/ambassadors?from=${from}&to=${to}`),
  // Financial performance dashboard
  getFinancialMetrics: (from: string, to: string) =>
    fetchApi<Record<string, unknown>>(`/api/v1/analytics/financial?from=${from}&to=${to}`),
  // KPIs
  getKPIs: () =>
    fetchApi<DashboardMetrics>('/api/v1/analytics/kpis'),
  setKPITarget: (name: string, targetValue: number) =>
    fetchApi<{ updated: boolean }>(`/api/v1/analytics/kpis/${name}/target`, {
      method: 'PUT',
      body: JSON.stringify({ targetValue }),
    }),
  // Export
  exportData: (type: string, from: string, to: string, format: 'csv' | 'json' = 'json') =>
    fetchApi<unknown>(`/api/v1/analytics/export/${type}?from=${from}&to=${to}&format=${format}`),
};

// ============================================
// HEALTH
// ============================================
export const healthApi = {
  check: () => fetchApi<{ status: string }>('/health'),
};
