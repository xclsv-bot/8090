# Column Mapping Patterns

## Objective
Standardize how CSV columns map into domain fields across import flows.

## Core Types
```ts
export type MappingStrategy = 'exact' | 'alias' | 'computed' | 'conditional';

export interface ColumnMappingRule<TOut = unknown> {
  targetField: string;
  required: boolean;
  strategy: MappingStrategy;
  sourceHeaders?: string[];
  aliases?: string[];
  defaultValue?: TOut;
  transformer?: (value: string, row: Record<string, string>) => TOut;
  when?: (row: Record<string, string>) => boolean;
}

export interface ColumnMapping {
  headerIndex: number;
  resolved: Record<string, number>;
  unresolvedRequired: string[];
}
```

## Strategy 1: Exact Header
```ts
{ targetField: 'customerEmail', required: true, strategy: 'exact', sourceHeaders: ['customer_email'] }
```

## Strategy 2: Alias Header
```ts
{
  targetField: 'ambassadorIdentifier',
  required: true,
  strategy: 'alias',
  aliases: ['ambassador', 'rep', 'sales_rep']
}
```

## Strategy 3: Computed Value
```ts
{
  targetField: 'customerName',
  required: false,
  strategy: 'computed',
  transformer: (_, row) => `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || 'Unknown Customer'
}
```

## Strategy 4: Conditional Mapping
```ts
{
  targetField: 'cpaOverride',
  required: false,
  strategy: 'conditional',
  aliases: ['cpa', 'rate'],
  when: (row) => row.state === 'CA',
  transformer: (v) => Number(v.replace(/[$,]/g, ''))
}
```

## Resolver Example
```ts
function resolveMapping(headers: string[], rules: ColumnMappingRule[]): ColumnMapping {
  const normalized = headers.map((h) => h.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_'));
  const resolved: Record<string, number> = {};
  const unresolvedRequired: string[] = [];

  for (const rule of rules) {
    const candidates = [
      ...(rule.sourceHeaders ?? []),
      ...(rule.aliases ?? []),
    ].map((h) => h.toLowerCase());

    const index = normalized.findIndex((h) => candidates.includes(h));
    if (index >= 0) resolved[rule.targetField] = index;
    else if (rule.required && rule.strategy !== 'computed') unresolvedRequired.push(rule.targetField);
  }

  return { headerIndex: 0, resolved, unresolvedRequired };
}
```

## WO-88 / WO-92 References
- WO-88: `detectColumnMapping(headerRow)` with optional user overrides.
- WO-92: `findHeaderAndMapColumns(rows)` with flexible header matching.

## Recommended Validation
- Block import when `unresolvedRequired.length > 0`.
- Persist resolved mapping to import log `options` for replay/debug.
