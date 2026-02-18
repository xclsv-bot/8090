/**
 * Financial Management Types - WO-36
 */

export type ExpenseCategory = 'payroll' | 'materials' | 'travel' | 'venue' | 'marketing' | 'software' | 'other';
export type ExpenseStatus = 'pending' | 'approved' | 'rejected' | 'paid' | 'cancelled';
export type RevenueType = 'cpa' | 'rev_share' | 'bonus' | 'referral' | 'other';

export interface Expense {
  id: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  currency: string;
  status: ExpenseStatus;
  eventId?: string;
  ambassadorId?: string;
  payPeriodId?: string;
  receiptFileKey?: string;
  receiptFileName?: string;
  vendorName?: string;
  submittedBy?: string;
  submittedAt: Date;
  approvedBy?: string;
  approvedAt?: Date;
  rejectionReason?: string;
  paidAt?: Date;
  paymentReference?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RevenueRecord {
  id: string;
  revenueType: RevenueType;
  description?: string;
  amount: number;
  currency: string;
  operatorId?: number;
  eventId?: string;
  payPeriodId?: string;
  signupId?: string;
  revenueDate: Date;
  receivedAt?: Date;
  externalReference?: string;
  invoiceNumber?: string;
  notes?: string;
  createdAt: Date;
}

export interface BudgetAllocation {
  id: string;
  name: string;
  category: ExpenseCategory;
  allocatedAmount: number;
  spentAmount: number;
  remainingAmount: number;
  periodStart: Date;
  periodEnd: Date;
  eventId?: string;
  region?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FinancialReport {
  id: string;
  reportType: string;
  reportDate: Date;
  periodStart?: Date;
  periodEnd?: Date;
  totalRevenue?: number;
  totalExpenses?: number;
  netProfit?: number;
  reportData?: Record<string, unknown>;
  generatedAt: Date;
  generatedBy?: string;
}

export interface CreateExpenseInput {
  category: ExpenseCategory;
  description: string;
  amount: number;
  eventId?: string;
  ambassadorId?: string;
  vendorName?: string;
  receiptFileKey?: string;
  receiptFileName?: string;
  notes?: string;
}

export interface ExpenseSearchFilters {
  category?: ExpenseCategory;
  status?: ExpenseStatus;
  eventId?: string;
  ambassadorId?: string;
  fromDate?: string;
  toDate?: string;
  minAmount?: number;
  maxAmount?: number;
}
