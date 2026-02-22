/**
 * Historical Sign-up CSV Import Routes
 * 
 * Handles CSV upload of historical sign-up data with validation,
 * duplicate detection, and batch writing to database.
 */

import { FastifyInstance } from 'fastify';
import { pool } from '../config/database.js';

// ============================================
// TYPES
// ============================================

interface CSVRow {
  ambassadorName: string;
  date: string;
  state: string;
  event: string;
  rate: string; // SOLO, SOLO - Per Sign Up, Hourly
  operator: string;
  email: string;
  firstname: string;
  lastname: string;
  cpa: string;
}

interface ParsedRow extends CSVRow {
  rowNumber: number;
  parsedDate: Date | null;
  parsedCpa: number | null;
  issues: string[];
}

interface ValidationResult {
  totalRows: number;
  validRows: number;
  duplicateRows: number;
  missingCpaRows: number;
  errorRows: number;
  rows: ParsedRow[];
  duplicates: ParsedRow[];
  missingCpa: ParsedRow[];
  errors: ParsedRow[];
}

interface ImportResult {
  success: boolean;
  ambassadorsCreated: number;
  operatorsCreated: number;
  eventsCreated: number;
  signupsCreated: number;
  errors: string[];
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function parseCSV(csvContent: string): CSVRow[] {
  const lines = csvContent.trim().split('\n');
  if (lines.length < 2) return [];
  
  // Parse header
  const headerLine = lines[0];
  const headers = headerLine.split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, ''));
  
  // Map expected headers
  const headerMap: Record<string, string> = {
    'ambassadorname': 'ambassadorName',
    'ambassador name': 'ambassadorName',
    'date': 'date',
    'state': 'state',
    'event': 'event',
    'rate': 'rate',
    'operator': 'operator',
    'email': 'email',
    'firstname': 'firstname',
    'lastname': 'lastname',
    'cpa': 'cpa',
  };
  
  const rows: CSVRow[] = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines
    if (!line) continue;
    
    // Skip totals row (usually contains "Total" or similar)
    if (line.toLowerCase().includes('total')) continue;
    
    // Parse CSV line (handle quoted values)
    const values = parseCSVLine(line);
    
    // Skip if all values are empty
    if (values.every(v => !v.trim())) continue;
    
    const row: CSVRow = {
      ambassadorName: '',
      date: '',
      state: '',
      event: '',
      rate: '',
      operator: '',
      email: '',
      firstname: '',
      lastname: '',
      cpa: '',
    };
    
    headers.forEach((header, idx) => {
      const mappedKey = headerMap[header] || header;
      if (mappedKey in row && values[idx] !== undefined) {
        (row as unknown as Record<string, string>)[mappedKey] = values[idx]?.trim() || '';
      }
    });
    
    rows.push(row);
  }
  
  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current);
  return result;
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  
  // Try various date formats
  const formats = [
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/, // MM/DD/YYYY or M/D/YY
    /^(\d{4})-(\d{2})-(\d{2})$/, // YYYY-MM-DD
  ];
  
  for (const format of formats) {
    const match = dateStr.match(format);
    if (match) {
      if (format === formats[0]) {
        const month = parseInt(match[1]) - 1;
        const day = parseInt(match[2]);
        let year = parseInt(match[3]);
        if (year < 100) year += 2000;
        return new Date(year, month, day);
      } else {
        return new Date(dateStr);
      }
    }
  }
  
  return null;
}

async function validateRows(rows: CSVRow[]): Promise<ValidationResult> {
  const parsedRows: ParsedRow[] = rows.map((row, idx) => ({
    ...row,
    rowNumber: idx + 2, // +2 for header and 0-index
    parsedDate: parseDate(row.date),
    parsedCpa: row.cpa ? parseFloat(row.cpa) : null,
    issues: [],
  }));
  
  // Check for required fields
  for (const row of parsedRows) {
    if (!row.ambassadorName) row.issues.push('Missing ambassador name');
    if (!row.parsedDate) row.issues.push('Invalid or missing date');
    if (!row.operator) row.issues.push('Missing operator');
    if (!row.email) row.issues.push('Missing email');
    if (!row.firstname && !row.lastname) row.issues.push('Missing customer name');
  }
  
  // Check for duplicates (same email + operator + date)
  const seen = new Map<string, number>();
  const duplicates: ParsedRow[] = [];
  
  for (const row of parsedRows) {
    if (row.email && row.operator && row.parsedDate) {
      const key = `${row.email.toLowerCase()}|${row.operator.toLowerCase()}|${row.parsedDate.toISOString().split('T')[0]}`;
      
      if (seen.has(key)) {
        row.issues.push(`Duplicate of row ${seen.get(key)}`);
        duplicates.push(row);
      } else {
        seen.set(key, row.rowNumber);
      }
    }
  }
  
  // Also check against existing signups in database
  const emailsToCheck = parsedRows
    .filter(r => r.email && r.operator && r.parsedDate && !r.issues.some(i => i.includes('Duplicate')))
    .map(r => ({
      email: r.email.toLowerCase(),
      operator: r.operator,
      date: r.parsedDate!.toISOString().split('T')[0],
      rowNumber: r.rowNumber,
    }));
  
  if (emailsToCheck.length > 0) {
    try {
      const result = await pool.query(`
        SELECT LOWER(customer_email) as email, operator_name, DATE(submitted_at) as signup_date
        FROM signups
        WHERE LOWER(customer_email) = ANY($1)
      `, [emailsToCheck.map(e => e.email)]);
      
      const existingSet = new Set(
        result.rows.map(r => `${r.email}|${r.operator_name?.toLowerCase()}|${r.signup_date}`)
      );
      
      for (const row of parsedRows) {
        if (row.email && row.operator && row.parsedDate) {
          const key = `${row.email.toLowerCase()}|${row.operator.toLowerCase()}|${row.parsedDate.toISOString().split('T')[0]}`;
          if (existingSet.has(key) && !row.issues.some(i => i.includes('Duplicate'))) {
            row.issues.push('Already exists in database');
            duplicates.push(row);
          }
        }
      }
    } catch (error) {
      console.error('Error checking existing signups:', error);
    }
  }
  
  // Identify missing CPA rows
  const missingCpa = parsedRows.filter(r => 
    r.parsedCpa === null && !r.issues.some(i => i.includes('Duplicate') || i.includes('Already exists'))
  );
  for (const row of missingCpa) {
    row.issues.push('Missing CPA - revenue unresolved');
  }
  
  // Categorize rows
  const errors = parsedRows.filter(r => 
    r.issues.some(i => !i.includes('Missing CPA') && !i.includes('Duplicate') && !i.includes('Already exists'))
  );
  
  const validRows = parsedRows.filter(r => 
    r.issues.length === 0 || r.issues.every(i => i.includes('Missing CPA'))
  );
  
  return {
    totalRows: parsedRows.length,
    validRows: validRows.length,
    duplicateRows: duplicates.length,
    missingCpaRows: missingCpa.length,
    errorRows: errors.length,
    rows: parsedRows,
    duplicates,
    missingCpa,
    errors,
  };
}

async function commitImport(rows: ParsedRow[], eventId?: string): Promise<ImportResult> {
  const result: ImportResult = {
    success: false,
    ambassadorsCreated: 0,
    operatorsCreated: 0,
    eventsCreated: 0,
    signupsCreated: 0,
    errors: [],
  };
  
  // Filter to valid rows only (no errors, not duplicates)
  const validRows = rows.filter(r => 
    r.issues.length === 0 || r.issues.every(i => i.includes('Missing CPA'))
  );
  
  if (validRows.length === 0) {
    result.errors.push('No valid rows to import');
    return result;
  }
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // 1. Upsert Ambassadors
    const ambassadorMap = new Map<string, string>(); // name -> id
    const uniqueAmbassadors = [...new Set(validRows.map(r => r.ambassadorName).filter(Boolean))];
    
    for (const name of uniqueAmbassadors) {
      const nameParts = name.split(' ');
      const firstName = nameParts[0] || name;
      const lastName = nameParts.slice(1).join(' ') || '';
      const state = validRows.find(r => r.ambassadorName === name)?.state || '';
      
      // Check if exists
      const existing = await client.query(
        `SELECT id FROM ambassadors WHERE LOWER(first_name || ' ' || last_name) = LOWER($1)`,
        [name]
      );
      
      if (existing.rows.length > 0) {
        ambassadorMap.set(name, existing.rows[0].id);
      } else {
        // Create new ambassador
        const inserted = await client.query(`
          INSERT INTO ambassadors (first_name, last_name, email, compensation_type, per_signup_rate, status)
          VALUES ($1, $2, $3, 'per_signup', 30.00, 'active')
          RETURNING id
        `, [firstName, lastName, `${firstName.toLowerCase()}.${lastName.toLowerCase()}@placeholder.com`]);
        
        ambassadorMap.set(name, inserted.rows[0].id);
        result.ambassadorsCreated++;
      }
    }
    
    // 2. Upsert Operators
    const operatorMap = new Map<string, number>(); // name -> id
    const uniqueOperators = [...new Set(validRows.map(r => r.operator).filter(Boolean))];
    
    for (const name of uniqueOperators) {
      const existing = await client.query(
        `SELECT id FROM operators WHERE LOWER(name) = LOWER($1)`,
        [name]
      );
      
      if (existing.rows.length > 0) {
        operatorMap.set(name, existing.rows[0].id);
      } else {
        // Create new operator
        const inserted = await client.query(`
          INSERT INTO operators (name, display_name, category, status)
          VALUES ($1, $1, 'sportsbook', 'active')
          RETURNING id
        `, [name]);
        
        operatorMap.set(name, inserted.rows[0].id);
        result.operatorsCreated++;
      }
    }
    
    // 3. Upsert Events
    const eventMap = new Map<string, string>(); // "event|date|state" -> id
    
    // Create or get SOLO event
    let soloEventId: string | null = null;
    const soloResult = await client.query(
      `SELECT id FROM events WHERE title = 'SOLO' LIMIT 1`
    );
    if (soloResult.rows.length > 0) {
      soloEventId = soloResult.rows[0].id;
    } else {
      const inserted = await client.query(`
        INSERT INTO events (title, description, event_date, status)
        VALUES ('SOLO', 'Global SOLO sign-ups event', CURRENT_DATE, 'active')
        RETURNING id
      `);
      soloEventId = inserted.rows[0].id;
      result.eventsCreated++;
    }
    
    // Process non-SOLO events
    for (const row of validRows) {
      const isSolo = row.rate?.toLowerCase().includes('solo') || row.event?.toLowerCase() === 'solo';
      
      if (isSolo) {
        eventMap.set(`solo|any|any`, soloEventId!);
      } else if (row.event && row.parsedDate) {
        const key = `${row.event.toLowerCase()}|${row.parsedDate.toISOString().split('T')[0]}|${row.state?.toLowerCase() || ''}`;
        
        if (!eventMap.has(key)) {
          // Check if event exists
          const existing = await client.query(`
            SELECT id FROM events 
            WHERE LOWER(title) = LOWER($1) 
            AND event_date = $2
          `, [row.event, row.parsedDate.toISOString().split('T')[0]]);
          
          if (existing.rows.length > 0) {
            eventMap.set(key, existing.rows[0].id);
          } else {
            // Create new event
            const inserted = await client.query(`
              INSERT INTO events (title, state, event_date, status)
              VALUES ($1, $2, $3, 'completed')
              RETURNING id
            `, [row.event, row.state || null, row.parsedDate.toISOString().split('T')[0]]);
            
            eventMap.set(key, inserted.rows[0].id);
            result.eventsCreated++;
          }
        }
      }
    }
    
    // 4. Create Sign-ups
    for (const row of validRows) {
      const ambassadorId = ambassadorMap.get(row.ambassadorName);
      const operatorId = operatorMap.get(row.operator);
      
      const isSolo = row.rate?.toLowerCase().includes('solo') || row.event?.toLowerCase() === 'solo';
      let eventIdForSignup: string | null = null;
      
      if (isSolo) {
        eventIdForSignup = soloEventId;
      } else if (row.event && row.parsedDate) {
        const key = `${row.event.toLowerCase()}|${row.parsedDate.toISOString().split('T')[0]}|${row.state?.toLowerCase() || ''}`;
        eventIdForSignup = eventMap.get(key) || null;
      }
      
      // Use provided eventId if this is an event-specific import
      if (eventId && !isSolo) {
        eventIdForSignup = eventId;
      }
      
      if (!ambassadorId || !operatorId) {
        result.errors.push(`Row ${row.rowNumber}: Missing ambassador or operator mapping`);
        continue;
      }
      
      try {
        await client.query(`
          INSERT INTO signups (
            event_id, ambassador_id, operator_id, operator_name,
            customer_first_name, customer_last_name, customer_email,
            cpa_applied, validation_status, submitted_at, source_type, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'validated', $9, 'event', 'Historical CSV Import')
        `, [
          eventIdForSignup,
          ambassadorId,
          operatorId,
          row.operator,
          row.firstname || 'Unknown',
          row.lastname || '',
          row.email,
          row.parsedCpa,
          row.parsedDate || new Date(),
        ]);
        
        result.signupsCreated++;
      } catch (error: unknown) {
        const err = error as Error;
        result.errors.push(`Row ${row.rowNumber}: ${err.message}`);
      }
    }
    
    await client.query('COMMIT');
    result.success = true;
    
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    const err = error as Error;
    result.errors.push(`Transaction failed: ${err.message}`);
  } finally {
    client.release();
  }
  
  return result;
}

// ============================================
// ROUTES
// ============================================

export async function historicalSignupImportRoutes(fastify: FastifyInstance) {
  
  /**
   * POST /api/v1/imports/historical-signups/validate
   * Parse and validate CSV, return summary before committing
   */
  fastify.post('/imports/historical-signups/validate', {
    schema: {
      description: 'Validate historical sign-up CSV',
      tags: ['Historical Import'],
      body: {
        type: 'object',
        properties: {
          csvContent: { type: 'string', description: 'CSV content as string' },
        },
        required: ['csvContent'],
      },
    },
  }, async (request, reply) => {
    const { csvContent } = request.body as { csvContent: string };
    
    try {
      const rows = parseCSV(csvContent);
      
      if (rows.length === 0) {
        return reply.code(400).send({
          success: false,
          error: 'No valid rows found in CSV',
        });
      }
      
      const validation = await validateRows(rows);
      
      return {
        success: true,
        data: validation,
      };
    } catch (error: unknown) {
      const err = error as Error;
      return reply.code(500).send({
        success: false,
        error: err.message,
      });
    }
  });
  
  /**
   * POST /api/v1/imports/historical-signups/commit
   * Commit validated rows to database
   */
  fastify.post('/imports/historical-signups/commit', {
    schema: {
      description: 'Commit historical sign-up import',
      tags: ['Historical Import'],
      body: {
        type: 'object',
        properties: {
          rows: { type: 'array', description: 'Validated rows to import' },
          eventId: { type: 'string', description: 'Optional event ID to associate sign-ups with' },
        },
        required: ['rows'],
      },
    },
  }, async (request, reply) => {
    const { rows, eventId } = request.body as { rows: ParsedRow[]; eventId?: string };
    
    try {
      const result = await commitImport(rows, eventId);
      
      return {
        success: result.success,
        data: result,
      };
    } catch (error: unknown) {
      const err = error as Error;
      return reply.code(500).send({
        success: false,
        error: err.message,
      });
    }
  });
}
