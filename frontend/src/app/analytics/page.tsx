'use client';

import { useEffect, useState } from 'react';
import { analyticsApi } from '@/lib/api';
import type { DashboardMetrics, AuditLogEntry } from '@/types';
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
  BarChart3, 
  TrendingUp, 
  Users, 
  Calendar,
  Download,
  Search,
  FileText,
  Activity
} from 'lucide-react';

export default function AnalyticsPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [logFilters, setLogFilters] = useState({
    entityType: '',
    startDate: '',
    endDate: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const metricsRes = await analyticsApi.getKPIs();
      setMetrics(metricsRes.data);
      // TODO: Audit logs endpoint not yet implemented as standalone in backend
      // Audit entries are available per-signup via signupsApi.getAuditLog(id)
      setAuditLogs([]);
    } catch (error) {
      console.error('Failed to load analytics:', error);
    } finally {
      setLoading(false);
    }
  }

  async function exportData(type: 'operators' | 'signups' | 'payroll', format: 'csv' | 'json') {
    try {
      // Default to last 30 days for exports
      const to = new Date().toISOString().split('T')[0];
      const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const res = await analyticsApi.exportData(type, from, to, format);
      // Backend returns file content directly, handle accordingly
      if (res.data) {
        console.log('Export data received:', res.data);
      }
    } catch (error) {
      console.error('Failed to export:', error);
    }
  }

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Analytics & Reporting</h1>
          <p className="text-gray-600">Performance insights and audit logs</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => exportData('signups', 'csv')}>
            <Download className="mr-2 h-4 w-4" />
            Export Sign-ups
          </Button>
          <Button variant="outline" onClick={() => exportData('payroll', 'csv')}>
            <Download className="mr-2 h-4 w-4" />
            Export Payroll
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-blue-100 p-2">
              <Calendar className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Events</p>
              <p className="text-2xl font-bold">{metrics?.totalEvents || 0}</p>
              <p className="text-xs text-green-600">{metrics?.activeEvents || 0} active</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-green-100 p-2">
              <FileText className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Sign-ups</p>
              <p className="text-2xl font-bold">{metrics?.totalSignups?.toLocaleString() || 0}</p>
              <p className="text-xs text-gray-500">
                {metrics?.avgSignupsPerEvent?.toFixed(1) || 0} avg/event
              </p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-purple-100 p-2">
              <TrendingUp className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Revenue</p>
              <p className="text-2xl font-bold">${metrics?.totalRevenue?.toLocaleString() || 0}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-yellow-100 p-2">
              <Activity className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Net Profit</p>
              <p className={`text-2xl font-bold ${(metrics?.netProfit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${metrics?.netProfit?.toLocaleString() || 0}
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Tabs defaultValue="performance">
        <TabsList>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="ambassadors">Top Ambassadors</TabsTrigger>
          <TabsTrigger value="operators">Top Operators</TabsTrigger>
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
        </TabsList>

        <TabsContent value="performance">
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Sign-up Trends
              </h3>
              <div className="h-64 flex items-center justify-center bg-gray-50 rounded">
                <p className="text-gray-400">Chart visualization coming soon</p>
              </div>
            </Card>
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Revenue Trends
              </h3>
              <div className="h-64 flex items-center justify-center bg-gray-50 rounded">
                <p className="text-gray-400">Chart visualization coming soon</p>
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="ambassadors">
          <Card>
            {!metrics?.topPerformingAmbassadors?.length ? (
              <div className="p-8 text-center">
                <Users className="mx-auto h-12 w-12 text-gray-300" />
                <h3 className="mt-4 text-lg font-medium text-gray-900">No ambassador data</h3>
                <p className="mt-1 text-gray-500">Top performers will appear once sign-ups are recorded.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rank</TableHead>
                    <TableHead>Ambassador</TableHead>
                    <TableHead>Skill Level</TableHead>
                    <TableHead className="text-right">Sign-ups</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.topPerformingAmbassadors.map((item, i) => (
                    <TableRow key={item.ambassador.id}>
                      <TableCell>
                        <span className={`font-bold ${i < 3 ? 'text-yellow-500' : ''}`}>
                          #{i + 1}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium">
                        {item.ambassador.firstName} {item.ambassador.lastName}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {item.ambassador.skillLevel}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold">
                        {item.signups}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="operators">
          <Card>
            {!metrics?.topPerformingOperators?.length ? (
              <div className="p-8 text-center">
                <BarChart3 className="mx-auto h-12 w-12 text-gray-300" />
                <h3 className="mt-4 text-lg font-medium text-gray-900">No operator data</h3>
                <p className="mt-1 text-gray-500">Top operators will appear once sign-ups are recorded.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rank</TableHead>
                    <TableHead>Operator</TableHead>
                    <TableHead className="text-right">Sign-ups</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.topPerformingOperators.map((item, i) => (
                    <TableRow key={item.operator.id}>
                      <TableCell>
                        <span className={`font-bold ${i < 3 ? 'text-yellow-500' : ''}`}>
                          #{i + 1}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium">
                        {item.operator.name}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {item.signups}
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-green-600">
                        ${item.revenue.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card className="mb-4 p-4">
            <div className="flex gap-4">
              <select
                className="rounded-md border px-3 py-2"
                value={logFilters.entityType}
                onChange={(e) => setLogFilters({ ...logFilters, entityType: e.target.value })}
              >
                <option value="">All Entity Types</option>
                <option value="event">Events</option>
                <option value="ambassador">Ambassadors</option>
                <option value="signup">Sign-ups</option>
                <option value="operator">Operators</option>
                <option value="cpa_rate">CPA Rates</option>
                <option value="payroll">Payroll</option>
              </select>
              <Input
                type="date"
                value={logFilters.startDate}
                onChange={(e) => setLogFilters({ ...logFilters, startDate: e.target.value })}
                className="w-auto"
              />
              <Input
                type="date"
                value={logFilters.endDate}
                onChange={(e) => setLogFilters({ ...logFilters, endDate: e.target.value })}
                className="w-auto"
              />
              <Button variant="outline" onClick={loadData}>
                <Search className="mr-2 h-4 w-4" />
                Search
              </Button>
            </div>
          </Card>
          <Card>
            {auditLogs.length === 0 ? (
              <div className="p-8 text-center">
                <FileText className="mx-auto h-12 w-12 text-gray-300" />
                <h3 className="mt-4 text-lg font-medium text-gray-900">No audit logs</h3>
                <p className="mt-1 text-gray-500">Activity logs will appear here.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm">
                        {new Date(log.timestamp).toLocaleString()}
                      </TableCell>
                      <TableCell>{log.userName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{log.action}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {log.entityType} #{log.entityId.slice(0, 8)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm">View</Button>
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
