'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ambassadorsApi, assignmentsApi } from '@/lib/api';
import type { Ambassador } from '@/types';
import type { EventAssignment } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, User, Mail, Phone, Calendar, DollarSign, Loader2 } from 'lucide-react';
import Link from 'next/link';

const skillLevelColors: Record<string, string> = {
  trainee: 'bg-gray-100 text-gray-700',
  standard: 'bg-blue-100 text-blue-700',
  senior: 'bg-green-100 text-green-700',
  lead: 'bg-purple-100 text-purple-700',
};

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-700',
  suspended: 'bg-red-100 text-red-700',
};

export default function AmbassadorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [ambassador, setAmbassador] = useState<Ambassador | null>(null);
  const [assignments, setAssignments] = useState<EventAssignment[]>([]);
  const [performance, setPerformance] = useState<{ signups: number; events: number; earnings: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) loadData();
  }, [id]);

  async function loadData() {
    try {
      const [ambRes, assignRes, perfRes] = await Promise.all([
        ambassadorsApi.get(id),
        assignmentsApi.getByAmbassador ? assignmentsApi.getByAmbassador(id) : Promise.resolve({ data: [] }),
        ambassadorsApi.getPerformance(id).catch(() => ({ data: null })),
      ]);
      
      setAmbassador(ambRes.data || null);
      setAssignments(assignRes.data || []);
      setPerformance(perfRes.data || null);
    } catch (error) {
      console.error('Failed to load ambassador:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!ambassador) {
    return (
      <div className="p-6">
        <p className="text-gray-500">Ambassador not found</p>
        <Button variant="outline" onClick={() => router.back()} className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Go Back
        </Button>
      </div>
    );
  }

  const fullName = `${ambassador.firstName || ''} ${ambassador.lastName || ''}`.trim();

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{fullName}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge className={statusColors[ambassador.status] || 'bg-gray-100'}>
              {ambassador.status}
            </Badge>
            <Badge className={skillLevelColors[ambassador.skillLevel] || 'bg-gray-100'}>
              {ambassador.skillLevel}
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="md:col-span-2 space-y-6">
          {/* Contact Info */}
          <Card className="p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <User className="h-5 w-5" />
              Contact Information
            </h3>
            <div className="space-y-3">
              {ambassador.email && (
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-gray-400" />
                  <a href={`mailto:${ambassador.email}`} className="text-blue-600 hover:underline">
                    {ambassador.email}
                  </a>
                </div>
              )}
              {ambassador.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-gray-400" />
                  <a href={`tel:${ambassador.phone}`} className="text-blue-600 hover:underline">
                    {ambassador.phone}
                  </a>
                </div>
              )}
            </div>
          </Card>

          {/* Compensation */}
          <Card className="p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Compensation
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-500">Type</span>
                <span className="font-medium">{ambassador.compensationType?.replace('_', ' ')}</span>
              </div>
              {ambassador.hourlyRate && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Hourly Rate</span>
                  <span className="font-medium">${ambassador.hourlyRate}/hr</span>
                </div>
              )}
              {ambassador.perSignupRate && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Per Signup Rate</span>
                  <span className="font-medium">${ambassador.perSignupRate}/signup</span>
                </div>
              )}
            </div>
          </Card>

          {/* Upcoming Assignments */}
          <Card className="p-6">
            <h3 className="font-semibold mb-4 flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Upcoming Events
            </h3>
            {assignments.length === 0 ? (
              <p className="text-sm text-gray-500">No upcoming events</p>
            ) : (
              <div className="space-y-2">
                {assignments.slice(0, 5).map((a: any) => (
                  <Link
                    key={a.id}
                    href={`/events/${a.eventId}`}
                    className="block p-3 bg-gray-50 rounded-lg hover:bg-gray-100"
                  >
                    <p className="font-medium text-sm">{a.eventTitle || 'Event'}</p>
                    <p className="text-xs text-gray-500">
                      {a.eventDate ? new Date(a.eventDate).toLocaleDateString() : ''} • {a.city || ''}, {a.state || ''}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Sidebar - Stats */}
        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="font-semibold mb-4">Performance</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-500">Total Signups</span>
                <span className="font-bold text-lg">{performance?.signups || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Events Worked</span>
                <span className="font-bold text-lg">{performance?.events || 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Total Earnings</span>
                <span className="font-bold text-lg text-green-600">
                  ${(performance?.earnings || 0).toLocaleString()}
                </span>
              </div>
            </div>
          </Card>

          {ambassador.notes && (
            <Card className="p-6">
              <h3 className="font-semibold mb-2">Notes</h3>
              <p className="text-sm text-gray-600">{ambassador.notes}</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
