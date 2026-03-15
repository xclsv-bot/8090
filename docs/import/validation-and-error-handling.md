# Validation and Error Handling

## ValidationRule Contract
```ts
export interface ValidationContext {
  rowNumber: number;
  importId: string;
}

export interface ValidationError {
  code: string;
  field?: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationRule<T> {
  name: string;
  validate(input: T, ctx: ValidationContext): Promise<ValidationError[]>;
}
```

## Validation Types
- Field-level: email format, required fields, numeric ranges.
- Cross-field: `startTime <= endTime`, conditional requirements.
- Referential: ambassador/operator/event existence.
- Domain: signup duplicates, event uniqueness rules.

## Rule Pipeline Example
```ts
async function runValidation<T>(input: T, rules: ValidationRule<T>[], ctx: ValidationContext) {
  const all = await Promise.all(rules.map((r) => r.validate(input, ctx)));
  return all.flat();
}
```

## Error Handling Strategy
- Parse errors: row logged as `error`, include raw text.
- Validation errors: row logged as `error` or `warning`, continue import.
- DB/infrastructure errors: fail batch/import, set import status `failed`.

## Error Response Shape
```ts
export interface ImportErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Array<{ row: number; code: string; message: string }>;
  };
}
```

## Existing References
- Event import returns `errors` and `warnings` arrays in `EventImportResult`.
- Signup import returns partial success (HTTP `207`) for mixed outcomes.
