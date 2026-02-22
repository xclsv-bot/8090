'use client';

import { useState, useEffect } from 'react';
import { eventsApi } from '@/lib/api';
import type { EventBudgetData } from '@/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DollarSign, Save, Loader2 } from 'lucide-react';

interface EventBudgetSectionProps {
  eventId: string;
  eventStatus: string;
}

export function EventBudgetSection({ eventId, eventStatus }: EventBudgetSectionProps) {
  const [budget, setBudget] = useState<EventBudgetData>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    loadBudget();
  }, [eventId]);

  async function loadBudget() {
    try {
      const res = await eventsApi.getBudget(eventId);
      if (res.data) {
        setBudget(res.data);
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
  const isCompleted = eventStatus === 'completed';

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
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Budget Total</span>
            <span className="font-mono font-medium">${budgetTotal.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Projected Revenue</span>
            <span className="font-mono font-medium">${(budget.projectedRevenue || 0).toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm border-t pt-2">
            <span className="font-medium">Projected Profit</span>
            <span className={`font-mono font-bold ${projectedProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {projectedProfit >= 0 ? '+' : ''}${projectedProfit.toLocaleString()}
            </span>
          </div>
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
