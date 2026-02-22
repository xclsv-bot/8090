import { RefreshCw } from 'lucide-react';

export default function EventsLoading() {
  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="h-8 w-32 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-48 bg-gray-100 rounded animate-pulse mt-2" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-8 w-16 bg-gray-100 rounded animate-pulse" />
          <div className="h-8 w-24 bg-gray-100 rounded animate-pulse" />
          <div className="h-10 w-32 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
        <RefreshCw className="h-8 w-8 mx-auto text-gray-400 animate-spin mb-4" />
        <p className="text-gray-500">Loading events...</p>
      </div>
    </div>
  );
}
