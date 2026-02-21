/**
 * Financial Import Service - WO-82
 * Handles importing historical budget and actuals data from CSV files
 */

import { pool } from '../config/database.js';
import { randomUUID } from 'crypto';
import * as crypto from 'crypto';
import { 
  calculateEventPerformanceScore, 
  EventFinancialData,
  PerformanceScoreResult 
} from '../utils/financialScoring.js';

// CSV Column indices (0-based) - based on actual CSV structure
const COL = {
  TYPE: 0,           // Budget/Actual
  DATE: 1,           // "Fri, 01/2" format
  NAME: 2,           // Event name
  EVENT_TYPE: 3,     // Bar, Tailgate, etc.
  STAFF: 4,          // Staff cost
  REIMBURSEMENTS: 5, // Reimbursements
  SIGNUPS: 6,        // Sign up count
  REWARDS: 7,        // Rewards cost
  BASE: 8,           // Base
  BONUS_KICKBACK: 9, // Bonus/kickback
  PARKING: 10,       // Parking
  SETUP: 11,         // Setup
  ADDITIONAL_1: 12,  // Additional Expense
  ADDITIONAL_2: 13,  // Additional Expense 2
  ADDITIONAL_3: 14,  // Additional Expense 3
  ADDITIONAL_4: 15,  // Additional Expense 4
  TOTAL_COST: 16,    // Total Cost
  REVENUE: 17,       // Revenue
  PROFIT: 18,        // Profitability
  MARGIN: 19         // % (profit margin)
};

export interface ImportOptions {
  defaultYear?: number;
  dryRun?: boolean;
  importedBy?: string;
}

export interface ImportResult {
  importId: string;
  status: 'completed' | 'failed' | 'partial';
  totalRows: number;
  processedRows: number;
  createdEvents: number;
  createdBudgets: number;
  createdActuals: number;
  updatedBudgets: number;
  updatedActuals: number;
  skippedRows: number;
  errorRows: number;
  errors: Array<{ row: number; message: string }>;
  warnings: Array<{ row: number; message: string }>;
}

interface ParsedRow {
  rowNumber: number;
  rowType: 'Budget' | 'Actual';
  date: Date | null;
  eventName: string;
  eventType: string;
  staff: number;
  reimbursements: number;
  signups: number;
  rewards: number;
  base: number;
  bonusKickback: number;
  parking: number;
  setup: number;
  additional1: number;
  additional2: number;
  additional3: number;
  additional4: number;
  totalCost: number;
  revenue: number;
  profit: number;
  marginPercent: number | null;
  rawData: string[];
}

/**
 * Parse a currency string like "$1,234.56" or "-$50.00" to a number
 */
function parseCurrency(value: string | undefined): number {
  if (!value || value.trim() === '' || value === '#DIV/0!') return 0;
  const cleaned = value.replace(/[$,]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Parse a percentage string like "57%" or "-32%" to a number
 */
function parsePercent(value: string | undefined): number | null {
  if (!value || value.trim() === '' || value === '#DIV/0!') return null;
  const cleaned = value.replace(/%/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Parse a date string like "Fri, 01/2" with a default year
 */
function parseEventDate(dateStr: string | undefined, defaultYear: number): Date | null {
  if (!dateStr || dateStr.trim() === '' || dateStr === 'NA') return null;
  
  // Format: "Fri, 01/2" or "Sat, 01/10"
  const match = dateStr.match(/(\d{1,2})\/(\d{1,2})/);
  if (!match) return null;
  
  const month = parseInt(match[1], 10) - 1; // JS months are 0-indexed
  const day = parseInt(match[2], 10);
  
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  
  return new Date(defaultYear, month, day);
}

/**
 * Parse CSV content into rows
 */
function parseCSV(content: string): string[][] {
  const lines = content.split('\n');
  const rows: string[][] = [];
  
  for (const line of lines) {
    if (!line.trim()) continue;
    
    // Simple CSV parsing (handles quoted fields with commas)
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
 * Find the header row and return its index
 */
function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i];
    if (row[0]?.toLowerCase().includes('budget/actual') || 
        (row[0]?.toLowerCase() === 'budget' && row[1]?.toLowerCase() === 'date')) {
      return i;
    }
  }
  return -1;
}

/**
 * Parse a single data row
 */
function parseDataRow(row: string[], rowNumber: number, defaultYear: number): ParsedRow | null {
  const rowType = row[COL.TYPE]?.trim();
  
  // Skip non-data rows
  if (!rowType || (rowType.toLowerCase() !== 'budget' && rowType.toLowerCase() !== 'actual')) {
    return null;
  }
  
  const eventName = row[COL.NAME]?.trim();
  if (!eventName) return null;
  
  const date = parseEventDate(row[COL.DATE], defaultYear);
  
  return {
    rowNumber,
    rowType: rowType.toLowerCase() === 'budget' ? 'Budget' : 'Actual',
    date,
    eventName,
    eventType: row[COL.EVENT_TYPE]?.trim() || 'Bar',
    staff: parseCurrency(row[COL.STAFF]),
    reimbursements: parseCurrency(row[COL.REIMBURSEMENTS]),
    signups: parseInt(row[COL.SIGNUPS]) || 0,
    rewards: parseCurrency(row[COL.REWARDS]),
    base: parseCurrency(row[COL.BASE]),
    bonusKickback: parseCurrency(row[COL.BONUS_KICKBACK]),
    parking: parseCurrency(row[COL.PARKING]),
    setup: parseCurrency(row[COL.SETUP]),
    additional1: parseCurrency(row[COL.ADDITIONAL_1]),
    additional2: parseCurrency(row[COL.ADDITIONAL_2]),
    additional3: parseCurrency(row[COL.ADDITIONAL_3]),
    additional4: parseCurrency(row[COL.ADDITIONAL_4]),
    totalCost: parseCurrency(row[COL.TOTAL_COST]),
    revenue: parseCurrency(row[COL.REVENUE]),
    profit: parseCurrency(row[COL.PROFIT]),
    marginPercent: parsePercent(row[COL.MARGIN]),
    rawData: row
  };
}

/**
 * Find or create an event by title and event_date
 */
async function findOrCreateEvent(
  eventName: string,
  eventDate: Date | null,
  eventType: string
): Promise<{ eventId: string; created: boolean }> {
  // Try to find existing event by title and event_date
  let query = `
    SELECT id FROM events 
    WHERE LOWER(TRIM(title)) = LOWER(TRIM($1))
  `;
  const params: (string | null)[] = [eventName];
  
  if (eventDate) {
    query += ` AND event_date = $2`;
    params.push(eventDate.toISOString().split('T')[0]);
  }
  query += ` LIMIT 1`;
  
  const existing = await pool.query(query, params);
  
  if (existing.rows.length > 0) {
    return { eventId: existing.rows[0].id, created: false };
  }
  
  // Create new event
  const eventId = randomUUID();
  const status = eventDate && eventDate < new Date() ? 'completed' : 'planned';
  
  // Map event type
  let dbEventType = 'activation';
  const typeMap: Record<string, string> = {
    'bar': 'activation',
    'tailgate': 'activation',
    'solo': 'other',
    '': 'activation'
  };
  dbEventType = typeMap[eventType.toLowerCase()] || 'activation';
  
  await pool.query(`
    INSERT INTO events (id, title, event_date, status, event_type, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
  `, [eventId, eventName, eventDate ? eventDate.toISOString().split('T')[0] : null, status, dbEventType]);
  
  return { eventId, created: true };
}

/**
 * Calculate and store performance score for an event
 */
async function calculateAndStorePerformanceScore(
  eventId: string,
  budget: ParsedRow | undefined,
  actual: ParsedRow
): Promise<PerformanceScoreResult | null> {
  try {
    // Prepare financial data for scoring
    const financialData: EventFinancialData = {
      projectedSignups: budget?.signups,
      projectedRevenue: budget?.revenue,
      projectedProfit: budget?.profit,
      projectedMarginPercent: budget?.marginPercent ?? undefined,
      actualSignups: actual.signups,
      actualRevenue: actual.revenue,
      actualProfit: actual.profit,
      actualMarginPercent: actual.marginPercent ?? undefined,
      actualCost: actual.totalCost,
      eventDurationHours: 4, // Default to 4 hours if not available
    };
    
    // Calculate performance score
    const scoreResult = calculateEventPerformanceScore(financialData);
    
    // Store performance score on event_actuals table
    await pool.query(`
      UPDATE event_actuals SET
        performance_score = $2,
        performance_tier = $3,
        performance_breakdown = $4,
        performance_calculated_at = NOW()
      WHERE event_id = $1
    `, [
      eventId,
      scoreResult.performanceScore,
      scoreResult.tier,
      JSON.stringify(scoreResult.breakdown)
    ]);
    
    return scoreResult;
  } catch (err) {
    // Don't fail the import if scoring fails, just log warning
    console.warn(`Failed to calculate performance score for event ${eventId}:`, err);
    return null;
  }
}

/**
 * Import budget/actuals CSV file
 */
export async function importBudgetActuals(
  csvContent: string,
  filename: string,
  options: ImportOptions = {}
): Promise<ImportResult> {
  const importId = randomUUID();
  const defaultYear = options.defaultYear || new Date().getFullYear();
  const errors: Array<{ row: number; message: string }> = [];
  const warnings: Array<{ row: number; message: string }> = [];
  
  let createdEvents = 0;
  let createdBudgets = 0;
  let createdActuals = 0;
  let updatedBudgets = 0;
  let updatedActuals = 0;
  let skippedRows = 0;
  let errorRows = 0;
  let processedRows = 0;
  
  // Calculate file hash for deduplication
  const fileHash = crypto.createHash('sha256').update(csvContent).digest('hex');
  
  // Create import log entry
  await pool.query(`
    INSERT INTO financial_import_logs 
    (id, import_type, filename, file_hash, status, imported_by, started_at)
    VALUES ($1, 'budget_actuals', $2, $3, 'processing', $4, NOW())
  `, [importId, filename, fileHash, options.importedBy || 'system']);
  
  try {
    // Parse CSV
    const rows = parseCSV(csvContent);
    const headerIndex = findHeaderRow(rows);
    
    if (headerIndex === -1) {
      throw new Error('Could not find header row in CSV');
    }
    
    const dataRows = rows.slice(headerIndex + 1);
    const totalRows = dataRows.length;
    
    // Group rows by event (Budget + Actual pairs)
    const eventGroups = new Map<string, { budget?: ParsedRow; actual?: ParsedRow }>();
    
    for (let i = 0; i < dataRows.length; i++) {
      const parsed = parseDataRow(dataRows[i], headerIndex + 2 + i, defaultYear);
      
      if (!parsed) {
        skippedRows++;
        continue;
      }
      
      // Create event key (name + date)
      const dateKey = parsed.date ? parsed.date.toISOString().split('T')[0] : 'NA';
      const eventKey = `${parsed.eventName}|${dateKey}`;
      
      if (!eventGroups.has(eventKey)) {
        eventGroups.set(eventKey, {});
      }
      
      const group = eventGroups.get(eventKey)!;
      if (parsed.rowType === 'Budget') {
        group.budget = parsed;
      } else {
        group.actual = parsed;
      }
    }
    
    // Process each event group
    for (const [eventKey, group] of eventGroups) {
      try {
        const refRow = group.budget || group.actual!;
        
        // Find or create event
        const { eventId, created: eventCreated } = await findOrCreateEvent(
          refRow.eventName,
          refRow.date,
          refRow.eventType
        );
        
        if (eventCreated) {
          createdEvents++;
        }
        
        // Process budget if present
        if (group.budget && !options.dryRun) {
          const b = group.budget;
          
          // Check if budget exists
          const existingBudget = await pool.query(
            'SELECT id FROM event_budgets WHERE event_id = $1',
            [eventId]
          );
          
          if (existingBudget.rows.length > 0) {
            // Update existing
            await pool.query(`
              UPDATE event_budgets SET
                budget_staff = $2,
                budget_reimbursements = $3,
                budget_rewards = $4,
                budget_base = $5,
                budget_bonus_kickback = $6,
                budget_parking = $7,
                budget_setup = $8,
                budget_additional_1 = $9,
                budget_additional_2 = $10,
                budget_additional_3 = $11,
                budget_additional_4 = $12,
                budget_total = $13,
                projected_signups = $14,
                projected_revenue = $15,
                projected_profit = $16,
                projected_margin_percent = $17,
                import_batch_id = $18,
                updated_at = NOW()
              WHERE event_id = $1
            `, [
              eventId,
              b.staff, b.reimbursements, b.rewards, b.base, b.bonusKickback,
              b.parking, b.setup, b.additional1, b.additional2, b.additional3, b.additional4,
              b.totalCost, b.signups, b.revenue, b.profit, b.marginPercent, importId
            ]);
            updatedBudgets++;
          } else {
            // Insert new
            await pool.query(`
              INSERT INTO event_budgets (
                id, event_id, budget_staff, budget_reimbursements, budget_rewards, budget_base,
                budget_bonus_kickback, budget_parking, budget_setup,
                budget_additional_1, budget_additional_2, budget_additional_3, budget_additional_4,
                budget_total, projected_signups, projected_revenue, projected_profit,
                projected_margin_percent, import_batch_id
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
            `, [
              randomUUID(), eventId,
              b.staff, b.reimbursements, b.rewards, b.base, b.bonusKickback,
              b.parking, b.setup, b.additional1, b.additional2, b.additional3, b.additional4,
              b.totalCost, b.signups, b.revenue, b.profit, b.marginPercent, importId
            ]);
            createdBudgets++;
          }
          
          processedRows++;
          
          // Log row detail
          await pool.query(`
            INSERT INTO financial_import_row_details
            (id, import_log_id, row_number, row_type, event_name, event_date, status, action, event_id, raw_data)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          `, [
            randomUUID(), importId, b.rowNumber, 'Budget', b.eventName, b.date,
            'success', existingBudget.rows.length > 0 ? 'updated_budget' : 'created_budget',
            eventId, JSON.stringify(b.rawData)
          ]);
        }
        
        // Process actuals if present
        if (group.actual && !options.dryRun) {
          const a = group.actual;
          
          // Check if actuals exists
          const existingActuals = await pool.query(
            'SELECT id FROM event_actuals WHERE event_id = $1',
            [eventId]
          );
          
          if (existingActuals.rows.length > 0) {
            // Update existing
            await pool.query(`
              UPDATE event_actuals SET
                actual_staff = $2,
                actual_reimbursements = $3,
                actual_rewards = $4,
                actual_base = $5,
                actual_bonus_kickback = $6,
                actual_parking = $7,
                actual_setup = $8,
                actual_additional_1 = $9,
                actual_additional_2 = $10,
                actual_additional_3 = $11,
                actual_additional_4 = $12,
                actual_total = $13,
                actual_signups = $14,
                actual_revenue = $15,
                actual_profit = $16,
                actual_margin_percent = $17,
                import_batch_id = $18,
                updated_at = NOW()
              WHERE event_id = $1
            `, [
              eventId,
              a.staff, a.reimbursements, a.rewards, a.base, a.bonusKickback,
              a.parking, a.setup, a.additional1, a.additional2, a.additional3, a.additional4,
              a.totalCost, a.signups, a.revenue, a.profit, a.marginPercent, importId
            ]);
            updatedActuals++;
          } else {
            // Insert new
            await pool.query(`
              INSERT INTO event_actuals (
                id, event_id, actual_staff, actual_reimbursements, actual_rewards, actual_base,
                actual_bonus_kickback, actual_parking, actual_setup,
                actual_additional_1, actual_additional_2, actual_additional_3, actual_additional_4,
                actual_total, actual_signups, actual_revenue, actual_profit,
                actual_margin_percent, import_batch_id
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
            `, [
              randomUUID(), eventId,
              a.staff, a.reimbursements, a.rewards, a.base, a.bonusKickback,
              a.parking, a.setup, a.additional1, a.additional2, a.additional3, a.additional4,
              a.totalCost, a.signups, a.revenue, a.profit, a.marginPercent, importId
            ]);
            createdActuals++;
          }
          
          processedRows++;
          
          // Log row detail
          await pool.query(`
            INSERT INTO financial_import_row_details
            (id, import_log_id, row_number, row_type, event_name, event_date, status, action, event_id, raw_data)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          `, [
            randomUUID(), importId, a.rowNumber, 'Actual', a.eventName, a.date,
            'success', existingActuals.rows.length > 0 ? 'updated_actuals' : 'created_actuals',
            eventId, JSON.stringify(a.rawData)
          ]);
          
          // Calculate and store performance score for this event
          await calculateAndStorePerformanceScore(eventId, group.budget, a);
        }
        
      } catch (err: any) {
        const rowNum = (group.budget || group.actual)?.rowNumber || 0;
        errors.push({ row: rowNum, message: err.message });
        errorRows++;
        
        // Log error detail
        await pool.query(`
          INSERT INTO financial_import_row_details
          (id, import_log_id, row_number, row_type, event_name, event_date, status, message, raw_data)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
          randomUUID(), importId, rowNum, 
          group.budget ? 'Budget' : 'Actual',
          (group.budget || group.actual)?.eventName,
          (group.budget || group.actual)?.date,
          'error', err.message,
          JSON.stringify((group.budget || group.actual)?.rawData)
        ]);
      }
    }
    
    // Update import log with results
    const finalStatus = errorRows > 0 ? (processedRows > 0 ? 'partial' : 'failed') : 'completed';
    
    await pool.query(`
      UPDATE financial_import_logs SET
        status = $2,
        total_rows = $3,
        processed_rows = $4,
        created_events = $5,
        created_budgets = $6,
        created_actuals = $7,
        updated_budgets = $8,
        updated_actuals = $9,
        skipped_rows = $10,
        error_rows = $11,
        errors = $12,
        warnings = $13,
        completed_at = NOW()
      WHERE id = $1
    `, [
      importId, finalStatus, totalRows, processedRows,
      createdEvents, createdBudgets, createdActuals, updatedBudgets, updatedActuals,
      skippedRows, errorRows,
      JSON.stringify(errors), JSON.stringify(warnings)
    ]);
    
    return {
      importId,
      status: finalStatus as 'completed' | 'failed' | 'partial',
      totalRows,
      processedRows,
      createdEvents,
      createdBudgets,
      createdActuals,
      updatedBudgets,
      updatedActuals,
      skippedRows,
      errorRows,
      errors,
      warnings
    };
    
  } catch (err: any) {
    // Update import log with failure
    await pool.query(`
      UPDATE financial_import_logs SET
        status = 'failed',
        errors = $2,
        completed_at = NOW()
      WHERE id = $1
    `, [importId, JSON.stringify([{ row: 0, message: err.message }])]);
    
    throw err;
  }
}

/**
 * Get import status by ID
 */
export async function getImportStatus(importId: string): Promise<any> {
  
  const result = await pool.query(`
    SELECT * FROM financial_import_logs WHERE id = $1
  `, [importId]);
  
  if (result.rows.length === 0) {
    return null;
  }
  
  return result.rows[0];
}

/**
 * Get import row details
 */
export async function getImportRowDetails(importId: string, options: { status?: string; limit?: number; offset?: number } = {}): Promise<any[]> {
  
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
 * List recent imports
 */
export async function listImports(options: { limit?: number; importType?: string } = {}): Promise<any[]> {
  
  let query = `SELECT * FROM financial_import_logs`;
  const params: any[] = [];
  
  if (options.importType) {
    params.push(options.importType);
    query += ` WHERE import_type = $${params.length}`;
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
 * Recalculate performance scores for all events with actuals data
 */
export async function recalculateAllPerformanceScores(): Promise<{
  processed: number;
  updated: number;
  errors: number;
}> {
  const result = {
    processed: 0,
    updated: 0,
    errors: 0,
  };
  
  // Get all events with actuals
  const eventsResult = await pool.query(`
    SELECT 
      e.id as event_id,
      eb.projected_signups,
      eb.projected_revenue,
      eb.projected_profit,
      eb.projected_margin_percent,
      ea.actual_signups,
      ea.actual_revenue,
      ea.actual_profit,
      ea.actual_margin_percent,
      ea.actual_total as actual_cost
    FROM events e
    JOIN event_actuals ea ON ea.event_id = e.id
    LEFT JOIN event_budgets eb ON eb.event_id = e.id
  `);
  
  for (const row of eventsResult.rows) {
    result.processed++;
    
    try {
      const financialData: EventFinancialData = {
        projectedSignups: row.projected_signups ? parseInt(row.projected_signups) : undefined,
        projectedRevenue: row.projected_revenue ? parseFloat(row.projected_revenue) : undefined,
        projectedProfit: row.projected_profit ? parseFloat(row.projected_profit) : undefined,
        projectedMarginPercent: row.projected_margin_percent ? parseFloat(row.projected_margin_percent) : undefined,
        actualSignups: row.actual_signups ? parseInt(row.actual_signups) : undefined,
        actualRevenue: row.actual_revenue ? parseFloat(row.actual_revenue) : undefined,
        actualProfit: row.actual_profit ? parseFloat(row.actual_profit) : undefined,
        actualMarginPercent: row.actual_margin_percent ? parseFloat(row.actual_margin_percent) : undefined,
        actualCost: row.actual_cost ? parseFloat(row.actual_cost) : undefined,
        eventDurationHours: 4, // Default
      };
      
      const scoreResult = calculateEventPerformanceScore(financialData);
      
      await pool.query(`
        UPDATE event_actuals SET
          performance_score = $2,
          performance_tier = $3,
          performance_breakdown = $4,
          performance_calculated_at = NOW()
        WHERE event_id = $1
      `, [
        row.event_id,
        scoreResult.performanceScore,
        scoreResult.tier,
        JSON.stringify(scoreResult.breakdown)
      ]);
      
      result.updated++;
    } catch (err) {
      console.error(`Failed to recalculate score for event ${row.event_id}:`, err);
      result.errors++;
    }
  }
  
  return result;
}

/**
 * Get performance score for a specific event
 */
export async function getEventPerformanceScore(eventId: string): Promise<PerformanceScoreResult | null> {
  const result = await pool.query(`
    SELECT 
      ea.performance_score,
      ea.performance_tier,
      ea.performance_breakdown,
      ea.performance_calculated_at,
      ea.actual_signups,
      ea.actual_revenue,
      ea.actual_profit,
      ea.actual_margin_percent,
      eb.projected_signups
    FROM event_actuals ea
    LEFT JOIN event_budgets eb ON eb.event_id = ea.event_id
    WHERE ea.event_id = $1
  `, [eventId]);
  
  if (result.rows.length === 0) {
    return null;
  }
  
  const row = result.rows[0];
  
  // If no score calculated yet, calculate it now
  if (row.performance_score === null) {
    const financialData: EventFinancialData = {
      projectedSignups: row.projected_signups ? parseInt(row.projected_signups) : undefined,
      actualSignups: row.actual_signups ? parseInt(row.actual_signups) : undefined,
      actualRevenue: row.actual_revenue ? parseFloat(row.actual_revenue) : undefined,
      actualProfit: row.actual_profit ? parseFloat(row.actual_profit) : undefined,
      actualMarginPercent: row.actual_margin_percent ? parseFloat(row.actual_margin_percent) : undefined,
      eventDurationHours: 4,
    };
    
    return calculateEventPerformanceScore(financialData);
  }
  
  return {
    performanceScore: row.performance_score,
    tier: row.performance_tier,
    breakdown: row.performance_breakdown,
    metrics: {
      actualMarginPercent: row.actual_margin_percent ? parseFloat(row.actual_margin_percent) : null,
      signupsPerHour: row.actual_signups ? row.actual_signups / 4 : null, // Assuming 4hr events
      goalAchievementPercent: row.projected_signups && row.actual_signups 
        ? (row.actual_signups / row.projected_signups) * 100 
        : null,
    },
  };
}
