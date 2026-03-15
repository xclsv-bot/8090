'use client';

import { useContext } from 'react';
import { TimeFilterContext } from './TimeFilterProvider';

export function useTimeFilter() {
  const context = useContext(TimeFilterContext);

  if (!context) {
    throw new Error('useTimeFilter must be used within a TimeFilterProvider');
  }

  return context;
}
