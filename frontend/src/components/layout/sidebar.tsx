'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Calendar,
  Users,
  FileSignature,
  Building2,
  DollarSign,
  Settings,
} from 'lucide-react';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Events', href: '/events', icon: Calendar },
  { name: 'Ambassadors', href: '/ambassadors', icon: Users },
  { name: 'Sign-ups', href: '/signups', icon: FileSignature },
  { name: 'Operators', href: '/operators', icon: Building2 },
  { name: 'CPA Rates', href: '/cpas', icon: DollarSign },
  { name: 'Payroll', href: '/payroll', icon: DollarSign },
  { name: 'Financial', href: '/financial', icon: DollarSign },
  { name: 'Analytics', href: '/analytics', icon: LayoutDashboard },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="flex h-screen w-64 flex-col border-r bg-gray-50">
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600" />
          <span className="text-lg font-bold">XCLSV Core</span>
        </Link>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href || 
            (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-100'
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-4 space-y-3">
        <div className="flex items-center gap-3">
          <UserButton 
            afterSignOutUrl="/sign-in"
            appearance={{
              elements: {
                avatarBox: "h-9 w-9"
              }
            }}
          />
          <span className="text-sm font-medium text-gray-700">Account</span>
        </div>
        <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-700">
          <p className="font-medium">8090.ai Build</p>
          <p className="text-blue-600">Experimental Dashboard</p>
        </div>
      </div>
    </div>
  );
}
