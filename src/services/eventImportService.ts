/**
 * Event Import Service - WO-88
 * Handles importing historical event data from CSV files
 */

import { pool } from '../config/database.js';
import { randomUUID } from 'crypto';
import * as crypto from 'crypto';
import { logger } from '../utils/logger.js';

// CSV Column mappings (can be configured or auto-detected)
export interface EventImportColumns {
  eventDate: number;
  venue: number;
  city: number;
  state: number;
  ambassadors: number;
  signups: number;
  eventType?: number;
  startTime?: number;
  endTime?: number;
  notes?: number;
}

// Default column indices based on expected CSV format
const DEFAULT_COLUMNS: EventImportColumns = {
  eventDate: 0,
  venue: 1,
  city: 2,
  state: 3,
  ambassadors: 4,
  signups: 5,
  eventType: 6,
  startTime: 7,
  endTime: 8,
  notes: 9,
};

export interface EventImportOptions {
  defaultYear?: number;
  dryRun?: boolean;
  importedBy?: string;
  columnMapping?: Partial<EventImportColumns>;
  skipHeaderRows?: number;
}

export interface EventImportResult {
  importId: string;
  status: 'completed' | 'failed' | 'partial';
  totalRows: number;
  processedRows: number;
  createdEvents: number;
  updatedEvents: number;
  createdPerformanceRecords: number;
  skippedRows: number;
  errorRows: number;
  duplicatesFound: number;
  errors: Array<{ row: number; message: string }>;
  warnings: Array<{ row: number; message: string }>;
}

interface ParsedEventRow {
  rowNumber: number;
  eventDate: Date | null;
  venue: string;
  city: string;
  state: string;
  ambassadors: string[];  // List of ambassador names/identifiers
  signups: number;
  eventType: string;
  startTime: string | null;
  endTime: string | null;
  notes: string | null;
  rawData: string[];
}

interface AmbassadorMatch {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

/**
 * Parse CSV content into rows
 */
function parseCSV(content: string): string[][] {
  const lines = content.split('\n');
  const rows: string[][] = [];
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    // CSV parsing with quote handling
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
 * Parse date string in various formats
 */
function parseEventDate(dateStr: string | undefined, defaultYear: number): Date | null {
  if (!dateStr || dateStr.trim() === '' || dateStr.toLowerCase() === 'na') return null;
  
  // Try multiple formats
  const trimmed = dateStr.trim();
  
  // Format: MM/DD/YYYY or MM/DD/YY
  let match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (match) {
    const month = parseInt(match[1], 10) - 1;
    const day = parseInt(match[2], 10);
    let year = parseInt(match[3], 10);
    if (year < 100) year += 2000;
    return new Date(year, month, day);
  }
  
  // Format: YYYY-MM-DD
  match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    return new Date(year, month, day);
  }
  
  // Format: "Fri, 01/2" or "Sat, 01/10" (day of week + MM/DD)
  match = trimmed.match(/(\d{1,2})\/(\d{1,2})/);
  if (match) {
    const month = parseInt(match[1], 10) - 1;
    const day = parseInt(match[2], 10);
    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      return new Date(defaultYear, month, day);
    }
  }
  
  return null;
}

/**
 * Parse ambassador list (can be comma-separated, semicolon-separated, etc.)
 */
function parseAmbassadors(ambassadorStr: string | undefined): string[] {
  if (!ambassadorStr || ambassadorStr.trim() === '') return [];
  
  // Try different separators
  const separators = [';', ',', '|', '\n'];
  
  for (const sep of separators) {
    if (ambassadorStr.includes(sep)) {
      return ambassadorStr
        .split(sep)
        .map(a => a.trim())
        .filter(a => a.length > 0);
    }
  }
  
  // Single ambassador
  return [ambassadorStr.trim()];
}

/**
 * Parse integer from string, returning 0 for invalid values
 */
function parseInteger(value: string | undefined): number {
  if (!value || value.trim() === '') return 0;
  const num = parseInt(value.trim(), 10);
  return isNaN(num) ? 0 : num;
}

/**
 * Find header row and return its index (-1 if not found)
 */
function findHeaderRow(rows: string[][]): number {
  const headerIndicators = ['event_date', 'date', 'venue', 'city', 'state', 'ambassadors', 'signups'];
  
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i].map(cell => cell.toLowerCase().trim());
    const matchCount = headerIndicators.filter(h => row.some(cell => cell.includes(h))).length;
    if (matchCount >= 3) {
      return i;
    }
  }
  return -1;
}

/**
 * Auto-detect column mapping from header row
 */
function detectColumnMapping(headerRow: string[]): EventImportColumns {
  const mapping: Partial<EventImportColumns> = {};
  
  const normalizedHeaders = headerRow.map(h => h.toLowerCase().trim());
  
  for (let i = 0; i < normalizedHeaders.length; i++) {
    const header = normalizedHeaders[i];
    
    if (header.includes('event_date') || header === 'date' || header.includes('event date')) {
      mapping.eventDate = i;
    } else if (header === 'venue' || header.includes('venue')) {
      mapping.venue = i;
    } else if (header === 'city' || header.includes('city')) {
      mapping.city = i;
    } else if (header === 'state' || header.includes('state')) {
      mapping.state = i;
    } else if (header.includes('ambassador') || header.includes('staff')) {
      mapping.ambassadors = i;
    } else if (header.includes('signup') || header.includes('sign_up') || header.includes('sign-up')) {
      mapping.signups = i;
    } else if (header.includes('event_type') || header.includes('type')) {
      mapping.eventType = i;
    } else if (header.includes('start_time') || header.includes('start time') || header === 'start') {
      mapping.startTime = i;
    } else if (header.includes('end_time') || header.includes('end time') || header === 'end') {
      mapping.endTime = i;
    } else if (header.includes('note') || header.includes('notes') || header.includes('comment')) {
      mapping.notes = i;
    }
  }
  
  return { ...DEFAULT_COLUMNS, ...mapping };
}

/**
 * Parse a single data row into structured event data
 */
function parseDataRow(
  row: string[], 
  rowNumber: number, 
  columns: EventImportColumns,
  defaultYear: number
): ParsedEventRow | null {
  const venue = row[columns.venue]?.trim();
  
  // Skip empty rows
  if (!venue) return null;
  
  const eventDate = parseEventDate(row[columns.eventDate], defaultYear);
  const city = row[columns.city]?.trim() || '';
  const state = row[columns.state]?.trim() || '';
  const ambassadors = parseAmbassadors(row[columns.ambassadors]);
  const signups = parseInteger(row[columns.signups]);
  const eventType = columns.eventType !== undefined ? row[columns.eventType]?.trim() || 'activation' : 'activation';
  const startTime = columns.startTime !== undefined ? row[columns.startTime]?.trim() || null : null;
  const endTime = columns.endTime !== undefined ? row[columns.endTime]?.trim() || null : null;
  const notes = columns.notes !== undefined ? row[columns.notes]?.trim() || null : null;
  
  return {
    rowNumber,
    eventDate,
    venue,
    city,
    state,
    ambassadors,
    signups,
    eventType,
    startTime,
    endTime,
    notes,
    rawData: row,
  };
}

/**
 * Find ambassador by name (fuzzy matching)
 */
async function findAmbassadorByName(name: string): Promise<AmbassadorMatch | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  
  // Try exact match first
  let result = await pool.query(`
    SELECT id, first_name, last_name, email
    FROM ambassadors
    WHERE LOWER(CONCAT(first_name, ' ', last_name)) = LOWER($1)
       OR LOWER(email) = LOWER($1)
    LIMIT 1
  `, [trimmed]);
  
  if (result.rows.length > 0) {
    return {
      id: result.rows[0].id,
      firstName: result.rows[0].first_name,
      lastName: result.rows[0].last_name,
      email: result.rows[0].email,
    };
  }
  
  // Try partial match (first name or last name)
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 1) {
    result = await pool.query(`
      SELECT id, first_name, last_name, email
      FROM ambassadors
      WHERE LOWER(first_name) = LOWER($1)
         OR LOWER(last_name) = LOWER($1)
         OR (LOWER(first_name) = LOWER($1) AND LOWER(last_name) = LOWER($2))
      LIMIT 1
    `, [parts[0], parts[1] || '']);
    
    if (result.rows.length > 0) {
      return {
        id: result.rows[0].id,
        firstName: result.rows[0].first_name,
        lastName: result.rows[0].last_name,
        email: result.rows[0].email,
      };
    }
  }
  
  return null;
}

/**
 * Find existing event by date + venue (deduplication)
 */
async function findExistingEvent(
  eventDate: Date | null,
  venue: string
): Promise<{ id: string; title: string } | null> {
  if (!eventDate) return null;
  
  const dateStr = eventDate.toISOString().split('T')[0];
  
  const result = await pool.query(`
    SELECT id, title
    FROM events
    WHERE event_date = $1
      AND (
        LOWER(TRIM(venue)) = LOWER(TRIM($2))
        OR LOWER(TRIM(title)) LIKE LOWER(TRIM($2)) || '%'
        OR LOWER(TRIM($2)) LIKE LOWER(TRIM(venue)) || '%'
      )
    LIMIT 1
  `, [dateStr, venue]);
  
  return result.rows.length > 0 
    ? { id: result.rows[0].id, title: result.rows[0].title }
    : null;
}

/**
 * Create event with completed status
 */
async function createCompletedEvent(row: ParsedEventRow): Promise<string> {
  const eventId = randomUUID();
  const title = `${row.venue} - ${row.city}`;
  const eventType = mapEventType(row.eventType);
  
  await pool.query(`
    INSERT INTO events (
      id, title, venue, city, state, event_date, start_time, end_time,
      event_type, status, completed_at, notes, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'completed', NOW(), $10, NOW(), NOW())
  `, [
    eventId,
    title,
    row.venue,
    row.city,
    row.state,
    row.eventDate ? row.eventDate.toISOString().split('T')[0] : null,
    row.startTime,
    row.endTime,
    eventType,
    row.notes,
  ]);
  
  return eventId;
}

/**
 * Map event type string to valid enum
 */
function mapEventType(typeStr: string): string {
  const typeMap: Record<string, string> = {
    'bar': 'activation',
    'tailgate': 'activation',
    'activation': 'activation',
    'promotion': 'promotion',
    'tournament': 'tournament',
    'watch_party': 'watch_party',
    'watch party': 'watch_party',
    'corporate': 'corporate',
    'other': 'other',
    '': 'activation',
  };
  
  return typeMap[typeStr.toLowerCase()] || 'activation';
}

/**
 * Create ambassador performance history record
 */
async function createPerformanceHistory(
  ambassadorId: string,
  eventId: string,
  eventDate: Date,
  signups: number
): Promise<string> {
  const recordId = randomUUID();
  
  // Create a period spanning the event date
  const periodStart = new Date(eventDate);
  periodStart.setHours(0, 0, 0, 0);
  
  const periodEnd = new Date(eventDate);
  periodEnd.setHours(23, 59, 59, 999);
  
  await pool.query(`
    INSERT INTO ambassador_performance_history (
      id, ambassador_id, period_start, period_end,
      total_signups, validated_signups, rejected_signups,
      total_events, total_hours, notes, calculated_at, created_at
    ) VALUES ($1, $2, $3, $4, $5, $5, 0, 1, 4, $6, NOW(), NOW())
    ON CONFLICT (ambassador_id, period_start, period_end) 
    DO UPDATE SET
      total_signups = ambassador_performance_history.total_signups + EXCLUDED.total_signups,
      total_events = ambassador_performance_history.total_events + 1,
      calculated_at = NOW()
  `, [
    recordId,
    ambassadorId,
    periodStart.toISOString().split('T')[0],
    periodEnd.toISOString().split('T')[0],
    signups,
    `Imported from historical event: ${eventId}`,
  ]);
  
  return recordId;
}

/**
 * Create event assignment for ambassador
 */
async function createEventAssignment(
  eventId: string,
  ambassadorId: string,
  signups: number
): Promise<void> {
  const assignmentId = randomUUID();
  
  await pool.query(`
    INSERT INTO event_assignments (
      id, event_id, ambassador_id, role, status, total_signups, created_at
    ) VALUES ($1, $2, $3, 'ambassador', 'completed', $4, NOW())
    ON CONFLICT (event_id, ambassador_id) DO UPDATE SET
      total_signups = EXCLUDED.total_signups
  `, [assignmentId, eventId, ambassadorId, signups]);
}

/**
 * Log import audit entry
 */
async function logAuditEntry(
  importId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  details: Record<string, unknown>,
  performedBy: string
): Promise<void> {
  await pool.query(`
    INSERT INTO event_import_audit_log (
      id, import_id, action, entity_type, entity_id, details, performed_by, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
  `, [randomUUID(), importId, action, entityType, entityId, JSON.stringify(details), performedBy]);
}

/**
 * Import historical events from CSV
 */
export async function importHistoricalEvents(
  csvContent: string,
  filename: string,
  options: EventImportOptions = {}
): Promise<EventImportResult> {
  const importId = randomUUID();
  const defaultYear = options.defaultYear || new Date().getFullYear();
  const skipHeaderRows = options.skipHeaderRows ?? 1;
  const importedBy = options.importedBy || 'system';
  
  const errors: Array<{ row: number; message: string }> = [];
  const warnings: Array<{ row: number; message: string }> = [];
  
  let createdEvents = 0;
  let updatedEvents = 0;
  let createdPerformanceRecords = 0;
  let skippedRows = 0;
  let errorRows = 0;
  let processedRows = 0;
  let duplicatesFound = 0;
  
  // Calculate file hash for deduplication
  const fileHash = crypto.createHash('sha256').update(csvContent).digest('hex');
  
  // Create import log entry (reuses financial_import_logs table)
  await pool.query(`
    INSERT INTO financial_import_logs (
      id, import_type, filename, file_hash, status, imported_by, started_at, created_at
    ) VALUES ($1, 'historical_events', $2, $3, 'processing', $4, NOW(), NOW())
  `, [importId, filename, fileHash, importedBy]);
  
  try {
    // Parse CSV
    const rows = parseCSV(csvContent);
    
    if (rows.length === 0) {
      throw new Error('CSV file is empty');
    }
    
    // Find header and detect column mapping
    const headerIndex = findHeaderRow(rows);
    let columns = { ...DEFAULT_COLUMNS, ...options.columnMapping };
    
    if (headerIndex >= 0) {
      columns = { ...detectColumnMapping(rows[headerIndex]), ...options.columnMapping };
    }
    
    // Determine starting row
    const dataStartIndex = headerIndex >= 0 ? headerIndex + 1 : skipHeaderRows;
    const dataRows = rows.slice(dataStartIndex);
    const totalRows = dataRows.length;
    
    logger.info({ importId, totalRows, headerIndex }, 'Starting event import');
    
    // Process each row
    for (let i = 0; i < dataRows.length; i++) {
      const rowNumber = dataStartIndex + i + 1; // 1-indexed for user display
      
      try {
        const parsed = parseDataRow(dataRows[i], rowNumber, columns, defaultYear);
        
        if (!parsed) {
          skippedRows++;
          continue;
        }
        
        if (!parsed.eventDate) {
          warnings.push({ row: rowNumber, message: 'Missing or invalid event date' });
        }
        
        // Check for duplicate (existing event with same date + venue)
        const existing = await findExistingEvent(parsed.eventDate, parsed.venue);
        let eventId: string;
        
        if (existing) {
          duplicatesFound++;
          eventId = existing.id;
          
          if (!options.dryRun) {
            // Update existing event's notes if needed
            if (parsed.notes) {
              await pool.query(`
                UPDATE events SET notes = COALESCE(notes, '') || E'\n[Import] ' || $1, updated_at = NOW()
                WHERE id = $2
              `, [parsed.notes, eventId]);
            }
            updatedEvents++;
          }
          
          warnings.push({ 
            row: rowNumber, 
            message: `Matched existing event: ${existing.title} (${eventId})` 
          });
        } else {
          // Create new event
          if (!options.dryRun) {
            eventId = await createCompletedEvent(parsed);
            createdEvents++;
            
            await logAuditEntry(importId, 'create_event', 'event', eventId, {
              venue: parsed.venue,
              city: parsed.city,
              state: parsed.state,
              eventDate: parsed.eventDate?.toISOString(),
              signups: parsed.signups,
            }, importedBy);
          } else {
            eventId = 'dry-run-' + randomUUID();
          }
        }
        
        // Process ambassadors
        if (parsed.ambassadors.length > 0 && !options.dryRun) {
          // Distribute signups among ambassadors
          const signupsPerAmbassador = Math.floor(parsed.signups / parsed.ambassadors.length);
          const remainingSignups = parsed.signups % parsed.ambassadors.length;
          
          for (let j = 0; j < parsed.ambassadors.length; j++) {
            const ambassadorName = parsed.ambassadors[j];
            const ambassador = await findAmbassadorByName(ambassadorName);
            
            if (ambassador) {
              // Calculate this ambassador's signups
              const ambassadorSignups = signupsPerAmbassador + (j < remainingSignups ? 1 : 0);
              
              // Create event assignment
              await createEventAssignment(eventId, ambassador.id, ambassadorSignups);
              
              // Create performance history if we have a valid date
              if (parsed.eventDate) {
                await createPerformanceHistory(
                  ambassador.id,
                  eventId,
                  parsed.eventDate,
                  ambassadorSignups
                );
                createdPerformanceRecords++;
              }
              
              await logAuditEntry(importId, 'link_ambassador', 'assignment', eventId, {
                ambassadorId: ambassador.id,
                ambassadorName: `${ambassador.firstName} ${ambassador.lastName}`,
                signups: ambassadorSignups,
              }, importedBy);
            } else {
              warnings.push({ 
                row: rowNumber, 
                message: `Ambassador not found: "${ambassadorName}"` 
              });
            }
          }
        }
        
        processedRows++;
        
        // Log row detail
        if (!options.dryRun) {
          await pool.query(`
            INSERT INTO financial_import_row_details (
              id, import_log_id, row_number, event_name, event_date, 
              status, action, event_id, raw_data, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
          `, [
            randomUUID(),
            importId,
            rowNumber,
            `${parsed.venue} - ${parsed.city}`,
            parsed.eventDate,
            'success',
            existing ? 'matched' : 'created',
            eventId,
            JSON.stringify(parsed.rawData),
          ]);
        }
        
      } catch (err: unknown) {
        const error = err as Error;
        errors.push({ row: rowNumber, message: error.message });
        errorRows++;
        
        // Log error detail
        await pool.query(`
          INSERT INTO financial_import_row_details (
            id, import_log_id, row_number, status, message, raw_data, created_at
          ) VALUES ($1, $2, $3, 'error', $4, $5, NOW())
        `, [
          randomUUID(),
          importId,
          rowNumber,
          error.message,
          JSON.stringify(dataRows[i]),
        ]);
      }
    }
    
    // Determine final status
    const finalStatus = errorRows > 0 
      ? (processedRows > 0 ? 'partial' : 'failed') 
      : 'completed';
    
    // Update import log with results
    await pool.query(`
      UPDATE financial_import_logs SET
        status = $2,
        total_rows = $3,
        processed_rows = $4,
        created_events = $5,
        updated_events = $6,
        created_performance_records = $7,
        skipped_rows = $8,
        error_rows = $9,
        duplicates_found = $10,
        errors = $11,
        warnings = $12,
        completed_at = NOW()
      WHERE id = $1
    `, [
      importId,
      finalStatus,
      totalRows,
      processedRows,
      createdEvents,
      updatedEvents,
      createdPerformanceRecords,
      skippedRows,
      errorRows,
      duplicatesFound,
      JSON.stringify(errors),
      JSON.stringify(warnings),
    ]);
    
    logger.info({ 
      importId, 
      status: finalStatus, 
      createdEvents, 
      updatedEvents,
      createdPerformanceRecords,
      duplicatesFound 
    }, 'Event import completed');
    
    return {
      importId,
      status: finalStatus as 'completed' | 'failed' | 'partial',
      totalRows,
      processedRows,
      createdEvents,
      updatedEvents,
      createdPerformanceRecords,
      skippedRows,
      errorRows,
      duplicatesFound,
      errors,
      warnings,
    };
    
  } catch (err: unknown) {
    const error = err as Error;
    
    // Update import log with failure
    await pool.query(`
      UPDATE financial_import_logs SET
        status = 'failed',
        errors = $2,
        completed_at = NOW()
      WHERE id = $1
    `, [importId, JSON.stringify([{ row: 0, message: error.message }])]);
    
    logger.error({ importId, error: error.message }, 'Event import failed');
    
    throw error;
  }
}

/**
 * Get import status by ID
 */
export async function getEventImportStatus(importId: string): Promise<any | null> {
  const result = await pool.query(`
    SELECT * FROM financial_import_logs WHERE id = $1
  `, [importId]);
  
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Get import row details
 */
export async function getEventImportRowDetails(
  importId: string, 
  options: { status?: string; limit?: number; offset?: number } = {}
): Promise<any[]> {
  let query = `SELECT * FROM financial_import_row_details WHERE import_log_id = $1`;
  const params: any[] = [importId];
  
  if (options.status) {
    params.push(options.status);
    query += ` AND status = $${params.length}`;
  }
  
  query += ` ORDER BY row_number ASC`;
  
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
 * List event imports
 */
export async function listEventImports(
  options: { limit?: number; status?: string } = {}
): Promise<any[]> {
  let query = `SELECT * FROM financial_import_logs WHERE import_type = 'historical_events'`;
  const params: any[] = [];
  
  if (options.status) {
    params.push(options.status);
    query += ` AND status = $${params.length}`;
  }
  
  query += ` ORDER BY created_at DESC`;
  
  if (options.limit) {
    params.push(options.limit);
    query += ` LIMIT $${params.length}`;
  }
  
  const result = await pool.query(query, params);
  return result.rows;
}

/**
 * Get import audit trail
 */
export async function getEventImportAuditTrail(
  importId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<any[]> {
  let query = `SELECT * FROM event_import_audit_log WHERE import_id = $1 ORDER BY created_at ASC`;
  const params: any[] = [importId];
  
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
 * Preview import (parse only, no database changes)
 */
export async function previewEventImport(
  csvContent: string,
  options: EventImportOptions = {}
): Promise<{
  totalRows: number;
  sampleRows: ParsedEventRow[];
  detectedColumns: EventImportColumns;
  potentialDuplicates: number;
  ambassadorsFound: number;
  ambassadorsNotFound: string[];
}> {
  const defaultYear = options.defaultYear || new Date().getFullYear();
  const rows = parseCSV(csvContent);
  
  if (rows.length === 0) {
    return {
      totalRows: 0,
      sampleRows: [],
      detectedColumns: DEFAULT_COLUMNS,
      potentialDuplicates: 0,
      ambassadorsFound: 0,
      ambassadorsNotFound: [],
    };
  }
  
  const headerIndex = findHeaderRow(rows);
  const columns = headerIndex >= 0 
    ? { ...detectColumnMapping(rows[headerIndex]), ...options.columnMapping }
    : { ...DEFAULT_COLUMNS, ...options.columnMapping };
  
  const dataStartIndex = headerIndex >= 0 ? headerIndex + 1 : (options.skipHeaderRows ?? 1);
  const dataRows = rows.slice(dataStartIndex);
  
  // Parse sample rows
  const sampleRows: ParsedEventRow[] = [];
  const ambassadorNames = new Set<string>();
  let potentialDuplicates = 0;
  
  for (let i = 0; i < Math.min(dataRows.length, 10); i++) {
    const parsed = parseDataRow(dataRows[i], dataStartIndex + i + 1, columns, defaultYear);
    if (parsed) {
      sampleRows.push(parsed);
      
      // Check for duplicates
      const existing = await findExistingEvent(parsed.eventDate, parsed.venue);
      if (existing) potentialDuplicates++;
      
      // Collect ambassador names
      parsed.ambassadors.forEach(a => ambassadorNames.add(a));
    }
  }
  
  // Check ambassador matches
  let ambassadorsFound = 0;
  const ambassadorsNotFound: string[] = [];
  
  for (const name of ambassadorNames) {
    const ambassador = await findAmbassadorByName(name);
    if (ambassador) {
      ambassadorsFound++;
    } else {
      ambassadorsNotFound.push(name);
    }
  }
  
  return {
    totalRows: dataRows.length,
    sampleRows,
    detectedColumns: columns,
    potentialDuplicates,
    ambassadorsFound,
    ambassadorsNotFound,
  };
}
