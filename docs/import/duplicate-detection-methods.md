# Duplicate Detection Methods

## Purpose
Ensure idempotent imports and avoid duplicate entity creation.

## Strategy Interface
```ts
export type DuplicateDecision = 'create' | 'skip' | 'update' | 'review';

export interface DuplicateCheckInput {
  importId: string;
  rowNumber: number;
  payload: Record<string, unknown>;
}

export interface DuplicateCheckResult {
  decision: DuplicateDecision;
  reason: string;
  existingId?: string;
  confidence?: number;
}

export interface DuplicateStrategy {
  name: 'hash' | 'external_id' | 'natural_key' | 'fuzzy';
  check(input: DuplicateCheckInput): Promise<DuplicateCheckResult>;
}
```

## 1) Hash-Based
Use file-level or row-level canonical hash.
```ts
import crypto from 'node:crypto';

const rowHash = crypto
  .createHash('sha256')
  .update(JSON.stringify(payload))
  .digest('hex');
```
Use case: repeated file uploads.

## 2) External ID
Match source-system immutable identifiers.

```ts
SELECT id FROM signups WHERE external_source_id = $1 LIMIT 1;
```

## 3) Natural Key
Match meaningful business keys.
- WO-92 uses `customer_email + operator + date` logic.

```ts
SELECT id
FROM signups
WHERE LOWER(customer_email) = LOWER($1)
  AND operator_id = $2
  AND signup_date = $3
LIMIT 1;
```

## 4) Fuzzy Matching
Use as advisory (default `review`, not auto-merge).

```ts
if (similarity(nameA, nameB) > 0.92) {
  return { decision: 'review', reason: 'Possible fuzzy duplicate', confidence: 0.92 };
}
```

## Recommended Policy
- Run checks in this order: `hash -> external_id -> natural_key -> fuzzy`.
- Persist decision/action on row detail logs.
- Allow domain override: `skipDuplicates` for sign-up imports (WO-92).
