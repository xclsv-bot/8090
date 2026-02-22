import { Loader2 } from 'lucide-react';

export default function PayrollLoading() {
  return (
    <div className="p-8">
      <div className="mb-6">
        <div className="h-8 w-24 bg-gray-200 rounded animate-pulse" />
        <div className="h-4 w-48 bg-gray-100 rounded animate-pulse mt-2" />
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-12 flex flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400 mb-2" />
        <span className="text-gray-400">Loading payroll...</span>
      </div>
    </div>
  );
}
