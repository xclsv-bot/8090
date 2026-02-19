/**
 * Budgets & Actuals Import Service
 * Actually inserts/updates events with budget and actual data
 */

import { db } from '../../../../services/database.js';
import { logger } from '../../../../utils/logger.js';
import { randomUUID } from 'crypto';

interface BudgetRow {
  'Budget/Actual'?: string;
  Date?: string;
  'Event name'?: string;
  'Event type'?: string;
  Staff?: string;
  Reimbursments?: string;
  'Sign up'?: string;
  Rewards?: string;
  Base?: string;
  'Bonus/ kickback'?: string;
  Parking?: string;
  Setup?: string;
  'Additional Expense'?: string;
  'Additional Expense 2'?: string;
  'Additional Expense 3'?: string;
  'Additional Expense 4'?: string;
  'Total Cost'?: string;
  Revenue?: string;
  Profitability?: string;
  '%'?: string;
  // Allow any other fields
  [key: string]: string | undefined;
}

interface ParsedEvent {
  date: string | null;
  name: string;
  type: string;
  budgetCost: number;
  actualCost: number;
  budgetSignups: number;
  actualSignups: number;
  budgetRevenue: number;
  actualRevenue: number;
}

function parseAmount(value: string | undefined): number {
  if (!value || value === '' || value === '#DIV/0!') return 0;
  // Remove $, commas, and handle negative with parentheses or minus
  const cleaned = value.replace(/[$,]/g, '').replace(/[()]/g, '').trim();
  const num = parseFloat(cleaned);
  if (value.includes('(') || value.startsWith('-')) {
    return isNaN(num) ? 0 : -Math.abs(num);
  }
  return isNaN(num) ? 0 : num;
}

function parseDate(dateStr: string | undefined, year: number = 2026): string | null {
  if (!dateStr || dateStr === 'NA' || dateStr === '') return null;
  
  // Format: "Fri, 01/2" or "Sat, 01/3" or "01/02/2026" etc.
  // Try MM/DD format first (with optional day name)
  const match = dateStr.match(/(\d{1,2})\/(\d{1,2})/);
  if (match) {
    const month = parseInt(match[1]);
    const day = parseInt(match[2]);
    
    // If the match has a 4-digit year after it, use that
    const yearMatch = dateStr.match(/\/(\d{4})/);
    const actualYear = yearMatch ? parseInt(yearMatch[1]) : year;
    
    return `${actualYear}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
  }
  
  return null;
}

// Map CSV event types to database enum values
function mapEventType(csvType: string | undefined): string {
  const type = (csvType || '').toLowerCase().trim();
  const mapping: Record<string, string> = {
    'bar': 'activation',
    'tailgate': 'watch_party',
    'solo': 'promotion',
    '': 'other',
  };
  return mapping[type] || 'other';
}

export async function importBudgetsActuals(
  rows: BudgetRow[],
  importId: string,
  userId: string
): Promise<{ inserted: number; updated: number; skipped: number; errors: string[] }> {
  const errors: string[] = [];
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  // Group rows by event (date + name) and type (Budget/Actual)
  const eventMap = new Map<string, ParsedEvent>();

  for (const row of rows) {
    const rowType = row['Budget/Actual']?.trim();
    
    // Skip non-data rows
    if (rowType !== 'Budget' && rowType !== 'Actual') {
      continue;
    }

    const eventName = row['Event name']?.trim();
    if (!eventName) {
      skipped++;
      continue;
    }

    const dateStr = row.Date?.trim();
    const parsedDate = parseDate(dateStr);
    
    // Skip items without dates (like "Solo program", "Bonuses")
    if (!parsedDate) {
      skipped++;
      continue;
    }

    const eventKey = `${parsedDate}_${eventName}`;
    
    if (!eventMap.has(eventKey)) {
      eventMap.set(eventKey, {
        date: parsedDate,
        name: eventName,
        type: row['Event type']?.trim() || 'Bar',
        budgetCost: 0,
        actualCost: 0,
        budgetSignups: 0,
        actualSignups: 0,
        budgetRevenue: 0,
        actualRevenue: 0,
      });
    }

    const event = eventMap.get(eventKey)!;
    const totalCost = parseAmount(row['Total Cost']);
    const signups = parseAmount(row['Sign up']);
    const revenue = parseAmount(row.Revenue);

    if (rowType === 'Budget') {
      event.budgetCost = totalCost;
      event.budgetSignups = signups;
      event.budgetRevenue = revenue;
      event.type = row['Event type']?.trim() || event.type;
    } else {
      event.actualCost = totalCost;
      event.actualSignups = signups;
      event.actualRevenue = revenue;
    }
  }

  logger.info({ eventCount: eventMap.size, importId }, 'Parsed events from CSV');

  // Insert or update each event
  for (const [key, event] of eventMap) {
    try {
      // Check if event already exists
      const existing = await db.queryOne<{ id: string }>(
        'SELECT id FROM events WHERE title = $1 AND event_date = $2',
        [event.name, event.date]
      );

      if (existing) {
        // Update existing event
        await db.query(`
          UPDATE events SET 
            budget = $1,
            actual_cost = $2,
            signup_goal = $3,
            actual_attendance = $4,
            event_type = $5,
            updated_at = NOW()
          WHERE id = $6
        `, [
          event.budgetCost || null,
          event.actualCost || null,
          event.budgetSignups || null,
          event.actualSignups || null,
          mapEventType(event.type),
          existing.id,
        ]);

        updated++;
        logger.debug({ eventName: event.name, eventDate: event.date }, 'Updated event');
      } else {
        // Create new event
        const id = randomUUID();
        await db.query(`
          INSERT INTO events (
            id, title, event_date, event_type, status,
            budget, actual_cost, signup_goal, actual_attendance,
            created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        `, [
          id,
          event.name,
          event.date,
          mapEventType(event.type),
          event.actualCost > 0 ? 'completed' : 'planned',
          event.budgetCost || null,
          event.actualCost || null,
          event.budgetSignups || null,
          event.actualSignups || null,
        ]);

        inserted++;
        logger.debug({ eventName: event.name, eventDate: event.date }, 'Created event');
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      errors.push(`Failed to import ${event.name} (${event.date}): ${error}`);
      logger.error({ event, error }, 'Failed to import event');
    }
  }

  logger.info({ inserted, updated, skipped, errors: errors.length, importId }, 'Budgets/actuals import complete');
  return { inserted, updated, skipped, errors };
}
