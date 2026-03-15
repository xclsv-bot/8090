# Integration Guidelines

## API Endpoints

### Event Import (WO-88)
- `POST /api/v1/imports/events`
- `POST /api/v1/imports/events/preview`
- `GET /api/v1/imports/events`
- `GET /api/v1/imports/events/:importId`
- `GET /api/v1/imports/events/:importId/rows`
- `GET /api/v1/imports/events/:importId/audit`

### Sign-up Import (WO-92)
- `POST /api/v1/imports/signups`
- `GET /api/v1/imports/signups`
- `GET /api/v1/imports/signups/summary`
- `GET /api/v1/imports/signups/:importId`
- `GET /api/v1/imports/signups/:importId/rows`
- `POST /api/v1/imports/signups/:importId/rollback`

## Request / Response Contracts
```ts
export interface ImportRequest {
  csvContent: string;
  filename?: string;
  year?: number;
  dryRun?: boolean;
  columnMapping?: Record<string, number>;
  skipHeaderRows?: number;
  skipDuplicates?: boolean;
}

export interface ImportResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}
```

## End-to-End Example
```ts
// 1) Preview
await api.post('/api/v1/imports/events/preview', {
  csvContent,
  year: 2025,
});

// 2) Import
const { data } = await api.post('/api/v1/imports/events', {
  csvContent,
  filename: 'legacy-events.csv',
  dryRun: false,
});

// 3) Poll status
await api.get(`/api/v1/imports/events/${data.importId}`);

// 4) Fetch row details
await api.get(`/api/v1/imports/events/${data.importId}/rows?status=error&limit=100`);
```

## Best Practices
1. Always run dry-run for first execution of a new file format.
2. Require explicit import ownership (`importedBy`).
3. Persist import options and resolved mappings for replayability.
4. Use row detail endpoints for support workflows, not only summary status.
5. Restrict rollback endpoints to privileged roles and log every invocation.
