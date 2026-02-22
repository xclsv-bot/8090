import { Loader2 } from 'lucide-react';

export default function AmbassadorsLoading() {
  return (
    <div className="p-8">
      <div className="mb-6">
        <div className="h-8 w-36 bg-gray-200 rounded animate-pulse" />
        <div className="h-4 w-56 bg-gray-100 rounded animate-pulse mt-2" />
      </div>
      <div className="bg-white rounded-lg border border-gray-200 p-12 flex flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400 mb-2" />
        <span className="text-gray-400">Loading ambassadors...</span>
      </div>
    </div>
  );
}
