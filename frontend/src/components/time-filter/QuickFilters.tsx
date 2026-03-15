'use client';

import { Button } from '@/components/ui/button';
import type { QuickFiltersProps } from './types';

export function QuickFilters({ options, selected, onSelect }: QuickFiltersProps) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Quick time period filters">
      {options.map((option) => {
        const isSelected = selected === option.value;

        return (
          <Button
            key={option.value}
            type="button"
            variant={isSelected ? 'default' : 'outline'}
            size="sm"
            onClick={() => onSelect(option.value)}
            aria-pressed={isSelected}
            aria-label={option.label}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}
