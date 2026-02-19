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

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [budgetsRes, expensesRes] = await Promise.all([
        financialApi.getBudgetReport(),
        financialApi.listExpenses(),
      ]);
      setBudgets(budgetsRes.data || []);
      setExpenses(expensesRes.data || []);

      // TODO: Venue performance endpoint not yet implemented in backend
      // try {
      //   const venuesRes = await financialApi.getVenuePerformance();
      //   setVenuePerformance(venuesRes.data || []);
      // } catch {
      //   // Endpoint might not exist
      // }
    } catch (error) {
      console.error('Failed to load financial data:', error);
    } finally {
      setLoading(false);
    }
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

  // Calculate totals
  const totalProjectedRevenue = budgets.reduce((sum, b) => sum + (b.projectedRevenue || 0), 0);
  const totalActualRevenue = budgets.reduce((sum, b) => sum + (b.actualRevenue || 0), 0);
  const totalProjectedExpenses = budgets.reduce((sum, b) => sum + (b.projectedExpenses || 0), 0);
  const totalActualExpenses = budgets.reduce((sum, b) => sum + (b.actualExpenses || 0), 0);
  const totalVariance = totalActualRevenue - totalProjectedRevenue;
  const unattributedExpenses = expenses.filter(e => e.status === 'unattributed').length;

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
          <Card>
            {loading ? (
              <div className="p-8 text-center text-gray-500">Loading budget data...</div>
            ) : budgets.length === 0 ? (
              <div className="p-8 text-center">
                <DollarSign className="mx-auto h-12 w-12 text-gray-300" />
                <h3 className="mt-4 text-lg font-medium text-gray-900">No budget data</h3>
                <p className="mt-1 text-gray-500">Budget data will appear once events have financial projections.</p>
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
                  {budgets.map((budget) => {
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
