'use client';

import { useEffect, useState } from 'react';
import { operatorsApi } from '@/lib/api';
import type { Operator } from '@/types';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Search, Building2, AlertTriangle, TrendingUp, Users } from 'lucide-react';
import Link from 'next/link';

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-700',
  pending: 'bg-yellow-100 text-yellow-700',
  terminated: 'bg-red-100 text-red-700',
};

const categoryIcons: Record<string, string> = {
  sportsbook: '🏈',
  casino: '🎰',
  poker: '🃏',
  dfs: '📊',
};

export default function OperatorsPage() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newOperator, setNewOperator] = useState<{
    name: string;
    code: string;
    category: 'sportsbook' | 'casino' | 'poker' | 'dfs';
    partnershipStatus: 'active' | 'inactive' | 'pending' | 'terminated';
  }>({
    name: '',
    code: '',
    category: 'sportsbook',
    partnershipStatus: 'active',
  });

  useEffect(() => {
    loadOperators();
  }, [statusFilter]);

  async function loadOperators() {
    try {
      const params: Record<string, string> = {};
      if (statusFilter) params.status = statusFilter;
      const res = await operatorsApi.list(params);
      setOperators(res.data || []);
    } catch (error) {
      console.error('Failed to load operators:', error);
    } finally {
      setLoading(false);
    }
  }

  async function createOperator() {
    try {
      await operatorsApi.create(newOperator);
      setShowCreateDialog(false);
      setNewOperator({ name: '', code: '', category: 'sportsbook', partnershipStatus: 'active' });
      loadOperators();
    } catch (error) {
      console.error('Failed to create operator:', error);
    }
  }

  const filteredOperators = operators.filter(op =>
    op.name.toLowerCase().includes(search.toLowerCase()) ||
    op.code.toLowerCase().includes(search.toLowerCase())
  );

  // Check for expiring contracts (within 30 days)
  const expiringContracts = operators.filter(op => {
    if (!op.contractEndDate) return false;
    const daysUntilExpiry = Math.ceil(
      (new Date(op.contractEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );
    return daysUntilExpiry > 0 && daysUntilExpiry <= 30;
  });

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Operators</h1>
          <p className="text-gray-600">Manage sportsbook and casino operator partnerships</p>
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Operator
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Operator</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <label className="text-sm font-medium">Name</label>
                <Input
                  value={newOperator.name}
                  onChange={(e) => setNewOperator({ ...newOperator, name: e.target.value })}
                  placeholder="e.g., FanDuel"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Code</label>
                <Input
                  value={newOperator.code}
                  onChange={(e) => setNewOperator({ ...newOperator, code: e.target.value.toUpperCase() })}
                  placeholder="e.g., FD"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Category</label>
                <select
                  className="w-full rounded-md border px-3 py-2"
                  value={newOperator.category}
                  onChange={(e) => setNewOperator({ ...newOperator, category: e.target.value as 'sportsbook' | 'casino' | 'poker' | 'dfs' })}
                >
                  <option value="sportsbook">Sportsbook</option>
                  <option value="casino">Casino</option>
                  <option value="poker">Poker</option>
                  <option value="dfs">DFS</option>
                </select>
              </div>
              <Button onClick={createOperator} className="w-full">Create Operator</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Contract Expiration Alerts */}
      {expiringContracts.length > 0 && (
        <Card className="mb-6 border-yellow-200 bg-yellow-50 p-4">
          <div className="flex items-center gap-2 text-yellow-800">
            <AlertTriangle className="h-5 w-5" />
            <span className="font-medium">Contract Expiration Alerts</span>
          </div>
          <div className="mt-2 space-y-1">
            {expiringContracts.map(op => (
              <p key={op.id} className="text-sm text-yellow-700">
                <strong>{op.name}</strong> contract expires on {new Date(op.contractEndDate!).toLocaleDateString()}
              </p>
            ))}
          </div>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-blue-100 p-2">
              <Building2 className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Operators</p>
              <p className="text-2xl font-bold">{operators.length}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-green-100 p-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Active</p>
              <p className="text-2xl font-bold">
                {operators.filter(o => o.partnershipStatus === 'active').length}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-yellow-100 p-2">
              <Users className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Pending</p>
              <p className="text-2xl font-bold">
                {operators.filter(o => o.partnershipStatus === 'pending').length}
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-red-100 p-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Expiring Soon</p>
              <p className="text-2xl font-bold">{expiringContracts.length}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6 p-4">
        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input
              className="pl-10"
              placeholder="Search operators..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="rounded-md border px-3 py-2"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="inactive">Inactive</option>
            <option value="terminated">Terminated</option>
          </select>
        </div>
      </Card>

      {/* Operators Table */}
      <Card>
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading operators...</div>
        ) : filteredOperators.length === 0 ? (
          <div className="p-8 text-center">
            <Building2 className="mx-auto h-12 w-12 text-gray-300" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">No operators found</h3>
            <p className="mt-1 text-gray-500">
              {search ? 'Try adjusting your search.' : 'Add your first operator to get started.'}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Operator</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Contract</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Performance</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOperators.map((op) => (
                <TableRow key={op.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-lg">
                        {categoryIcons[op.category] || '🏢'}
                      </div>
                      <div>
                        <p className="font-medium">{op.name}</p>
                        <p className="text-sm text-gray-500">{op.code}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {op.category}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {op.contractEndDate ? (
                      <span className="text-sm">
                        Expires {new Date(op.contractEndDate).toLocaleDateString()}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">No contract</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColors[op.partnershipStatus]}>
                      {op.partnershipStatus}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {op.performanceSummary ? (
                      <div className="text-sm">
                        <p>{op.performanceSummary.totalSignups} signups</p>
                        <p className="text-gray-500">
                          {(op.performanceSummary.dropOffRate * 100).toFixed(1)}% drop-off
                        </p>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">No data</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/operators/${op.id}`}>
                      <Button variant="ghost" size="sm">View</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
