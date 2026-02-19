'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Settings, Database, Server, Key, Upload } from 'lucide-react';

export default function SettingsPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600">Platform configuration</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Link href="/admin/imports">
          <Card className="p-6 hover:border-orange-300 hover:shadow-md transition-all cursor-pointer">
            <div className="flex items-center gap-4 mb-4">
              <div className="rounded-full bg-orange-100 p-2">
                <Upload className="h-5 w-5 text-orange-600" />
              </div>
              <h2 className="text-lg font-semibold">Historical Data Import</h2>
            </div>
            <p className="text-sm text-gray-600">
              Upload CSV or Excel files to import historical sign-ups, event budgets, or payroll data.
            </p>
            <div className="mt-4 text-sm text-orange-600 font-medium">
              Go to Import Tool →
            </div>
          </Card>
        </Link>
        <Card className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="rounded-full bg-blue-100 p-2">
              <Server className="h-5 w-5 text-blue-600" />
            </div>
            <h2 className="text-lg font-semibold">API Configuration</h2>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">API URL</span>
              <code className="bg-gray-100 px-2 py-0.5 rounded text-xs">
                xclsv-core-platform.onrender.com
              </code>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Status</span>
              <span className="text-green-600 font-medium">Connected</span>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="rounded-full bg-purple-100 p-2">
              <Database className="h-5 w-5 text-purple-600" />
            </div>
            <h2 className="text-lg font-semibold">Database</h2>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Provider</span>
              <span>Neon PostgreSQL</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Tables</span>
              <span>55 tables</span>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="rounded-full bg-green-100 p-2">
              <Key className="h-5 w-5 text-green-600" />
            </div>
            <h2 className="text-lg font-semibold">Authentication</h2>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Provider</span>
              <span>Clerk</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Mode</span>
              <span className="text-yellow-600">Dev (bypassed)</span>
            </div>
          </div>
        </Card>

        <Card className="p-6 border-blue-200 bg-blue-50">
          <div className="flex items-center gap-4 mb-4">
            <div className="rounded-full bg-blue-200 p-2">
              <Settings className="h-5 w-5 text-blue-700" />
            </div>
            <h2 className="text-lg font-semibold text-blue-900">8090.ai Build</h2>
          </div>
          <p className="text-sm text-blue-700">
            This platform was built using 8090.ai Software Factory work orders. 
            It's running in parallel with Events Portal V2 for comparison testing.
          </p>
        </Card>
      </div>
    </div>
  );
}
