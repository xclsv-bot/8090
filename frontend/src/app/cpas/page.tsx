'use client';

import { useEffect, useState } from 'react';
import { cpaApi, operatorsApi } from '@/lib/api';
import type { CpaRate, Operator, ValidationData } from '@/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, DollarSign, TrendingDown, History, AlertCircle } from 'lucide-react';

export default function CpaPage() {
  const [rates, setRates] = useState<CpaRate[]>([]);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [validationData, setValidationData] = useState<ValidationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOperator, setSelectedOperator] = useState<string>('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newRate, setNewRate] = useState({
    operatorId: '',
    state: '',
    amount: '',
    effectiveDate: new Date().toISOString().split('T')[0],
    isDefault: false,
  });

  useEffect(() => {
    loadData();
  }, [selectedOperator]);

  async function loadData() {
    try {
      // Load operators first
      const opsRes = await operatorsApi.list();
      setOperators(opsRes.data || []);

      // Load rates (optionally filtered by operator)
      const ratesRes = selectedOperator
        ? await cpaApi.getByOperator(parseInt(selectedOperator))
        : await cpaApi.list();
      setRates(ratesRes.data || []);

      // TODO: Validation data endpoint not yet implemented in backend
      // setValidationData([]);
    } catch (error) {
      console.error('Failed to load CPA data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function createRate() {
    try {
      await cpaApi.create({
        ...newRate,
        amount: parseFloat(newRate.amount),
      });
      setShowAddDialog(false);
      setNewRate({
        operatorId: '',
        state: '',
        amount: '',
        effectiveDate: new Date().toISOString().split('T')[0],
        isDefault: false,
      });
      loadData();
    } catch (error) {
      console.error('Failed to create rate:', error);
    }
  }

  // Calculate stats
  const avgCpa = rates.length > 0
    ? rates.reduce((sum, r) => sum + r.amount, 0) / rates.length
    : 0;
  
  const pendingValidations = validationData.filter(v => v.status === 'pending').length;
  
  const avgDropOff = validationData.length > 0
    ? validationData.reduce((sum, v) => sum + v.dropOffRate, 0) / validationData.length
    : 0;

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">CPA Management</h1>
          <p className="text-gray-600">Configure rates and validate operator data</p>
        </div>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Rate
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add CPA Rate</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <label className="text-sm font-medium">Operator</label>
                <select
                  className="w-full rounded-md border px-3 py-2"
                  value={newRate.operatorId}
                  onChange={(e) => setNewRate({ ...newRate, operatorId: e.target.value })}
                >
                  <option value="">Select operator...</option>
                  {operators.map(op => (
                    <option key={op.id} value={op.id}>{op.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">State (optional)</label>
                <Input
                  value={newRate.state}
                  onChange={(e) => setNewRate({ ...newRate, state: e.target.value.toUpperCase() })}
                  placeholder="e.g., NJ (leave blank for default)"
                  maxLength={2}
                />
              </div>
              <div>
                <label className="text-sm font-medium">CPA Amount ($)</label>
                <Input
                  type="number"
                  value={newRate.amount}
                  onChange={(e) => setNewRate({ ...newRate, amount: e.target.value })}
                  placeholder="e.g., 150"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Effective Date</label>
                <Input
                  type="date"
                  value={newRate.effectiveDate}
                  onChange={(e) => setNewRate({ ...newRate, effectiveDate: e.target.value })}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isDefault"
                  checked={newRate.isDefault}
                  onChange={(e) => setNewRate({ ...newRate, isDefault: e.target.checked })}
                />
                <label htmlFor="isDefault" className="text-sm">Set as default rate for this operator</label>
              </div>
              <Button onClick={createRate} className="w-full">Create Rate</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-green-100 p-2">
              <DollarSign className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Avg CPA</p>
              <p className="text-2xl font-bold">${avgCpa.toFixed(0)}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-blue-100 p-2">
              <History className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Active Rates</p>
              <p className="text-2xl font-bold">{rates.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-yellow-100 p-2">
              <AlertCircle className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Pending Validations</p>
              <p className="text-2xl font-bold">{pendingValidations}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-red-100 p-2">
              <TrendingDown className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Avg Drop-off</p>
              <p className="text-2xl font-bold">{(avgDropOff * 100).toFixed(1)}%</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filter */}
      <Card className="mb-6 p-4">
        <div className="flex gap-4">
          <select
            className="rounded-md border px-3 py-2"
            value={selectedOperator}
            onChange={(e) => setSelectedOperator(e.target.value)}
          >
            <option value="">All Operators</option>
            {operators.map(op => (
              <option key={op.id} value={op.id}>{op.name}</option>
            ))}
          </select>
        </div>
      </Card>

      <Tabs defaultValue="rates">
        <TabsList>
          <TabsTrigger value="rates">CPA Rates</TabsTrigger>
          <TabsTrigger value="validation">Validation Data</TabsTrigger>
          <TabsTrigger value="dropoff">Drop-off Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="rates">
          <Card>
            {loading ? (
              <div className="p-8 text-center text-gray-500">Loading rates...</div>
            ) : rates.length === 0 ? (
              <div className="p-8 text-center">
                <DollarSign className="mx-auto h-12 w-12 text-gray-300" />
                <h3 className="mt-4 text-lg font-medium text-gray-900">No CPA rates configured</h3>
                <p className="mt-1 text-gray-500">Add rates to track operator compensation.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Operator</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Effective Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rates.map((rate) => (
                    <TableRow key={rate.id}>
                      <TableCell className="font-medium">{rate.operatorName}</TableCell>
                      <TableCell>{rate.state || 'All States'}</TableCell>
                      <TableCell className="font-mono">${rate.amount.toFixed(2)}</TableCell>
                      <TableCell>{new Date(rate.effectiveDate).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Badge variant={rate.isDefault ? 'default' : 'outline'}>
                          {rate.isDefault ? 'Default' : 'Override'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm">Edit</Button>
                        <Button variant="ghost" size="sm">History</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="validation">
          <Card>
            {validationData.length === 0 ? (
              <div className="p-8 text-center">
                <AlertCircle className="mx-auto h-12 w-12 text-gray-300" />
                <h3 className="mt-4 text-lg font-medium text-gray-900">No validation data</h3>
                <p className="mt-1 text-gray-500">Validation data will appear after monthly reconciliation.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead>Reported</TableHead>
                    <TableHead>Confirmed</TableHead>
                    <TableHead>Rejected</TableHead>
                    <TableHead>Drop-off</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {validationData.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">{v.month}</TableCell>
                      <TableCell>{v.reportedSignups}</TableCell>
                      <TableCell className="text-green-600">{v.confirmedSignups}</TableCell>
                      <TableCell className="text-red-600">{v.rejectedSignups}</TableCell>
                      <TableCell>
                        <span className={v.dropOffRate > 0.2 ? 'text-red-600 font-medium' : ''}>
                          {(v.dropOffRate * 100).toFixed(1)}%
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={v.status === 'reconciled' ? 'default' : 'outline'}>
                          {v.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="dropoff">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Drop-off Analysis</h3>
            <p className="text-gray-500">
              Drop-off analysis helps identify tracking issues and discrepancies between 
              reported and confirmed sign-ups. High drop-off rates may indicate:
            </p>
            <ul className="mt-4 space-y-2 text-sm text-gray-600">
              <li>• Invalid customer information submitted</li>
              <li>• Duplicate sign-ups being rejected</li>
              <li>• Operator attribution issues</li>
              <li>• Technical tracking problems</li>
            </ul>
            <div className="mt-6 p-4 bg-yellow-50 rounded-lg">
              <p className="text-sm text-yellow-800">
                <strong>Tip:</strong> Operators with drop-off rates above 20% should be 
                investigated. Check validation data for patterns.
              </p>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
