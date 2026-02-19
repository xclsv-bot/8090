'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { eventsApi, ambassadorsApi, signupsApi, healthApi } from '@/lib/api';
import { useWebSocket } from '@/hooks/useWebSocket';
import { Calendar, Users, FileSignature, Activity } from 'lucide-react';

interface Stats {
  events: number;
  ambassadors: number;
  signups: number;
  health: string;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({ events: 0, ambassadors: 0, signups: 0, health: 'checking...' });
  const [loading, setLoading] = useState(true);
  const { subscribe, isConnected } = useWebSocket();

  const loadStats = useCallback(async () => {
    try {
      const [events, ambassadors, signups, health] = await Promise.all([
        eventsApi.list().catch(() => ({ data: [], meta: { total: 0 } })),
        ambassadorsApi.list().catch(() => ({ data: [], meta: { total: 0 } })),
        signupsApi.list().catch(() => ({ data: [], meta: { total: 0 } })),
        healthApi.check().catch(() => ({ data: { status: 'error' } })),
      ]);

      setStats({
        events: events.meta?.total || events.data?.length || 0,
        ambassadors: ambassadors.meta?.total || ambassadors.data?.length || 0,
        signups: signups.meta?.total || signups.data?.length || 0,
        health: health.data?.status || 'unknown',
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Subscribe to all events for dashboard refresh
  useEffect(() => {
    const unsub = subscribe('*', () => {
      loadStats();
    });
    return () => unsub();
  }, [subscribe, loadStats]);

  const statCards = [
    { name: 'Total Events', value: stats.events, icon: Calendar, color: 'text-blue-600' },
    { name: 'Ambassadors', value: stats.ambassadors, icon: Users, color: 'text-green-600' },
    { name: 'Sign-ups', value: stats.signups, icon: FileSignature, color: 'text-purple-600' },
    { name: 'API Status', value: stats.health, icon: Activity, color: stats.health === 'ok' ? 'text-green-600' : 'text-red-600' },
  ];

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">XCLSV Core Platform Overview</p>
        </div>
        <Badge className={isConnected ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}>
          {isConnected ? "● Live" : "○ Offline"}
        </Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.name} className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{stat.name}</p>
                <p className={`mt-1 text-3xl font-bold ${stat.color}`}>
                  {loading ? '...' : stat.value}
                </p>
              </div>
              <div className={`rounded-full bg-gray-100 p-3 ${stat.color}`}>
                <stat.icon className="h-6 w-6" />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Recent Events</h2>
          <p className="text-gray-500 text-sm">No events yet. Create your first event to get started.</p>
        </Card>
        <Card className="p-6">
          <h2 className="text-lg font-semibold mb-4">Recent Sign-ups</h2>
          <p className="text-gray-500 text-sm">No sign-ups yet. Sign-ups will appear here once recorded.</p>
        </Card>
      </div>

      <div className="mt-8">
        <Card className="p-6 border-blue-200 bg-blue-50">
          <h2 className="text-lg font-semibold text-blue-900 mb-2">🧪 Experimental Build</h2>
          <p className="text-blue-700 text-sm">
            This dashboard is connected to the 8090.ai-built backend at{' '}
            <code className="bg-blue-100 px-1 rounded">xclsv-core-platform.onrender.com</code>.
            It runs in parallel with Events Portal V2 for comparison testing.
          </p>
        </Card>
      </div>
    </div>
  );
}
