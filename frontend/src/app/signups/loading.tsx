import { Loader2 } from 'lucide-react';

export default function SignupsLoading() {
  return (
    <div className="p-8">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <div className="h-7 w-28 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-48 bg-gray-100 rounded animate-pulse mt-2" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="h-8 w-16 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-24 bg-gray-100 rounded animate-pulse mt-2" />
          </div>
        ))}
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 p-12 flex flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400 mb-2" />
        <span className="text-gray-400">Loading sign-ups...</span>
      </div>
    </div>
  );
}
