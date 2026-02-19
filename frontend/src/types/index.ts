// Core Platform Types - Based on 8090 Work Order Specs

// ============================================
// EVENTS
// ============================================
export interface Event {
  id: string;
  title: string;
  description?: string;
  venue?: string;
  address?: string;
  city?: string;
  state?: string;
  eventDate: string;
  startTime?: string;
  endTime?: string;
  status: EventStatus;
  budgetAmount?: number;
  projectedRevenue?: number;
  actualRevenue?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type EventStatus = 'planned' | 'confirmed' | 'active' | 'completed' | 'cancelled';

// ============================================
// AMBASSADORS
// ============================================
export interface Ambassador {
  id: string;
  clerkUserId?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  skillLevel: SkillLevel;
  compensationType: CompensationType;
  hourlyRate?: number;
  perSignupRate?: number;
  status: AmbassadorStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type SkillLevel = 'trainee' | 'standard' | 'senior' | 'lead';
export type CompensationType = 'per_signup' | 'hourly' | 'hybrid';
export type AmbassadorStatus = 'active' | 'inactive' | 'suspended';

// ============================================
// OPERATORS
// ============================================
export interface Operator {
  id: string;
  name: string;
  code: string;
  logoUrl?: string;
  category: OperatorCategory;
  isActive: boolean;
  contractStartDate?: string;
  contractEndDate?: string;
  partnershipStatus: PartnershipStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  // Computed/joined fields
  contacts?: OperatorContact[];
  performanceSummary?: OperatorPerformance;
}

export type OperatorCategory = 'sportsbook' | 'casino' | 'poker' | 'dfs';
export type PartnershipStatus = 'active' | 'inactive' | 'pending' | 'terminated';

export interface OperatorContact {
  id: string;
  operatorId: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  isPrimary: boolean;
}

export interface OperatorPerformance {
  totalSignups: number;
  confirmedSignups: number;
  dropOffRate: number;
  avgCpa: number;
  totalRevenue: number;
}

// ============================================
// CPA RATES
// ============================================
export interface CpaRate {
  id: string;
  operatorId: string;
  operatorName?: string;
  state?: string;
  amount: number;
  effectiveDate: string;
  endDate?: string;
  isDefault: boolean;
  createdAt: string;
}

export interface CpaRateHistory {
  id: string;
  cpaRateId: string;
  amount: number;
  effectiveDate: string;
  changedBy: string;
  changedAt: string;
  reason?: string;
}

export interface ValidationData {
  id: string;
  operatorId: string;
  month: string;
  reportedSignups: number;
  confirmedSignups: number;
  rejectedSignups: number;
  dropOffRate: number;
  variance: number;
  status: 'pending' | 'reconciled' | 'disputed';
  notes?: string;
}

// ============================================
// SIGN-UPS
// ============================================
export interface Signup {
  id: string;
  eventId?: string;
  ambassadorId: string;
  payPeriodId?: string;
  customerFirstName: string;
  customerLastName: string;
  customerEmail?: string;
  customerPhone?: string;
  operatorId: number;
  operatorName?: string;
  betSlipImageUrl?: string;
  validationStatus: ValidationStatus;
  extractionStatus?: ExtractionStatus;
  cpaAmount?: number;
  betAmount?: number;
  odds?: string;
  teamBetOn?: string;
  submittedAt: string;
  validatedAt?: string;
  rejectionReason?: string;
  notes?: string;
  createdAt: string;
  // Joined fields
  ambassador?: Ambassador;
  event?: Event;
}

export type ValidationStatus = 'pending' | 'validated' | 'rejected' | 'duplicate';
export type ExtractionStatus = 'pending' | 'completed' | 'confirmed' | 'failed' | 'needs_review' | 'skipped';

export interface ExtractionReviewItem {
  id: string;
  signupId: string;
  imageUrl: string;
  extractedData: {
    betAmount?: number;
    odds?: string;
    teamBetOn?: string;
    confidence: number;
  };
  status: 'pending' | 'confirmed' | 'corrected' | 'skipped';
  signup: Signup;
}

// WO-70: Enhanced extraction review queue item from backend
export interface ExtractionQueueItem {
  id: string;
  customerName: string;
  customerEmail: string;
  operator: string;
  ambassador: string;
  imageUrl: string;
  extractionConfidence: number;
  betAmount?: number;
  teamBetOn?: string;
  odds?: string;
  missingFields: string[];
}

export interface ExtractionQueueResponse {
  signups: ExtractionQueueItem[];
  totalPending: number;
}

// WO-70: Customer.io sync failure types
export interface SyncFailure {
  id: string;
  signupId: string;
  customerName: string;
  customerEmail: string;
  syncPhase: 'initial' | 'enriched';
  errorMessage: string;
  errorType: 'rate_limit' | 'server_error' | 'network' | 'other';
  attemptCount: number;
  lastAttemptAt: string;
  createdAt: string;
}

export interface SyncStats {
  total: number;
  pending: number;
  completed: number;
  failed: number;
  byPhase: {
    initial: { pending: number; completed: number; failed: number };
    enriched: { pending: number; completed: number; failed: number };
  };
}

// WO-70: Sign-up audit log types
export interface SignupAuditEntry {
  id: string;
  signupId: string;
  action: SignupAuditAction;
  userId?: string;
  userName?: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

export type SignupAuditAction =
  | 'submitted'
  | 'validated'
  | 'rejected'
  | 'extraction_started'
  | 'extraction_completed'
  | 'extraction_failed'
  | 'extraction_reviewed'
  | 'customerio_sync_initial'
  | 'customerio_sync_enriched'
  | 'customerio_sync_failed'
  | 'customerio_sync_retried';

// WO-70: Dashboard stats
export interface SignupDashboardStats {
  total: number;
  today: number;
  pendingValidation: number;
  pendingExtraction: number;
  syncFailures: number;
  byStatus: Record<string, number>;
  byOperator: { operatorId: number; operatorName: string; count: number }[];
  byAmbassador: { ambassadorId: string; ambassadorName: string; count: number }[];
}

// WO-70: Extraction stats
export interface ExtractionStats {
  byStatus: Record<string, number>;
  jobs: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  };
  confidence: {
    avgPending: number | null;
    avgConfirmed: number | null;
    avgOverall: number | null;
  };
}

// ============================================
// PAYROLL
// ============================================
export interface PayPeriod {
  id: string;
  startDate: string;
  endDate: string;
  status: PayPeriodStatus;
  totalSignups: number;
  totalAmount: number;
  processedAt?: string;
  notes?: string;
  createdAt: string;
}

export type PayPeriodStatus = 'open' | 'closed' | 'processing' | 'paid';

export interface PayrollRecord {
  id: string;
  payPeriodId: string;
  ambassadorId: string;
  ambassador?: Ambassador;
  signupCount: number;
  signupEarnings: number;
  hoursWorked?: number;
  hourlyEarnings?: number;
  bonusEarnings: number;
  adjustments: number;
  reimbursements: number;
  grossPay: number;
  status: 'pending' | 'approved' | 'paid';
  signupsByEvent?: { eventId: string; eventName: string; count: number }[];
}

export interface BonusThreshold {
  id: string;
  name: string;
  scope: 'event' | 'ambassador' | 'pay_period';
  thresholdType: 'signup_count' | 'revenue_target' | 'custom';
  targetValue: number;
  bonusAmount: number;
  isActive: boolean;
  effectiveDate: string;
  endDate?: string;
}

export interface PayrollAdjustment {
  id: string;
  payrollRecordId: string;
  type: 'bonus' | 'deduction' | 'reimbursement' | 'correction';
  amount: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  createdBy: string;
  approvedBy?: string;
  createdAt: string;
}

// ============================================
// FINANCIAL
// ============================================
export interface EventBudget {
  id: string;
  eventId: string;
  event?: Event;
  projectedSignups: number;
  projectedRevenue: number;
  projectedExpenses: number;
  projectedProfit: number;
  actualSignups?: number;
  actualRevenue?: number;
  actualExpenses?: number;
  actualProfit?: number;
  varianceRevenue?: number;
  varianceExpenses?: number;
  varianceProfit?: number;
  isFinalized: boolean;
}

export interface Expense {
  id: string;
  eventId?: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  vendor?: string;
  transactionDate: string;
  source: 'manual' | 'ramp' | 'quickbooks';
  externalId?: string;
  status: 'unattributed' | 'attributed' | 'reconciled';
  notes?: string;
}

export type ExpenseCategory = 
  | 'venue' 
  | 'staffing' 
  | 'marketing' 
  | 'equipment' 
  | 'travel' 
  | 'food' 
  | 'supplies' 
  | 'other';

export interface ExpenseReconciliationItem {
  expense: Expense;
  suggestedEvents: { event: Event; confidence: number; reason: string }[];
}

export interface VenuePerformance {
  venue: string;
  city: string;
  state: string;
  totalEvents: number;
  totalSignups: number;
  avgSignupsPerEvent: number;
  totalRevenue: number;
  totalExpenses: number;
  avgProfit: number;
  profitMargin: number;
}

// ============================================
// ANALYTICS
// ============================================
export interface DashboardMetrics {
  totalEvents: number;
  activeEvents: number;
  totalSignups: number;
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  avgSignupsPerEvent: number;
  topPerformingAmbassadors: { ambassador: Ambassador; signups: number }[];
  topPerformingOperators: { operator: Operator; signups: number; revenue: number }[];
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  userName: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeValue?: Record<string, unknown>;
  afterValue?: Record<string, unknown>;
  ipAddress?: string;
  timestamp: string;
}

// ============================================
// API RESPONSE TYPES
// ============================================
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    page: number;
    limit: number;
    total: number;
  };
  error?: string;
}

export interface ApiError {
  message: string;
  code?: string;
  details?: Record<string, string[]>;
}
