# Date Parsing Strategies

## Goal
Provide deterministic date parsing and normalization for migration imports.

## Supported Inputs
- ISO: `YYYY-MM-DD`
- US: `MM/DD/YYYY`, `MM/DD/YY`
- EU (optional feature flag): `DD/MM/YYYY`
- Unix: seconds (`1709251200`) or ms (`1709251200000`)
- Partial: `Fri, 01/2` with `defaultYear`

## Core Utility
```ts
export interface DateParseOptions {
  defaultYear?: number;
  timezone?: string; // e.g., 'America/New_York'
  allowEuropean?: boolean;
}

export interface DateParseResult {
  value: Date | null;
  sourceFormat?: 'iso' | 'us' | 'eu' | 'unix' | 'partial';
  error?: string;
}

export interface DateParser {
  parse(input: string | undefined, options: DateParseOptions): DateParseResult;
}
```

## Parsing Example
```ts
function parseDate(input: string | undefined, options: DateParseOptions): DateParseResult {
  if (!input || !input.trim()) return { value: null, error: 'Empty date' };
  const value = input.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(`${value}T12:00:00Z`);
    return isNaN(d.getTime()) ? { value: null, error: 'Invalid ISO date' } : { value: d, sourceFormat: 'iso' };
  }

  const us = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (us) {
    const [, mm, dd, yy] = us;
    const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
    const d = new Date(year, Number(mm) - 1, Number(dd));
    return isNaN(d.getTime()) ? { value: null, error: 'Invalid US date' } : { value: d, sourceFormat: 'us' };
  }

  return { value: null, error: `Unsupported date format: ${value}` };
}
```

## Timezone Handling
- Parse in source-local semantics, store as UTC.
- Keep original text in row log for traceability.
- If timezone not provided, default to application import timezone (documented in import options).

## Existing Pattern References
- WO-88 `parseEventDate` supports ISO, US, and partial date with default year.
- WO-92 `parseSignupDate` supports ISO, US full/short, and partial date with default year.

## Validation Rules
- Reject impossible calendar dates.
- Reject dates outside migration scope when configured.
- Return structured validation errors, not silent coercion.
