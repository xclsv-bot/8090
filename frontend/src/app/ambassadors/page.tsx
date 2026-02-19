'use client';

import { useEffect, useState } from 'react';
import { ambassadorsApi } from '@/lib/api';
import type { Ambassador } from '@/types';
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
import { Plus, Users } from 'lucide-react';

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-700',
  suspended: 'bg-red-100 text-red-700',
};

const skillColors: Record<string, string> = {
  trainee: 'bg-yellow-100 text-yellow-700',
  standard: 'bg-blue-100 text-blue-700',
  senior: 'bg-purple-100 text-purple-700',
  lead: 'bg-indigo-100 text-indigo-700',
};

export default function AmbassadorsPage() {
  const [ambassadors, setAmbassadors] = useState<Ambassador[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAmbassadors() {
      try {
        const res = await ambassadorsApi.list();
        setAmbassadors(res.data || []);
      } catch (error) {
        console.error('Failed to load ambassadors:', error);
      } finally {
        setLoading(false);
      }
    }
    loadAmbassadors();
  }, []);

  return (
    <div className="p-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Ambassadors</h1>
          <p className="text-gray-600">Manage team members and assignments</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Ambassador
        </Button>
      </div>

      <Card>
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading ambassadors...</div>
        ) : ambassadors.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="mx-auto h-12 w-12 text-gray-300" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">No ambassadors yet</h3>
            <p className="mt-1 text-gray-500">Add your first ambassador to get started.</p>
            <Button className="mt-4">
              <Plus className="mr-2 h-4 w-4" />
              Add Ambassador
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Skill Level</TableHead>
                <TableHead>Compensation</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ambassadors.map((amb) => (
                <TableRow key={amb.id}>
                  <TableCell>
                    <p className="font-medium">{amb.firstName} {amb.lastName}</p>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="text-sm">{amb.email}</p>
                      {amb.phone && <p className="text-sm text-gray-500">{amb.phone}</p>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge className={skillColors[amb.skillLevel]}>
                      {amb.skillLevel}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm capitalize">{amb.compensationType.replace('_', ' ')}</span>
                    {amb.perSignupRate && <span className="text-gray-500 text-sm"> (${amb.perSignupRate}/signup)</span>}
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColors[amb.status]}>
                      {amb.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm">View</Button>
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
