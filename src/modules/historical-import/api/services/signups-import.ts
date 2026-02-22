/**
 * Historical Sign-ups Import Service
 * 
 * Handles actual database writes for historical sign-up CSV imports.
 * Implements the business logic per Z's spec:
 * - Duplicate detection (same email + operator + date)
 * - Missing CPA flagging
 * - Auto-create ambassadors, operators, events
 * - One global SOLO event
 * - SOLO rate = $30/sign-up payroll
 */

import { pool } from '../../../../config/database.js';

interface CSVRow {
  [key: string]: unknown;
  'Ambassador Name'?: string;
  'Date'?: string;
  'State'?: string;
  'Event'?: string;
  'Rate'?: string;
  'Operator'?: string;
  'Email'?: string;
  'firstname'?: string;
  'lastname'?: string;
  'CPA'?: string;
}

interface ImportResult {
  inserted: number;
  skipped: number;
  duplicates: number;
  missingCpa: number;
  errors: string[];
  ambassadorsCreated: number;
  operatorsCreated: number;
  eventsCreated: number;
}

function parseDate(dateStr: string | unknown): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  
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

function getFieldValue(row: CSVRow, ...fieldNames: string[]): string {
  for (const name of fieldNames) {
    const value = row[name] || row[name.toLowerCase()] || row[name.replace(' ', '_')];
    if (value !== undefined && value !== null) {
      return String(value).trim();
    }
  }
  return '';
}

const toNum = (v: unknown) => Number(v) || 0;

export async function importSignups(
  rows: CSVRow[],
  importId: string,
  uploadedBy: string
): Promise<ImportResult> {
  const result: ImportResult = {
    inserted: 0,
    skipped: 0,
    duplicates: 0,
    missingCpa: 0,
    errors: [],
    ambassadorsCreated: 0,
    operatorsCreated: 0,
    eventsCreated: 0,
  };
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // 1. Collect unique ambassadors, operators, events
    const ambassadorMap = new Map<string, string>(); // name -> id
    const operatorMap = new Map<string, number>(); // name -> id
    const eventMap = new Map<string, string>(); // "event|date" -> id
    
    // Get/create SOLO event
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
    
    // Check for duplicates against existing database
    const emailsInBatch = new Map<string, number>(); // key -> row number
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // Account for header row
      
      const ambassadorName = getFieldValue(row, 'Ambassador Name', 'ambassador_name', 'ambassadorName');
      const dateStr = getFieldValue(row, 'Date', 'date');
      const state = getFieldValue(row, 'State', 'state');
      const eventName = getFieldValue(row, 'Event', 'event');
      const rate = getFieldValue(row, 'Rate', 'rate');
      const operator = getFieldValue(row, 'Operator', 'operator');
      const email = getFieldValue(row, 'Email', 'email');
      const firstname = getFieldValue(row, 'firstname', 'FirstName', 'first_name');
      const lastname = getFieldValue(row, 'lastname', 'LastName', 'last_name');
      const cpaStr = getFieldValue(row, 'CPA', 'cpa');
      
      const parsedDate = parseDate(dateStr);
      const parsedCpa = cpaStr ? toNum(cpaStr) : null;
      
      // Skip empty rows
      if (!email && !ambassadorName) {
        result.skipped++;
        continue;
      }
      
      // Skip totals row
      if (ambassadorName?.toLowerCase().includes('total')) {
        result.skipped++;
        continue;
      }
      
      // Check for batch duplicates
      if (email && operator && parsedDate) {
        const key = `${email.toLowerCase()}|${operator.toLowerCase()}|${parsedDate.toISOString().split('T')[0]}`;
        if (emailsInBatch.has(key)) {
          result.duplicates++;
          result.skipped++;
          continue;
        }
        emailsInBatch.set(key, rowNum);
        
        // Check against database
        const existingCheck = await client.query(`
          SELECT id FROM signups 
          WHERE LOWER(customer_email) = LOWER($1) 
          AND LOWER(operator_name) = LOWER($2)
          AND DATE(submitted_at) = $3
          LIMIT 1
        `, [email, operator, parsedDate.toISOString().split('T')[0]]);
        
        if (existingCheck.rows.length > 0) {
          result.duplicates++;
          result.skipped++;
          continue;
        }
      }
      
      // Track missing CPA
      if (parsedCpa === null) {
        result.missingCpa++;
      }
      
      // Get/create ambassador
      let ambassadorId: string | null = null;
      if (ambassadorName) {
        if (ambassadorMap.has(ambassadorName)) {
          ambassadorId = ambassadorMap.get(ambassadorName)!;
        } else {
          const nameParts = ambassadorName.split(' ');
          const firstName = nameParts[0] || ambassadorName;
          const lastName = nameParts.slice(1).join(' ') || '';
          
          const existing = await client.query(
            `SELECT id FROM ambassadors WHERE LOWER(first_name || ' ' || last_name) = LOWER($1)`,
            [ambassadorName]
          );
          
          if (existing.rows.length > 0) {
            ambassadorId = existing.rows[0].id;
          } else {
            const inserted = await client.query(`
              INSERT INTO ambassadors (first_name, last_name, email, compensation_type, per_signup_rate, status)
              VALUES ($1, $2, $3, 'per_signup', 30.00, 'active')
              RETURNING id
            `, [firstName, lastName, `${firstName.toLowerCase()}.${lastName.toLowerCase() || 'ambassador'}@placeholder.com`]);
            
            ambassadorId = inserted.rows[0].id;
            result.ambassadorsCreated++;
          }
          ambassadorMap.set(ambassadorName, ambassadorId!);
        }
      }
      
      if (!ambassadorId) {
        result.errors.push(`Row ${rowNum}: Missing ambassador`);
        result.skipped++;
        continue;
      }
      
      // Get/create operator
      let operatorId: number | null = null;
      if (operator) {
        if (operatorMap.has(operator)) {
          operatorId = operatorMap.get(operator)!;
        } else {
          const existing = await client.query(
            `SELECT id FROM operators WHERE LOWER(name) = LOWER($1)`,
            [operator]
          );
          
          if (existing.rows.length > 0) {
            operatorId = existing.rows[0].id;
          } else {
            const inserted = await client.query(`
              INSERT INTO operators (name, display_name, category, status)
              VALUES ($1, $1, 'sportsbook', 'active')
              RETURNING id
            `, [operator]);
            
            operatorId = inserted.rows[0].id;
            result.operatorsCreated++;
          }
          operatorMap.set(operator, operatorId!);
        }
      }
      
      if (!operatorId) {
        result.errors.push(`Row ${rowNum}: Missing operator`);
        result.skipped++;
        continue;
      }
      
      // Determine event
      const isSolo = rate?.toLowerCase().includes('solo') || eventName?.toLowerCase() === 'solo';
      let eventIdForSignup: string | null = null;
      
      if (isSolo) {
        eventIdForSignup = soloEventId;
      } else if (eventName && parsedDate) {
        const key = `${eventName.toLowerCase()}|${parsedDate.toISOString().split('T')[0]}`;
        
        if (eventMap.has(key)) {
          eventIdForSignup = eventMap.get(key)!;
        } else {
          const existing = await client.query(`
            SELECT id FROM events 
            WHERE LOWER(title) = LOWER($1) 
            AND event_date = $2
          `, [eventName, parsedDate.toISOString().split('T')[0]]);
          
          if (existing.rows.length > 0) {
            eventIdForSignup = existing.rows[0].id;
          } else {
            const inserted = await client.query(`
              INSERT INTO events (title, state, event_date, status)
              VALUES ($1, $2, $3, 'completed')
              RETURNING id
            `, [eventName, state || null, parsedDate.toISOString().split('T')[0]]);
            
            eventIdForSignup = inserted.rows[0].id;
            result.eventsCreated++;
          }
          eventMap.set(key, eventIdForSignup!);
        }
      }
      
      // Insert signup
      try {
        await client.query(`
          INSERT INTO signups (
            event_id, ambassador_id, operator_id, operator_name,
            customer_first_name, customer_last_name, customer_email,
            cpa_applied, validation_status, submitted_at, source_type, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'validated', $9, 'event', $10)
        `, [
          eventIdForSignup,
          ambassadorId,
          operatorId,
          operator,
          firstname || 'Unknown',
          lastname || '',
          email || null,
          parsedCpa,
          parsedDate || new Date(),
          `Historical CSV Import (${importId})`,
        ]);
        
        result.inserted++;
      } catch (error: unknown) {
        const err = error as Error;
        result.errors.push(`Row ${rowNum}: ${err.message}`);
        result.skipped++;
      }
    }
    
    await client.query('COMMIT');
    
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    const err = error as Error;
    result.errors.push(`Transaction failed: ${err.message}`);
  } finally {
    client.release();
  }
  
  return result;
}
