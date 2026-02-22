'use client';

import { useState, useEffect } from 'react';
import { eventsApi } from '@/lib/api';
import type { EventBudgetData } from '@/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DollarSign, Save, Loader2, TrendingUp, TrendingDown } from 'lucide-react';

interface EventBudgetSectionProps {
  eventId: string;
  eventStatus: string;
}

interface ActualsData {
  actualSignups?: number;
  actualRevenue?: number;
  actualStaff?: number;
  actualReimbursements?: number;
  actualRewards?: number;
  actualBase?: number;
  actualBonusKickback?: number;
  actualParking?: number;
  actualSetup?: number;
  actualAdditional1?: number;
  actualAdditional2?: number;
  actualAdditional3?: number;
  actualTotal?: number;
}

// Calculate variance percentage
function getVariance(budget: number, actual: number): number {
  if (budget === 0) return actual > 0 ? 100 : 0;
  return ((actual - budget) / budget) * 100;
}

// Get variance styling
function getVarianceClass(variance: number): string {
  const absVariance = Math.abs(variance);
  if (absVariance > 20) return variance > 0 ? 'text-red-600 font-bold' : 'text-green-600 font-bold';
  if (absVariance > 10) return variance > 0 ? 'text-orange-500' : 'text-green-500';
  return 'text-gray-600';
}

export function EventBudgetSection({ eventId, eventStatus }: EventBudgetSectionProps) {
  const [budget, setBudget] = useState<EventBudgetData>({});
  const [actuals, setActuals] = useState<ActualsData>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const isCompleted = eventStatus === 'completed';

  useEffect(() => {
    loadBudget();
  }, [eventId]);

  async function loadBudget() {
    try {
      const res = await eventsApi.getBudget(eventId);
      if (res.data) {
        setBudget(res.data);
        // For completed events, actuals are included in budget response
        if (isCompleted && res.data) {
          setActuals({
            actualSignups: res.data.actualSignups,
            actualRevenue: res.data.actualRevenue,
            actualStaff: res.data.actualStaff,
            actualReimbursements: res.data.actualReimbursements,
            actualRewards: res.data.actualRewards,
            actualBase: res.data.actualBase,
            actualBonusKickback: res.data.actualBonusKickback,
            actualParking: res.data.actualParking,
            actualSetup: res.data.actualSetup,
            actualAdditional1: res.data.actualAdditional1,
            actualAdditional2: res.data.actualAdditional2,
            actualAdditional3: res.data.actualAdditional3,
            actualTotal: res.data.actualTotal,
          });
        }
      }
    } catch (error) {
      console.error('Failed to load budget:', error);
    } finally {
      setLoading(false);
    }
  }

  async function saveBudget() {
    setSaving(true);
    try {
      // Ensure all numeric fields are actual numbers before sending
      const sanitizedBudget = {
        ...budget,
        budgetStaff: Number(budget.budgetStaff) || 0,
        budgetReimbursements: Number(budget.budgetReimbursements) || 0,
        budgetRewards: Number(budget.budgetRewards) || 0,
        budgetBase: Number(budget.budgetBase) || 0,
        budgetBonusKickback: Number(budget.budgetBonusKickback) || 0,
        budgetParking: Number(budget.budgetParking) || 0,
        budgetSetup: Number(budget.budgetSetup) || 0,
        budgetAdditional1: Number(budget.budgetAdditional1) || 0,
        budgetAdditional2: Number(budget.budgetAdditional2) || 0,
        budgetAdditional3: Number(budget.budgetAdditional3) || 0,
        budgetAdditional4: Number(budget.budgetAdditional4) || 0,
        projectedSignups: Number(budget.projectedSignups) || 0,
        projectedRevenue: Number(budget.projectedRevenue) || 0,
      };
      const res = await eventsApi.updateBudget(eventId, sanitizedBudget);
      if (res.data) {
        setBudget(res.data);
      }
      setHasChanges(false);
      // Visual feedback
      const btn = document.querySelector('[data-save-budget]');
      if (btn) {
        btn.textContent = '✓ Saved';
        setTimeout(() => { btn.textContent = 'Save'; }, 2000);
      }
    } catch (error: unknown) {
      console.error('Failed to save budget:', error);
      alert('Failed to save budget: ' + ((error as Error).message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  }

  function updateField(field: keyof EventBudgetData, value: number | string) {
    setBudget(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  }

  // Calculate totals - use Number() to ensure numeric addition, not string concatenation
  const toNum = (v: unknown) => Number(v) || 0;
  const budgetTotal = toNum(budget.budgetStaff) + toNum(budget.budgetReimbursements) +
    toNum(budget.budgetRewards) + toNum(budget.budgetBase) + toNum(budget.budgetBonusKickback) +
    toNum(budget.budgetParking) + toNum(budget.budgetSetup) + toNum(budget.budgetAdditional1) +
    toNum(budget.budgetAdditional2) + toNum(budget.budgetAdditional3) + toNum(budget.budgetAdditional4);
  
  const projectedProfit = toNum(budget.projectedRevenue) - budgetTotal;

  if (loading) {
    return (
      <Card className="p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          Budget & Financials
        </h3>
        {hasChanges && (
          <Button onClick={saveBudget} disabled={saving} size="sm" data-save-budget>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            <span>Save</span>
          </Button>
        )}
      </div>

      <div className="space-y-4">
        {/* Projections */}
        <div className="border-b pb-4">
          <h4 className="text-sm font-medium text-gray-500 mb-3">Projections</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500">Projected Signups</label>
              <Input
                type="number"
                value={budget.projectedSignups || ''}
                onChange={(e) => updateField('projectedSignups', parseInt(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Projected Revenue</label>
              <Input
                type="number"
                value={budget.projectedRevenue || ''}
                onChange={(e) => updateField('projectedRevenue', parseFloat(e.target.value) || 0)}
                placeholder="0.00"
              />
            </div>
          </div>
        </div>

        {/* Budget Line Items */}
        <div className="border-b pb-4">
          <h4 className="text-sm font-medium text-gray-500 mb-3">Budget</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500">Staff</label>
              <Input
                type="number"
                value={budget.budgetStaff || ''}
                onChange={(e) => updateField('budgetStaff', parseFloat(e.target.value) || 0)}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Reimbursements</label>
              <Input
                type="number"
                value={budget.budgetReimbursements || ''}
                onChange={(e) => updateField('budgetReimbursements', parseFloat(e.target.value) || 0)}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Rewards</label>
              <Input
                type="number"
                value={budget.budgetRewards || ''}
                onChange={(e) => updateField('budgetRewards', parseFloat(e.target.value) || 0)}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Base</label>
              <Input
                type="number"
                value={budget.budgetBase || ''}
                onChange={(e) => updateField('budgetBase', parseFloat(e.target.value) || 0)}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Bonus/Kickback</label>
              <Input
                type="number"
                value={budget.budgetBonusKickback || ''}
                onChange={(e) => updateField('budgetBonusKickback', parseFloat(e.target.value) || 0)}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Parking</label>
              <Input
                type="number"
                value={budget.budgetParking || ''}
                onChange={(e) => updateField('budgetParking', parseFloat(e.target.value) || 0)}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Setup</label>
              <Input
                type="number"
                value={budget.budgetSetup || ''}
                onChange={(e) => updateField('budgetSetup', parseFloat(e.target.value) || 0)}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Other 1</label>
              <Input
                type="number"
                value={budget.budgetAdditional1 || ''}
                onChange={(e) => updateField('budgetAdditional1', parseFloat(e.target.value) || 0)}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Other 2</label>
              <Input
                type="number"
                value={budget.budgetAdditional2 || ''}
                onChange={(e) => updateField('budgetAdditional2', parseFloat(e.target.value) || 0)}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Other 3</label>
              <Input
                type="number"
                value={budget.budgetAdditional3 || ''}
                onChange={(e) => updateField('budgetAdditional3', parseFloat(e.target.value) || 0)}
                placeholder="0.00"
              />
            </div>
          </div>
        </div>

        {/* Totals */}
        <div className="space-y-2">
          {/* Header row for completed events */}
          {isCompleted && (
            <div className="grid grid-cols-4 gap-2 text-xs text-gray-500 font-medium border-b pb-1">
              <span></span>
              <span className="text-right">Budget</span>
              <span className="text-right">Actual</span>
              <span className="text-right">Variance</span>
            </div>
          )}
          
          {/* Cost Total Row */}
          <div className={`${isCompleted ? 'grid grid-cols-4 gap-2' : 'flex justify-between'} text-sm`}>
            <span className="text-gray-500">Cost Total</span>
            <span className={`font-mono font-medium ${isCompleted ? 'text-right' : ''}`}>
              ${budgetTotal.toLocaleString()}
            </span>
            {isCompleted && (
              <>
                <span className="font-mono font-medium text-right">
                  ${(actuals.actualTotal || 0).toLocaleString()}
                </span>
                <span className={`font-mono text-right ${getVarianceClass(getVariance(budgetTotal, actuals.actualTotal || 0))}`}>
                  {getVariance(budgetTotal, actuals.actualTotal || 0) > 0 ? '+' : ''}
                  {getVariance(budgetTotal, actuals.actualTotal || 0).toFixed(1)}%
                  {Math.abs(getVariance(budgetTotal, actuals.actualTotal || 0)) > 20 && (
                    getVariance(budgetTotal, actuals.actualTotal || 0) > 0 
                      ? <TrendingUp className="inline h-3 w-3 ml-1" />
                      : <TrendingDown className="inline h-3 w-3 ml-1" />
                  )}
                </span>
              </>
            )}
          </div>
          
          {/* Revenue Row */}
          <div className={`${isCompleted ? 'grid grid-cols-4 gap-2' : 'flex justify-between'} text-sm`}>
            <span className="text-gray-500">{isCompleted ? 'Revenue' : 'Projected Revenue'}</span>
            <span className={`font-mono font-medium ${isCompleted ? 'text-right' : ''}`}>
              ${(budget.projectedRevenue || 0).toLocaleString()}
            </span>
            {isCompleted && (
              <>
                <span className="font-mono font-medium text-right">
                  ${(actuals.actualRevenue || 0).toLocaleString()}
                </span>
                <span className={`font-mono text-right ${getVarianceClass(-getVariance(budget.projectedRevenue || 0, actuals.actualRevenue || 0))}`}>
                  {getVariance(budget.projectedRevenue || 0, actuals.actualRevenue || 0) > 0 ? '+' : ''}
                  {getVariance(budget.projectedRevenue || 0, actuals.actualRevenue || 0).toFixed(1)}%
                </span>
              </>
            )}
          </div>
          
          {/* Profit Row */}
          <div className={`${isCompleted ? 'grid grid-cols-4 gap-2' : 'flex justify-between'} text-sm border-t pt-2`}>
            <span className="font-medium">{isCompleted ? 'Profit' : 'Projected Profit'}</span>
            <span className={`font-mono font-bold ${isCompleted ? 'text-right' : ''} ${projectedProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {projectedProfit >= 0 ? '+' : ''}${projectedProfit.toLocaleString()}
            </span>
            {isCompleted && (
              <>
                {(() => {
                  const actualProfit = (actuals.actualRevenue || 0) - (actuals.actualTotal || 0);
                  return (
                    <>
                      <span className={`font-mono font-bold text-right ${actualProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {actualProfit >= 0 ? '+' : ''}${actualProfit.toLocaleString()}
                      </span>
                      <span className={`font-mono text-right ${getVarianceClass(-getVariance(projectedProfit, actualProfit))}`}>
                        {getVariance(projectedProfit, actualProfit) > 0 ? '+' : ''}
                        {projectedProfit !== 0 ? getVariance(projectedProfit, actualProfit).toFixed(1) + '%' : '—'}
                      </span>
                    </>
                  );
                })()}
              </>
            )}
          </div>
          
          {/* Signups comparison for completed events */}
          {isCompleted && (
            <div className="grid grid-cols-4 gap-2 text-sm pt-2 border-t">
              <span className="text-gray-500">Signups</span>
              <span className="font-mono text-right">{budget.projectedSignups || 0}</span>
              <span className="font-mono text-right">{actuals.actualSignups || 0}</span>
              <span className={`font-mono text-right ${getVarianceClass(-getVariance(budget.projectedSignups || 0, actuals.actualSignups || 0))}`}>
                {getVariance(budget.projectedSignups || 0, actuals.actualSignups || 0) > 0 ? '+' : ''}
                {getVariance(budget.projectedSignups || 0, actuals.actualSignups || 0).toFixed(1)}%
              </span>
            </div>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs text-gray-500">Notes</label>
          <textarea
            className="w-full mt-1 px-3 py-2 border rounded-md text-sm"
            rows={2}
            value={budget.notes || ''}
            onChange={(e) => updateField('notes', e.target.value)}
            placeholder="Budget notes..."
          />
        </div>
      </div>
    </Card>
  );
}
