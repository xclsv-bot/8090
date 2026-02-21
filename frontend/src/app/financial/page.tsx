'use client';

import { useEffect, useState } from 'react';
import { financialApi, eventsApi } from '@/lib/api';
import type { EventBudget, Expense, ExpenseReconciliationItem, VenuePerformance } from '@/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle,
  CheckCircle,
  MapPin,
  Receipt
} from 'lucide-react';
import Link from 'next/link';

export default function FinancialPage() {
  const [budgets, setBudgets] = useState<EventBudget[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [reconciliationQueue, setReconciliationQueue] = useState<ExpenseReconciliationItem[]>([]);
  const [venuePerformance, setVenuePerformance] = useState<VenuePerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<'all' | 'this-week' | 'last-week' | 'this-month' | 'last-month' | 'this-pay-period' | 'last-pay-period'>('all');

  // Date filter helpers
  const getDateRange = (filter: typeof dateFilter): { start: Date; end: Date } | null => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (filter) {
      case 'this-week': {
        const dayOfWeek = today.getDay();
        const start = new Date(today);
        start.setDate(today.getDate() - dayOfWeek);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        return { start, end };
      }
      case 'last-week': {
        const dayOfWeek = today.getDay();
        const end = new Date(today);
        end.setDate(today.getDate() - dayOfWeek - 1);
        const start = new Date(end);
        start.setDate(end.getDate() - 6);
        return { start, end };
      }
      case 'this-month': {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        return { start, end };
      }
      case 'last-month': {
        const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const end = new Date(today.getFullYear(), today.getMonth(), 0);
        return { start, end };
      }
      case 'this-pay-period': {
        // Bi-weekly pay periods starting from a known date (Jan 1, 2025)
        const payPeriodStart = new Date(2025, 0, 1);
        const daysSinceStart = Math.floor((today.getTime() - payPeriodStart.getTime()) / (1000 * 60 * 60 * 24));
        const periodNumber = Math.floor(daysSinceStart / 14);
        const start = new Date(payPeriodStart);
        start.setDate(payPeriodStart.getDate() + (periodNumber * 14));
        const end = new Date(start);
        end.setDate(start.getDate() + 13);
        return { start, end };
      }
      case 'last-pay-period': {
        const payPeriodStart = new Date(2025, 0, 1);
        const daysSinceStart = Math.floor((today.getTime() - payPeriodStart.getTime()) / (1000 * 60 * 60 * 24));
        const periodNumber = Math.floor(daysSinceStart / 14) - 1;
        const start = new Date(payPeriodStart);
        start.setDate(payPeriodStart.getDate() + (periodNumber * 14));
        const end = new Date(start);
        end.setDate(start.getDate() + 13);
        return { start, end };
      }
      default:
        return null;
    }
  };

  // Filter budgets by date
  const filteredBudgets = budgets.filter(b => {
    if (dateFilter === 'all') return true;
    const range = getDateRange(dateFilter);
    if (!range) return true;
    const eventDate = new Date(b.event?.eventDate || '');
    return eventDate >= range.start && eventDate <= range.end;
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    // Load budgets and expenses separately so one failing doesn't break the other
    try {
      const budgetsRes = await financialApi.getBudgetReport();
      setBudgets(budgetsRes.data || []);
    } catch (error) {
      console.error('Failed to load budget data:', error);
    }

    try {
      const expensesRes = await financialApi.listExpenses();
      setExpenses(expensesRes.data || []);
    } catch (error) {
      console.error('Failed to load expenses data:', error);
    }

    setLoading(false);
  }

  // TODO: attributeExpense endpoint not yet implemented in backend
  async function attributeExpense(expenseId: string, eventId: string) {
    console.warn('attributeExpense not yet implemented');
    // try {
    //   await financialApi.attributeExpense(expenseId, eventId);
    //   loadData();
    // } catch (error) {
    //   console.error('Failed to attribute expense:', error);
    // }
  }

  // Calculate totals from filtered budgets
  const totalProjectedRevenue = filteredBudgets.reduce((sum, b) => sum + (b.projectedRevenue || 0), 0);
  const totalActualRevenue = filteredBudgets.reduce((sum, b) => sum + (b.actualRevenue || 0), 0);
  const totalProjectedExpenses = filteredBudgets.reduce((sum, b) => sum + (b.projectedExpenses || 0), 0);
  const totalActualExpenses = filteredBudgets.reduce((sum, b) => sum + (b.actualExpenses || 0), 0);
  const totalVariance = totalActualRevenue - totalProjectedRevenue;
  const unattributedExpenses = expenses.filter(e => e.status === 'unattributed').length;

  // Get current filter date range for display
  const currentRange = getDateRange(dateFilter);
  const formatDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Financial Management</h1>
        <p className="text-gray-600">Budget tracking, expense reconciliation, and profitability analysis</p>
      </div>

      {/* Overview Stats */}
      <div className="mb-6 grid gap-4 md:grid-cols-5">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-blue-100 p-2">
              <DollarSign className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Projected Revenue</p>
              <p className="text-xl font-bold">${totalProjectedRevenue.toLocaleString()}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-green-100 p-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Actual Revenue</p>
              <p className="text-xl font-bold">${totalActualRevenue.toLocaleString()}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-red-100 p-2">
              <TrendingDown className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Expenses</p>
              <p className="text-xl font-bold">${totalActualExpenses.toLocaleString()}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className={`rounded-full p-2 ${totalVariance >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
              {totalVariance >= 0 ? (
                <TrendingUp className="h-5 w-5 text-green-600" />
              ) : (
                <TrendingDown className="h-5 w-5 text-red-600" />
              )}
            </div>
            <div>
              <p className="text-sm text-gray-500">Variance</p>
              <p className={`text-xl font-bold ${totalVariance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {totalVariance >= 0 ? '+' : ''}${totalVariance.toLocaleString()}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-yellow-100 p-2">
              <Receipt className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Unattributed</p>
              <p className="text-xl font-bold">{unattributedExpenses}</p>
            </div>
          </div>
        </Card>
      </div>

      <Tabs defaultValue="budget">
        <TabsList>
          <TabsTrigger value="budget">Budget vs Actuals</TabsTrigger>
          <TabsTrigger value="reconciliation">
            Expense Reconciliation
            {unattributedExpenses > 0 && (
              <Badge className="ml-2 bg-yellow-100 text-yellow-700">{unattributedExpenses}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="venues">Venue Performance</TabsTrigger>
        </TabsList>

        <TabsContent value="budget">
          {/* Date Filter Buttons */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-sm text-gray-500 mr-2">Filter by:</span>
            {[
              { value: 'all', label: 'All Time' },
              { value: 'this-week', label: 'This Week' },
              { value: 'last-week', label: 'Last Week' },
              { value: 'this-month', label: 'This Month' },
              { value: 'last-month', label: 'Last Month' },
              { value: 'this-pay-period', label: 'This Pay Period' },
              { value: 'last-pay-period', label: 'Last Pay Period' },
            ].map(({ value, label }) => (
              <Button
                key={value}
                variant={dateFilter === value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDateFilter(value as typeof dateFilter)}
              >
                {label}
              </Button>
            ))}
            {currentRange && (
              <span className="ml-4 text-sm text-gray-600">
                {formatDate(currentRange.start)} - {formatDate(currentRange.end)}
              </span>
            )}
          </div>

          <Card>
            {loading ? (
              <div className="p-8 text-center text-gray-500">Loading budget data...</div>
            ) : filteredBudgets.length === 0 ? (
              <div className="p-8 text-center">
                <DollarSign className="mx-auto h-12 w-12 text-gray-300" />
                <h3 className="mt-4 text-lg font-medium text-gray-900">No budget data</h3>
                <p className="mt-1 text-gray-500">
                  {budgets.length > 0 
                    ? 'No events match the selected date filter.' 
                    : 'Budget data will appear once events have financial projections.'}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead className="text-right">Projected Revenue</TableHead>
                    <TableHead className="text-right">Actual Revenue</TableHead>
                    <TableHead className="text-right">Projected Expenses</TableHead>
                    <TableHead className="text-right">Actual Expenses</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBudgets.map((budget) => {
                    const variance = (budget.actualProfit || 0) - (budget.projectedProfit || 0);
                    const variancePercent = budget.projectedProfit 
                      ? ((variance / budget.projectedProfit) * 100).toFixed(1)
                      : '0';
                    const isHighVariance = Math.abs(parseFloat(variancePercent)) > 20;

                    return (
                      <TableRow key={budget.id}>
                        <TableCell className="font-medium">
                          {budget.event?.title || 'Unknown Event'}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          ${budget.projectedRevenue?.toLocaleString() || '0'}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          ${budget.actualRevenue?.toLocaleString() || '—'}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          ${budget.projectedExpenses?.toLocaleString() || '0'}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          ${budget.actualExpenses?.toLocaleString() || '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`font-mono ${variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {variance >= 0 ? '+' : ''}${variance.toLocaleString()}
                          </span>
                          {isHighVariance && (
                            <AlertTriangle className="inline ml-1 h-4 w-4 text-yellow-500" />
                          )}
                        </TableCell>
                        <TableCell>
                          {budget.isFinalized ? (
                            <Badge className="bg-green-100 text-green-700">
                              <CheckCircle className="mr-1 h-3 w-3" />
                              Finalized
                            </Badge>
                          ) : (
                            <Badge variant="outline">Open</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="reconciliation">
          <Card>
            {expenses.filter(e => e.status === 'unattributed').length === 0 ? (
              <div className="p-8 text-center">
                <Receipt className="mx-auto h-12 w-12 text-gray-300" />
                <h3 className="mt-4 text-lg font-medium text-gray-900">All expenses reconciled</h3>
                <p className="mt-1 text-gray-500">
                  Unattributed expenses from Ramp will appear here for assignment.
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {expenses.filter(e => e.status === 'unattributed').map((expense) => (
                  <div key={expense.id} className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">{expense.description}</p>
                        <p className="text-sm text-gray-500">
                          {expense.vendor} • {new Date(expense.transactionDate).toLocaleDateString()}
                        </p>
                        <Badge variant="outline" className="mt-1">
                          {expense.category}
                        </Badge>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-mono font-bold">${expense.amount.toFixed(2)}</p>
                        <Badge className="bg-yellow-100 text-yellow-700">Unattributed</Badge>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="outline">Assign to Event</Button>
                      <Button size="sm" variant="ghost">Mark as Non-Event</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="venues">
          <Card>
            {venuePerformance.length === 0 ? (
              <div className="p-8 text-center">
                <MapPin className="mx-auto h-12 w-12 text-gray-300" />
                <h3 className="mt-4 text-lg font-medium text-gray-900">No venue data</h3>
                <p className="mt-1 text-gray-500">
                  Venue performance metrics will appear once events are completed.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Venue</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Events</TableHead>
                    <TableHead className="text-right">Avg Sign-ups</TableHead>
                    <TableHead className="text-right">Total Revenue</TableHead>
                    <TableHead className="text-right">Avg Profit</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {venuePerformance.map((venue, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{venue.venue}</TableCell>
                      <TableCell>{venue.city}, {venue.state}</TableCell>
                      <TableCell className="text-right">{venue.totalEvents}</TableCell>
                      <TableCell className="text-right">{venue.avgSignupsPerEvent.toFixed(1)}</TableCell>
                      <TableCell className="text-right font-mono">
                        ${venue.totalRevenue.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        ${venue.avgProfit.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={venue.profitMargin >= 0.2 ? 'text-green-600' : 'text-yellow-600'}>
                          {(venue.profitMargin * 100).toFixed(1)}%
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
