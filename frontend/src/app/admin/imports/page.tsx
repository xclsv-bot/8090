'use client';

import { useRouter } from 'next/navigation';
import { ImportWizard } from '@/components/historical-import/ImportWizard';

export default function HistoricalImportsPage() {
  const router = useRouter();

  const handleComplete = () => {
    // Refresh the page to show updated import history
    router.refresh();
  };

  const handleCancel = () => {
    // Navigate back to dashboard or stay on page
    router.push('/admin');
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Historical Data Import</h1>
        <p className="mt-2 text-gray-600">
          Upload CSV or Excel files to import historical sign-ups, event budgets, or payroll data.
        </p>
      </div>
      <ImportWizard onComplete={handleComplete} onCancel={handleCancel} />
    </div>
  );
}
