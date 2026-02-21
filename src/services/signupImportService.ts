/**
 * Sign-Up Import Service - WO-92
 * Handles importing historical sign-up data from CSV files
 * 
 * Features:
 * - CSV upload with columns: date, ambassador, customer_email, customer_name, operator, state, cpa
 * - Create SignUp records
 * - Duplicate detection (email + operator + date)
 * - Apply correct CPA rates from time of sign-up
 * - Audit logging
 */

import { pool } from '../config/database.js';
import { randomUUID } from 'crypto';
import * as crypto from 'crypto';
import { logger } from '../utils/logger.js';

// CSV Column indices (0-based) - flexible matching by header name
const DEFAULT_COLUMNS = {
  DATE: 'date',
  AMBASSADOR: 'ambassador',
  CUSTOMER_EMAIL: 'customer_email',
  CUSTOMER_NAME: 'customer_name',
  OPERATOR: 'operator',
  STATE: 'state',
  CPA: 'cpa',
};

export interface SignupImportOptions {
  defaultYear?: number;
  dryRun?: boolean;
  importedBy?: string;
  skipDuplicates?: boolean;
}

export interface SignupImportResult {
  importId: string;
  status: 'completed' | 'failed' | 'partial';
  totalRows: number;
  processedRows: number;
  createdSignups: number;
  skippedDuplicates: number;
  skippedRows: number;
  errorRows: number;
  errors: Array<{ row: number; message: string }>;
  warnings: Array<{ row: number; message: string }>;
}

interface ParsedSignupRow {
  rowNumber: number;
  date: Date | null;
  ambassadorIdentifier: string; // email or name
  customerEmail: string;
  customerName: string;
  operatorIdentifier: string; // name or ID
  state: string;
  cpaOverride: number | null;
  rawData: string[];
}

interface ColumnMapping {
  date: number;
  ambassador: number;
  customerEmail: number;
  customerName: number;
  operator: number;
  state: number;
  cpa: number;
}

/**
 * Parse a currency string like "$125.00" or "125" to a number
 */
function parseCurrency(value: string | undefined): number | null {
  if (!value || value.trim() === '' || value === 'N/A' || value === '-') return null;
  const cleaned = value.replace(/[$,]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Parse various date formats
 * Supports: YYYY-MM-DD, MM/DD/YYYY, MM/DD/YY, "Mon, MM/DD" with default year
 */
function parseSignupDate(dateStr: string | undefined, defaultYear: number): Date | null {
  if (!dateStr || dateStr.trim() === '' || dateStr === 'NA' || dateStr === '-') return null;
  
  const trimmed = dateStr.trim();
  
  // ISO format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = new Date(trimmed + 'T12:00:00Z');
    return isNaN(d.getTime()) ? null : d;
  }
  
  // US format: MM/DD/YYYY
  let match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const [, month, day, year] = match;
    const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    return isNaN(d.getTime()) ? null : d;
  }
  
  // Short US format: MM/DD/YY
  match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (match) {
    const [, month, day, shortYear] = match;
    const year = parseInt(shortYear) > 50 ? 1900 + parseInt(shortYear) : 2000 + parseInt(shortYear);
    const d = new Date(year, parseInt(month) - 1, parseInt(day));
    return isNaN(d.getTime()) ? null : d;
  }
  
  // Format: "Fri, 01/2" or "01/2" (day/month with default year)
  match = trimmed.match(/(\d{1,2})\/(\d{1,2})$/);
  if (match) {
    const [, month, day] = match;
    const d = new Date(defaultYear, parseInt(month) - 1, parseInt(day));
    return isNaN(d.getTime()) ? null : d;
  }
  
  return null;
}

/**
 * Parse customer name into first/last
 */
function parseCustomerName(fullName: string): { firstName: string; lastName: string } {
  if (!fullName || !fullName.trim()) {
    return { firstName: 'Unknown', lastName: 'Customer' };
  }
  
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }
  
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');
  return { firstName, lastName };
}

/**
 * Parse CSV content into rows
 */
function parseCSV(content: string): string[][] {
  const lines = content.split('\n');
  const rows: string[][] = [];
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    // Handle quoted fields with commas
    const row: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        row.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    row.push(current.trim());
    rows.push(row);
  }
  
  return rows;
}

/**
 * Find header row and build column mapping
 */
function findHeaderAndMapColumns(rows: string[][]): { headerIndex: number; mapping: ColumnMapping } | null {
  const requiredColumns = ['date', 'ambassador', 'customer_email', 'operator'];
  
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i].map(c => c.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_'));
    
    // Check if this looks like a header row
    const hasDate = row.some(c => c.includes('date'));
    const hasAmbassador = row.some(c => c.includes('ambassador') || c.includes('rep'));
    const hasEmail = row.some(c => c.includes('email') || c.includes('customer_email'));
    
    if (hasDate && hasAmbassador && hasEmail) {
      const mapping: ColumnMapping = {
        date: row.findIndex(c => c.includes('date')),
        ambassador: row.findIndex(c => c.includes('ambassador') || c.includes('rep')),
        customerEmail: row.findIndex(c => c.includes('customer_email') || c === 'email'),
        customerName: row.findIndex(c => c.includes('customer_name') || c.includes('name') && !c.includes('email')),
        operator: row.findIndex(c => c.includes('operator') || c.includes('book')),
        state: row.findIndex(c => c.includes('state') || c === 'st'),
        cpa: row.findIndex(c => c.includes('cpa') || c.includes('rate')),
      };
      
      return { headerIndex: i, mapping };
    }
  }
  
  return null;
}

/**
 * Parse a single data row
 */
function parseDataRow(
  row: string[], 
  rowNumber: number, 
  mapping: ColumnMapping,
  defaultYear: number
): ParsedSignupRow | null {
  const email = row[mapping.customerEmail]?.trim().toLowerCase();
  
  // Skip rows without email
  if (!email || !email.includes('@')) {
    return null;
  }
  
  return {
    rowNumber,
    date: parseSignupDate(row[mapping.date], defaultYear),
    ambassadorIdentifier: row[mapping.ambassador]?.trim() || '',
    customerEmail: email,
    customerName: mapping.customerName >= 0 ? row[mapping.customerName]?.trim() || '' : '',
    operatorIdentifier: row[mapping.operator]?.trim() || '',
    state: mapping.state >= 0 ? row[mapping.state]?.trim().toUpperCase() || '' : '',
    cpaOverride: mapping.cpa >= 0 ? parseCurrency(row[mapping.cpa]) : null,
    rawData: row,
  };
}

/**
 * Resolve ambassador by email or name
 */
async function resolveAmbassador(identifier: string): Promise<{ id: string; name: string } | null> {
  if (!identifier) return null;
  
  // Try by email first
  if (identifier.includes('@')) {
    const result = await pool.query(
      `SELECT id, CONCAT(first_name, ' ', last_name) as name 
       FROM ambassadors WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [identifier]
    );
    if (result.rows.length > 0) {
      return { id: result.rows[0].id, name: result.rows[0].name };
    }
  }
  
  // Try by name (fuzzy match)
  const parts = identifier.split(/\s+/);
  let result;
  
  if (parts.length >= 2) {
    result = await pool.query(
      `SELECT id, CONCAT(first_name, ' ', last_name) as name 
       FROM ambassadors 
       WHERE LOWER(first_name) = LOWER($1) AND LOWER(last_name) = LOWER($2)
       LIMIT 1`,
      [parts[0], parts.slice(1).join(' ')]
    );
  } else {
    result = await pool.query(
      `SELECT id, CONCAT(first_name, ' ', last_name) as name 
       FROM ambassadors 
       WHERE LOWER(first_name) = LOWER($1) OR LOWER(last_name) = LOWER($1)
       LIMIT 1`,
      [identifier]
    );
  }
  
  if (result.rows.length > 0) {
    return { id: result.rows[0].id, name: result.rows[0].name };
  }
  
  return null;
}

/**
 * Resolve operator by name or ID
 */
async function resolveOperator(identifier: string): Promise<{ id: number; name: string } | null> {
  if (!identifier) return null;
  
  // Try by ID if numeric
  if (/^\d+$/.test(identifier)) {
    const result = await pool.query(
      'SELECT id, display_name as name FROM operators WHERE id = $1',
      [parseInt(identifier)]
    );
    if (result.rows.length > 0) {
      return { id: result.rows[0].id, name: result.rows[0].name };
    }
  }
  
  // Try by name (case-insensitive partial match)
  const result = await pool.query(
    `SELECT id, display_name as name FROM operators 
     WHERE LOWER(display_name) LIKE LOWER($1) OR LOWER(short_name) = LOWER($2)
     LIMIT 1`,
    [`%${identifier}%`, identifier]
  );
  
  if (result.rows.length > 0) {
    return { id: result.rows[0].id, name: result.rows[0].name };
  }
  
  return null;
}

/**
 * Check for duplicate signup (email + operator + date)
 */
async function checkDuplicate(
  email: string, 
  operatorId: number, 
  date: Date | null
): Promise<string | null> {
  let query = `
    SELECT id FROM signups 
    WHERE LOWER(customer_email) = LOWER($1) AND operator_id = $2
  `;
  const params: (string | number)[] = [email, operatorId];
  
  if (date) {
    query += ` AND DATE(submitted_at) = $3`;
    params.push(date.toISOString().split('T')[0]);
  }
  
  query += ' LIMIT 1';
  
  const result = await pool.query(query, params);
  return result.rows.length > 0 ? result.rows[0].id : null;
}

/**
 * Get CPA rate for operator/state at a specific date
 */
async function getCpaRateAtDate(
  operatorId: number, 
  stateCode: string, 
  date: Date
): Promise<number | null> {
  const dateStr = date.toISOString().split('T')[0];
  
  const result = await pool.query(
    `SELECT cpa_amount FROM cpa_rates
     WHERE operator_id = $1 
     AND state_code = $2
     AND effective_date <= $3
     AND (end_date IS NULL OR end_date >= $3)
     AND is_active = true
     ORDER BY effective_date DESC
     LIMIT 1`,
    [operatorId, stateCode, dateStr]
  );
  
  return result.rows.length > 0 ? parseFloat(result.rows[0].cpa_amount) : null;
}

/**
 * Get current open pay period for a date
 */
async function getPayPeriodForDate(date: Date): Promise<string | null> {
  const dateStr = date.toISOString().split('T')[0];
  
  const result = await pool.query(
    `SELECT id FROM pay_periods 
     WHERE start_date <= $1 AND end_date >= $1
     LIMIT 1`,
    [dateStr]
  );
  
  return result.rows.length > 0 ? result.rows[0].id : null;
}

/**
 * Import sign-ups from CSV file
 */
export async function importSignups(
  csvContent: string,
  filename: string,
  options: SignupImportOptions = {}
): Promise<SignupImportResult> {
  const importId = randomUUID();
  const defaultYear = options.defaultYear || new Date().getFullYear();
  const errors: Array<{ row: number; message: string }> = [];
  const warnings: Array<{ row: number; message: string }> = [];
  
  let createdSignups = 0;
  let skippedDuplicates = 0;
  let skippedRows = 0;
  let errorRows = 0;
  let processedRows = 0;
  
  // Calculate file hash for deduplication
  const fileHash = crypto.createHash('sha256').update(csvContent).digest('hex');
  
  // Create import log entry
  await pool.query(`
    INSERT INTO signup_import_logs 
    (id, filename, file_hash, status, imported_by, started_at, options)
    VALUES ($1, $2, $3, 'processing', $4, NOW(), $5)
  `, [importId, filename, fileHash, options.importedBy || 'system', JSON.stringify(options)]);
  
  try {
    // Parse CSV
    const rows = parseCSV(csvContent);
    const headerResult = findHeaderAndMapColumns(rows);
    
    if (!headerResult) {
      throw new Error('Could not find valid header row in CSV. Expected columns: date, ambassador, customer_email, operator');
    }
    
    const { headerIndex, mapping } = headerResult;
    const dataRows = rows.slice(headerIndex + 1);
    const totalRows = dataRows.length;
    
    logger.info({ importId, totalRows, headerIndex }, 'Starting signup import');
    
    // Process each row
    for (let i = 0; i < dataRows.length; i++) {
      const rowNumber = headerIndex + 2 + i; // 1-indexed, accounting for header
      
      try {
        const parsed = parseDataRow(dataRows[i], rowNumber, mapping, defaultYear);
        
        if (!parsed) {
          skippedRows++;
          warnings.push({ row: rowNumber, message: 'Missing or invalid email' });
          continue;
        }
        
        // Resolve ambassador
        const ambassador = await resolveAmbassador(parsed.ambassadorIdentifier);
        if (!ambassador) {
          errors.push({ row: rowNumber, message: `Ambassador not found: ${parsed.ambassadorIdentifier}` });
          errorRows++;
          continue;
        }
        
        // Resolve operator
        const operator = await resolveOperator(parsed.operatorIdentifier);
        if (!operator) {
          errors.push({ row: rowNumber, message: `Operator not found: ${parsed.operatorIdentifier}` });
          errorRows++;
          continue;
        }
        
        // Check for duplicates
        const duplicateId = await checkDuplicate(parsed.customerEmail, operator.id, parsed.date);
        if (duplicateId) {
          skippedDuplicates++;
          warnings.push({ row: rowNumber, message: `Duplicate signup: ${duplicateId}` });
          
          // Log the skip
          await pool.query(`
            INSERT INTO signup_import_row_details
            (id, import_log_id, row_number, status, action, message, customer_email, operator_id, raw_data)
            VALUES ($1, $2, $3, 'skipped', 'duplicate', $4, $5, $6, $7)
          `, [
            randomUUID(), importId, rowNumber, 
            `Duplicate of ${duplicateId}`, 
            parsed.customerEmail, operator.id, 
            JSON.stringify(parsed.rawData)
          ]);
          
          continue;
        }
        
        if (options.dryRun) {
          processedRows++;
          continue;
        }
        
        // Determine CPA amount
        let cpaAmount = parsed.cpaOverride;
        if (cpaAmount === null && parsed.state && parsed.date) {
          cpaAmount = await getCpaRateAtDate(operator.id, parsed.state, parsed.date);
        }
        
        // Get pay period
        const payPeriodId = parsed.date ? await getPayPeriodForDate(parsed.date) : null;
        
        // Parse customer name
        const { firstName, lastName } = parseCustomerName(parsed.customerName);
        
        // Create signup
        const signupId = randomUUID();
        const submittedAt = parsed.date || new Date();
        
        await pool.query(`
          INSERT INTO signups (
            id, event_id, ambassador_id, pay_period_id,
            customer_first_name, customer_last_name, customer_email, customer_state,
            operator_id, operator_name,
            validation_status, submitted_at, source_type, import_batch_id
          ) VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, 'validated', $10, 'import', $11)
        `, [
          signupId, ambassador.id, payPeriodId,
          firstName, lastName, parsed.customerEmail, parsed.state || null,
          operator.id, operator.name,
          submittedAt, importId
        ]);
        
        // Store CPA attribution if we have the rate
        if (cpaAmount !== null) {
          // Find the CPA rate record
          const rateResult = await pool.query(
            `SELECT id FROM cpa_rates 
             WHERE operator_id = $1 AND state_code = $2 
             AND effective_date <= $3
             AND (end_date IS NULL OR end_date >= $3)
             AND is_active = true
             ORDER BY effective_date DESC LIMIT 1`,
            [operator.id, parsed.state, submittedAt.toISOString().split('T')[0]]
          );
          
          if (rateResult.rows.length > 0) {
            await pool.query(`
              INSERT INTO signup_cpa_attribution (signup_id, cpa_rate_id, attributed_amount, attribution_date)
              VALUES ($1, $2, $3, $4)
              ON CONFLICT (signup_id) DO UPDATE SET cpa_rate_id = $2, attributed_amount = $3
            `, [signupId, rateResult.rows[0].id, cpaAmount, submittedAt.toISOString().split('T')[0]]);
          }
        }
        
        // Log success
        await pool.query(`
          INSERT INTO signup_import_row_details
          (id, import_log_id, row_number, status, action, signup_id, customer_email, operator_id, ambassador_id, cpa_applied, raw_data)
          VALUES ($1, $2, $3, 'success', 'created', $4, $5, $6, $7, $8, $9)
        `, [
          randomUUID(), importId, rowNumber, signupId,
          parsed.customerEmail, operator.id, ambassador.id, cpaAmount,
          JSON.stringify(parsed.rawData)
        ]);
        
        createdSignups++;
        processedRows++;
        
      } catch (err: any) {
        errors.push({ row: rowNumber, message: err.message });
        errorRows++;
        
        // Log error
        await pool.query(`
          INSERT INTO signup_import_row_details
          (id, import_log_id, row_number, status, message, raw_data)
          VALUES ($1, $2, $3, 'error', $4, $5)
        `, [
          randomUUID(), importId, rowNumber, err.message,
          JSON.stringify(dataRows[i])
        ]);
      }
    }
    
    // Determine final status
    const finalStatus = errorRows > 0 
      ? (createdSignups > 0 ? 'partial' : 'failed') 
      : 'completed';
    
    // Update import log
    await pool.query(`
      UPDATE signup_import_logs SET
        status = $2,
        total_rows = $3,
        processed_rows = $4,
        created_signups = $5,
        skipped_duplicates = $6,
        skipped_rows = $7,
        error_rows = $8,
        errors = $9,
        warnings = $10,
        completed_at = NOW()
      WHERE id = $1
    `, [
      importId, finalStatus, totalRows, processedRows,
      createdSignups, skippedDuplicates, skippedRows, errorRows,
      JSON.stringify(errors), JSON.stringify(warnings)
    ]);
    
    logger.info({ 
      importId, 
      status: finalStatus, 
      createdSignups, 
      skippedDuplicates, 
      errorRows 
    }, 'Signup import completed');
    
    return {
      importId,
      status: finalStatus as 'completed' | 'failed' | 'partial',
      totalRows,
      processedRows,
      createdSignups,
      skippedDuplicates,
      skippedRows,
      errorRows,
      errors,
      warnings,
    };
    
  } catch (err: any) {
    // Update import log with failure
    await pool.query(`
      UPDATE signup_import_logs SET
        status = 'failed',
        errors = $2,
        completed_at = NOW()
      WHERE id = $1
    `, [importId, JSON.stringify([{ row: 0, message: err.message }])]);
    
    logger.error({ importId, error: err.message }, 'Signup import failed');
    throw err;
  }
}

/**
 * Get import status by ID
 */
export async function getSignupImportStatus(importId: string): Promise<any> {
  const result = await pool.query(
    'SELECT * FROM signup_import_logs WHERE id = $1',
    [importId]
  );
  
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Get import row details
 */
export async function getSignupImportRowDetails(
  importId: string, 
  options: { status?: string; limit?: number; offset?: number } = {}
): Promise<any[]> {
  let query = 'SELECT * FROM signup_import_row_details WHERE import_log_id = $1';
  const params: any[] = [importId];
  
  if (options.status) {
    params.push(options.status);
    query += ` AND status = $${params.length}`;
  }
  
  query += ' ORDER BY row_number ASC';
  
  if (options.limit) {
    params.push(options.limit);
    query += ` LIMIT $${params.length}`;
  }
  
  if (options.offset) {
    params.push(options.offset);
    query += ` OFFSET $${params.length}`;
  }
  
  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * List recent imports
 */
export async function listSignupImports(
  options: { limit?: number; status?: string } = {}
): Promise<any[]> {
  let query = 'SELECT * FROM signup_import_logs';
  const params: any[] = [];
  
  if (options.status) {
    params.push(options.status);
    query += ` WHERE status = $${params.length}`;
  }
  
  query += ' ORDER BY started_at DESC';
  
  if (options.limit) {
    params.push(options.limit);
    query += ` LIMIT $${params.length}`;
  }
  
  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Get import summary statistics
 */
export async function getImportSummary(): Promise<{
  totalImports: number;
  totalSignupsCreated: number;
  totalDuplicatesSkipped: number;
  lastImportAt: Date | null;
}> {
  const result = await pool.query(`
    SELECT 
      COUNT(*) as total_imports,
      COALESCE(SUM(created_signups), 0) as total_signups_created,
      COALESCE(SUM(skipped_duplicates), 0) as total_duplicates_skipped,
      MAX(completed_at) as last_import_at
    FROM signup_import_logs
    WHERE status IN ('completed', 'partial')
  `);
  
  const row = result.rows[0];
  return {
    totalImports: parseInt(row.total_imports),
    totalSignupsCreated: parseInt(row.total_signups_created),
    totalDuplicatesSkipped: parseInt(row.total_duplicates_skipped),
    lastImportAt: row.last_import_at,
  };
}

/**
 * Rollback an import (delete all signups created by this import)
 */
export async function rollbackSignupImport(importId: string): Promise<{
  deletedSignups: number;
  success: boolean;
}> {
  // Get count first
  const countResult = await pool.query(
    'SELECT COUNT(*) as count FROM signups WHERE import_batch_id = $1',
    [importId]
  );
  
  const deletedSignups = parseInt(countResult.rows[0].count);
  
  // Delete signups
  await pool.query('DELETE FROM signups WHERE import_batch_id = $1', [importId]);
  
  // Update import log
  await pool.query(`
    UPDATE signup_import_logs SET
      status = 'rolled_back',
      rollback_at = NOW()
    WHERE id = $1
  `, [importId]);
  
  logger.info({ importId, deletedSignups }, 'Signup import rolled back');
  
  return { deletedSignups, success: true };
}
