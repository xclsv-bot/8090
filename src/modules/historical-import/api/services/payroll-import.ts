/**
 * Payroll Import Service
 * Actually inserts payroll entries into the database
 */

import { db } from '../../../../services/database.js';
import { logger } from '../../../../utils/logger.js';

interface PayrollRow {
  Names?: string;
  'Event Name'?: string;
  Date?: string;
  'Scheduled hours'?: string;
  Hours?: string;
  Solos?: string;
  Bonus?: string;
  Reimbursements?: string;
  Other?: string;
  Total?: string;
  Status?: string;
  'Pay Date'?: string;
  Notes?: string;
}

function parseAmount(value: string | undefined): number {
  if (!value) return 0;
  // Remove $ and commas, handle empty strings
  const cleaned = value.replace(/[$,]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseDate(value: string | undefined): string | null {
  if (!value) return null;
  try {
    // Handle M/D/YYYY format
    const parts = value.split('/');
    if (parts.length === 3) {
      const month = parts[0].padStart(2, '0');
      const day = parts[1].padStart(2, '0');
      const year = parts[2];
      return `${year}-${month}-${day}`;
    }
    return null;
  } catch {
    return null;
  }
}

export async function importPayrollEntries(
  rows: PayrollRow[],
  importId: string,
  userId: string
): Promise<{ inserted: number; skipped: number; errors: string[] }> {
  const errors: string[] = [];
  let inserted = 0;
  let skipped = 0;

  for (const row of rows) {
    // Skip empty rows
    if (!row.Names || !row.Total || row.Names.trim() === '') {
      skipped++;
      continue;
    }

    const total = parseAmount(row.Total);
    if (total === 0 && !row['Event Name']) {
      skipped++;
      continue;
    }

    const workDate = parseDate(row.Date);
    if (!workDate) {
      errors.push(`Invalid date for ${row.Names}: ${row.Date}`);
      skipped++;
      continue;
    }

    try {
      await db.query(
        `INSERT INTO payroll_entries (
          ambassador_name,
          event_name,
          work_date,
          scheduled_hours,
          hours_worked,
          solos,
          bonus,
          reimbursements,
          other,
          total,
          status,
          pay_date,
          notes,
          source,
          import_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          row.Names?.trim(),
          row['Event Name']?.trim() || null,
          workDate,
          parseAmount(row['Scheduled hours']) || null,
          parseAmount(row.Hours) || null,
          parseInt(row.Solos || '0') || 0,
          parseAmount(row.Bonus),
          parseAmount(row.Reimbursements),
          parseAmount(row.Other),
          total,
          row.Status?.toLowerCase() === 'paid' ? 'paid' : 'pending',
          parseDate(row['Pay Date']),
          row.Notes?.trim() || null,
          'import',
          importId,
        ]
      );
      inserted++;
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      errors.push(`Failed to insert ${row.Names}: ${error}`);
      logger.error({ row, error }, 'Failed to insert payroll entry');
    }
  }

  logger.info({ inserted, skipped, errors: errors.length, importId }, 'Payroll import complete');
  return { inserted, skipped, errors };
}
