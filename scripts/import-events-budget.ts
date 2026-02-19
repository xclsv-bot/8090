/**
 * Import Events Budget & Actuals from CSV
 * 
 * Parses the January 2026 Sign Up Tracker CSV and:
 * 1. Creates events in the events table
 * 2. Sets budget and actual_cost fields
 * 3. Links signup goals and actual attendance
 */

import { Client } from 'pg';
import * as fs from 'fs';
import { parse } from 'csv-parse/sync';
import { v4 as uuidv4 } from 'uuid';

const DATABASE_URL = process.env.DATABASE_URL || 
  'postgresql://neondb_owner:npg_XwRHzDI6h4WU@ep-twilight-thunder-aidv5htg-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require';

interface EventRow {
  type: 'Budget' | 'Actual';
  date: string;
  eventName: string;
  eventType: string;
  staff: number;
  reimbursements: number;
  signups: number;
  rewards: number;
  base: number;
  bonus: number;
  parking: number;
  setup: number;
  additionalExpenses: number[];
  totalCost: number;
  revenue: number;
  profitability: number;
  profitMargin: number;
}

interface EventData {
  date: string;
  name: string;
  type: string;
  budget?: EventRow;
  actual?: EventRow;
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

// Map CSV event types to database enum values
function mapEventType(csvType: string): string {
  const type = csvType.toLowerCase().trim();
  const mapping: Record<string, string> = {
    'bar': 'activation',
    'tailgate': 'watch_party',
    'solo': 'promotion',
    '': 'other',
  };
  return mapping[type] || 'other';
}

function parseDate(dateStr: string, year: number = 2026): string | null {
  if (!dateStr || dateStr === 'NA' || dateStr === '') return null;
  
  // Format: "Fri, 01/2" or "Sat, 01/3" etc.
  const match = dateStr.match(/(\d{1,2})\/(\d{1,2})/);
  if (!match) return null;
  
  const month = parseInt(match[1]);
  const day = parseInt(match[2]);
  
  // Return YYYY-MM-DD format
  return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

function parseCSV(filePath: string): EventData[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const records = parse(content, { relax_column_count: true });
  
  const events: Map<string, EventData> = new Map();
  
  // Find the header row (starts with "Budget/Actual")
  let dataStartIndex = 0;
  for (let i = 0; i < records.length; i++) {
    if (records[i][0] === 'Budget/Actual') {
      dataStartIndex = i + 1;
      break;
    }
  }
  
  console.log(`Found data starting at row ${dataStartIndex + 1}`);
  
  // Parse data rows
  for (let i = dataStartIndex; i < records.length; i++) {
    const row = records[i];
    const rowType = row[0]?.trim();
    
    if (rowType !== 'Budget' && rowType !== 'Actual') continue;
    
    const dateStr = row[1]?.trim() || '';
    const eventName = row[2]?.trim() || '';
    const eventType = row[3]?.trim() || 'Bar';
    
    if (!eventName) continue;
    
    const parsedDate = parseDate(dateStr);
    const eventKey = `${parsedDate || 'NA'}_${eventName}`;
    
    const eventRow: EventRow = {
      type: rowType as 'Budget' | 'Actual',
      date: dateStr,
      eventName,
      eventType,
      staff: parseAmount(row[4]),
      reimbursements: parseAmount(row[5]),
      signups: parseAmount(row[6]),
      rewards: parseAmount(row[7]),
      base: parseAmount(row[8]),
      bonus: parseAmount(row[9]),
      parking: parseAmount(row[10]),
      setup: parseAmount(row[11]),
      additionalExpenses: [
        parseAmount(row[12]),
        parseAmount(row[13]),
        parseAmount(row[14]),
        parseAmount(row[15]),
      ],
      totalCost: parseAmount(row[16]),
      revenue: parseAmount(row[17]),
      profitability: parseAmount(row[18]),
      profitMargin: parseAmount(row[19]?.replace('%', '')) / 100,
    };
    
    if (!events.has(eventKey)) {
      events.set(eventKey, {
        date: parsedDate || '',
        name: eventName,
        type: eventType,
      });
    }
    
    const event = events.get(eventKey)!;
    if (rowType === 'Budget') {
      event.budget = eventRow;
    } else {
      event.actual = eventRow;
    }
  }
  
  return Array.from(events.values());
}

async function importEvents(events: EventData[]) {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  
  console.log(`\nImporting ${events.length} events...`);
  
  let created = 0;
  let updated = 0;
  let skipped = 0;
  
  for (const event of events) {
    try {
      // Skip events without dates (like "Solo program", "Bonuses", etc.)
      if (!event.date) {
        console.log(`  Skipping ${event.name} (no date)`);
        skipped++;
        continue;
      }
      
      // Check if event already exists (by title + date)
      const existing = await client.query(
        'SELECT id FROM events WHERE title = $1 AND event_date = $2',
        [event.name, event.date]
      );
      
      const budget = event.budget?.totalCost || 0;
      const actualCost = event.actual?.totalCost || 0;
      const signupGoal = event.budget?.signups || 0;
      const actualAttendance = event.actual?.signups || 0;
      
      if (existing.rows.length > 0) {
        // Update existing event
        await client.query(`
          UPDATE events SET 
            budget = $1,
            actual_cost = $2,
            signup_goal = $3,
            actual_attendance = $4,
            event_type = $5,
            updated_at = NOW()
          WHERE id = $6
        `, [budget, actualCost, signupGoal, actualAttendance, mapEventType(event.type), existing.rows[0].id]);
        
        console.log(`  Updated: ${event.name} (${event.date})`);
        updated++;
      } else {
        // Create new event
        const id = uuidv4();
        await client.query(`
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
          actualCost > 0 ? 'completed' : 'planned',
          budget,
          actualCost,
          signupGoal,
          actualAttendance,
        ]);
        
        console.log(`  Created: ${event.name} (${event.date})`);
        created++;
      }
    } catch (err: any) {
      console.error(`  Error with ${event.name}: ${err.message}`);
    }
  }
  
  await client.end();
  
  console.log(`\n=== Import Complete ===`);
  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  
  return { created, updated, skipped };
}

async function main() {
  const csvPath = process.argv[2] || '/Users/arya/.clawdbot/media/inbound/a62182ac-56c8-4c4f-9708-a7849947044e.csv';
  
  console.log('=== Events Budget & Actuals Import ===');
  console.log(`Reading: ${csvPath}\n`);
  
  const events = parseCSV(csvPath);
  console.log(`Parsed ${events.length} unique events`);
  
  // Show sample
  console.log('\nSample events:');
  events.slice(0, 3).forEach(e => {
    console.log(`  ${e.name} (${e.date}) - Budget: $${e.budget?.totalCost || 0}, Actual: $${e.actual?.totalCost || 0}`);
  });
  
  await importEvents(events);
}

main().catch(console.error);
