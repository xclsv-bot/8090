/**
 * Payroll API
 * WO-98: Domain module for payroll operations (WO-50)
 */

import type { PayPeriod, PayrollRecord, PayrollAdjustment } from '@/types';
import { get, post, buildQueryString } from './client';

// ============================================
// PAYROLL API
// ============================================

export const payrollApi = {
  // ----------------------------------------
  // Pay Periods
  // ----------------------------------------

  /** List pay periods */
  listPeriods: (limit?: number) => {
    const query = limit ? `?limit=${limit}` : '';
    return get<PayPeriod[]>(`/api/v1/payroll/periods${query}`);
  },

  /** Get single pay period */
  getPeriod: (id: string) => get<PayPeriod>(`/api/v1/payroll/periods/${id}`),

  /** Get current pay period */
  getCurrentPeriod: () => get<PayPeriod>('/api/v1/payroll/periods/current'),

  // ----------------------------------------
  // Statements
  // ----------------------------------------

  /** Get payroll statements for a period */
  getStatements: (payPeriodId: string) =>
    get<PayrollRecord[]>(`/api/v1/payroll/periods/${payPeriodId}/statements`),

  // ----------------------------------------
  // Calculations & Processing
  // ----------------------------------------

  /** Calculate payroll for a period */
  calculatePayroll: (payPeriodId: string) =>
    post<{ calculated: number }>(`/api/v1/payroll/periods/${payPeriodId}/calculate`),

  /** Approve pay period */
  approvePeriod: (payPeriodId: string) =>
    post<PayPeriod>(`/api/v1/payroll/periods/${payPeriodId}/approve`),

  /** Process payments for a period */
  processPayments: (payPeriodId: string) =>
    post<{ processed: number; failed: number }>(`/api/v1/payroll/periods/${payPeriodId}/process`),

  // ----------------------------------------
  // Adjustments
  // ----------------------------------------

  /** Add adjustment to a statement */
  addAdjustment: (statementId: string, data: Partial<PayrollAdjustment>) =>
    post<PayrollRecord>(`/api/v1/payroll/statements/${statementId}/adjust`, data),

  // ----------------------------------------
  // Ambassador History
  // ----------------------------------------

  /** Get payment history for an ambassador */
  getAmbassadorPayments: (ambassadorId: string, limit?: number) => {
    const query = limit ? `?limit=${limit}` : '';
    return get<PayrollRecord[]>(`/api/v1/payroll/ambassador/${ambassadorId}/history${query}`);
  },

  // ----------------------------------------
  // Stats & Entries
  // ----------------------------------------

  /** Get payroll statistics */
  getStats: () =>
    get<{ pendingPeriods: number; totalOwed: number; lastProcessedDate: string }>('/api/v1/payroll/stats'),

  /** List historical payroll entries */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  listEntries: (params?: {
    limit?: string;
    offset?: string;
    ambassador?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
  }) => {
    const query = buildQueryString(params);
    return get<{ entries: any[]; total: number }>(`/api/v1/payroll/entries${query}`);
  },

  /** Get entries summary */
  getEntriesSummary: () =>
    get<{
      totalEntries: number;
      totalAmount: number;
      paidAmount: number;
      pendingAmount: number;
      uniqueAmbassadors: number;
    }>('/api/v1/payroll/entries/summary'),
};
