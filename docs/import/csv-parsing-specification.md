# CSV Parsing Specification

## Scope
Defines the parsing contract for import pipelines and aligns with current patterns in:
- `src/services/eventImportService.ts` (WO-88)
- `src/services/signupImportService.ts` (WO-92)

## Core Interface
```ts
export interface CsvParser {
  detectDelimiter(sample: string): ',' | ';' | '\t' | '|';
  detectEncoding(buffer: Buffer): 'utf8' | 'utf16le' | 'latin1';
  detectHeaders(rows: string[][], scanLimit?: number): {
    headerIndex: number;
    headers: string[];
  } | null;
  parseRow(line: string, delimiter: string): string[];
  streamParse(
    input: NodeJS.ReadableStream,
    onRow: (row: string[], rowNumber: number) => Promise<void>
  ): Promise<void>;
}
```

## Header Detection
- Scan up to first `10` rows by default.
- Treat row as header when required semantic markers appear (e.g., `date`, `venue`, `ambassador`, `email`).
- Use normalization before matching:
```ts
const normalize = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_');
```

## Delimiter Detection
```ts
function detectDelimiter(sample: string): ',' | ';' | '\t' | '|' {
  const candidates = [',', ';', '\t', '|'] as const;
  const counts = candidates.map((d) => ({ d, c: sample.split(d).length }));
  return counts.sort((a, b) => b.c - a.c)[0].d;
}
```

## Encoding Detection
- Prefer UTF-8.
- Detect BOM and common fallbacks.
- If decode fails, return structured parse error with row/byte offset when available.

## Row Parsing
- Support quoted fields containing delimiters.
- Preserve raw cell text for audit logs.
- Ignore fully blank rows.

```ts
function parseRow(line: string, delimiter = ','): string[] {
  const out: string[] = [];
  let current = '';
  let inQuotes = false;

  for (const ch of line) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === delimiter && !inQuotes) {
      out.push(current.trim());
      current = '';
    } else current += ch;
  }

  out.push(current.trim());
  return out;
}
```

## Streaming Parse
Use streaming for large files and batch pipelines.

```ts
import * as readline from 'node:readline';

async function streamParse(
  input: NodeJS.ReadableStream,
  onRow: (row: string[], rowNumber: number) => Promise<void>
): Promise<void> {
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  let rowNumber = 0;

  for await (const line of rl) {
    rowNumber += 1;
    if (!line.trim()) continue;
    await onRow(parseRow(line, ','), rowNumber);
  }
}
```

## Error Output Contract
```ts
export interface CsvParseError {
  row: number;
  code: 'MALFORMED_ROW' | 'ENCODING_ERROR' | 'HEADER_NOT_FOUND';
  message: string;
  raw?: string;
}
```

## Existing Implementation Notes
- WO-88 and WO-92 both use line-based parsing with quote handling.
- Both detect header rows in early rows and then map columns.
- Migration path: replace duplicated parser logic with shared `CsvParser` utility.
