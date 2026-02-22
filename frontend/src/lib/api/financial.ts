/**
 * Financial API
 * WO-98: Domain module for financial operations (WO-40)
 */

import type { Event, EventBudget, Expense, VenuePerformance, ApiResponse } from '@/types';
import { get, post, buildQueryString, BASE_URL } from './client';

// ============================================
// FINANCIAL API
// ============================================

export const financialApi = {
  // ----------------------------------------
  // Budget Reports
  // ----------------------------------------

  /** Get budget vs actuals report */
  getBudgetReport: async (eventId?: string): Promise<ApiResponse<EventBudget[]>> => {
    const query = eventId ? `?eventId=${eventId}` : '';
    // Direct fetch since this endpoint has non-standard response format
    const res = await fetch(`${BASE_URL}/api/v1/financial/budget-actuals-report${query}`);
    const json = await res.json();

    // Transform to EventBudget format - events is at top level
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
      event: {
        id: e.id,
        title: e.title,
        eventDate: e.event_date,
        status: e.status,
        eventType: e.event_type,
      } as unknown as Event,
      projectedSignups: e.projected_signups || 0,
      projectedRevenue: parseFloat(e.projected_revenue || '0'),
      projectedExpenses: parseFloat(e.budget_total || '0'),
      projectedProfit: parseFloat(e.projected_profit || '0'),
      actualSignups: e.actual_signups || 0,
      actualRevenue: parseFloat(e.actual_revenue || '0'),
      actualExpenses: parseFloat(e.actual_total || '0'),
      actualProfit: parseFloat(e.actual_profit || '0'),
      varianceRevenue: parseFloat(e.actual_revenue || '0') - parseFloat(e.projected_revenue || '0'),
      varianceExpenses: parseFloat(e.actual_total || '0') - parseFloat(e.budget_total || '0'),
      varianceProfit: parseFloat(e.actual_profit || '0') - parseFloat(e.projected_profit || '0'),
      isFinalized: e.actual_signups !== null,
    }));

    return { success: true, data };
  },

  /** Set budget for event/category */
  setBudget: (data: {
    eventId?: string;
    category: string;
    budgetedAmount: number;
    periodStart?: string;
    periodEnd?: string;
  }) => post<EventBudget>('/api/v1/financial/budgets', data),

  // ----------------------------------------
  // Expenses
  // ----------------------------------------

  /** List expenses */
  listExpenses: (params?: {
    eventId?: string;
    category?: string;
    fromDate?: string;
    toDate?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) => {
    const query = buildQueryString(params);
    return get<Expense[]>(`/api/v1/financial/expenses${query}`);
  },

  /** Create expense */
  createExpense: (data: Partial<Expense>) =>
    post<Expense>('/api/v1/financial/expenses', data),

  /** Reconcile expenses from source */
  reconcileExpenses: (source: string) =>
    post<{ reconciled: number; unmatched: number }>('/api/v1/financial/expenses/reconcile', { source }),

  // ----------------------------------------
  // Revenue
  // ----------------------------------------

  /** Record revenue */
  recordRevenue: (data: {
    eventId?: string;
    operatorId?: number;
    revenueType: string;
    amount: number;
    revenueDate: string;
    source?: string;
    notes?: string;
  }) => post<unknown>('/api/v1/financial/revenue', data),

  /** Get revenue summary */
  getRevenueSummary: (from: string, to: string) =>
    get<unknown>(`/api/v1/financial/revenue/summary?from=${from}&to=${to}`),

  // ----------------------------------------
  // P&L
  // ----------------------------------------

  /** Get profit & loss report */
  getProfitLoss: (from: string, to: string, eventId?: string) => {
    const query = buildQueryString({ from, to, eventId });
    return get<unknown>(`/api/v1/financial/pnl${query}`);
  },

  // ----------------------------------------
  // Venue Performance
  // ----------------------------------------

  /** Get venue performance metrics */
  getVenuePerformance: () => get<VenuePerformance[]>('/api/v1/analytics/venue-performance'),
};
