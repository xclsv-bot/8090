/**
 * Pay Statement Types - WO-91
 * Detailed payroll tracking with line items, payment history, and rate changes
 */

// Line item types for granular tracking
export type LineItemType = 'earning' | 'deduction' | 'bonus';
export type PayStatementStatus = 'draft' | 'pending' | 'approved' | 'processing' | 'paid' | 'failed' | 'cancelled';
export type PaymentMethod = 'direct_deposit' | 'check' | 'paypal' | 'venmo' | 'wire' | 'other';
export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'reversed';
export type RateType = 'per_signup' | 'hourly' | 'daily' | 'flat' | 'bonus_tier';
export type SourceType = 'signup' | 'event_assignment' | 'bonus_rule' | 'manual_adjustment' | 'correction' | 'expense_reimbursement';

/**
 * Ambassador Pay Statement
 * Main statement linking ambassador to a pay period
 */
export interface AmbassadorPayStatement {
  id: string;
  ambassadorId: string;
  payPeriodId: string;
  status: PayStatementStatus;
  grossPay: number;
  deductions: number;
  netPay: number;
  paidAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AmbassadorPayStatementWithDetails extends AmbassadorPayStatement {
  ambassadorName: string;
  ambassadorEmail: string;
  periodStart: Date;
  periodEnd: Date;
  lineItemCount: number;
  paymentCount: number;
}

/**
 * Pay Statement Line Items
 * Individual earning/deduction entries with full traceability
 */
export interface PayStatementLineItem {
  id: string;
  statementId: string;
  type: LineItemType;
  description: string;
  amount: number;
  sourceType?: SourceType;
  sourceId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface PayStatementLineItemInput {
  statementId: string;
  type: LineItemType;
  description: string;
  amount: number;
  sourceType?: SourceType;
  sourceId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Payment History
 * Tracks all payment attempts and status changes
 */
export interface PaymentHistory {
  id: string;
  statementId: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  processedAt?: Date;
  externalReference?: string;
  failureReason?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface PaymentHistoryInput {
  statementId: string;
  amount: number;
  method: PaymentMethod;
  status?: PaymentStatus;
  externalReference?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Pay Rate History
 * Tracks rate changes over time for auditing
 */
export interface PayRateHistory {
  id: string;
  ambassadorId: string;
  rateType: RateType;
  rateAmount: number;
  effectiveDate: Date;
  endDate?: Date;
  reason?: string;
  changedBy?: string;
  createdAt: Date;
}

export interface PayRateHistoryInput {
  ambassadorId: string;
  rateType: RateType;
  rateAmount: number;
  effectiveDate: string;
  endDate?: string;
  reason?: string;
}

/**
 * Statement calculation breakdown
 */
export interface StatementCalculation {
  earnings: {
    signups: number;
    hourly: number;
    events: number;
    bonuses: number;
    other: number;
    total: number;
  };
  deductions: {
    advances: number;
    corrections: number;
    other: number;
    total: number;
  };
  grossPay: number;
  netPay: number;
  lineItems: PayStatementLineItem[];
}

/**
 * Search/filter params
 */
export interface PayStatementSearchParams {
  ambassadorId?: string;
  payPeriodId?: string;
  status?: PayStatementStatus;
  fromDate?: string;
  toDate?: string;
  minAmount?: number;
  maxAmount?: number;
  limit?: number;
  offset?: number;
}

export interface LineItemSearchParams {
  statementId?: string;
  type?: LineItemType;
  sourceType?: SourceType;
  sourceId?: string;
  limit?: number;
  offset?: number;
}

/**
 * Summary stats
 */
export interface PayStatementStats {
  totalStatements: number;
  totalGrossPay: number;
  totalDeductions: number;
  totalNetPay: number;
  byStatus: Record<PayStatementStatus, number>;
  avgPaymentAmount: number;
}

export interface AmbassadorPaySummary {
  ambassadorId: string;
  ambassadorName: string;
  totalEarnings: number;
  totalDeductions: number;
  totalNetPay: number;
  statementCount: number;
  lastPaidAt?: Date;
  currentRate?: PayRateHistory;
}
