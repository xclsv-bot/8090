import { readFileSync } from 'fs';
import { Pool } from 'pg';
import { dirname, join } from 'path';
import { cwd } from 'process';

const __dirname = join(cwd(), 'src', 'db');

const DATABASE_URL =
  'postgresql://neondb_owner:npg_XwRHzDI6h4WU@ep-twilight-thunder-aidv5htg-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require';

// Order matters - base schema first, then extensions
const SCHEMA_ORDER = [
  'schema.sql',
  'operator_schema.sql',
  'cpa_schema.sql',
  'ambassador_schema.sql',
  'event_management_schema.sql',
  'signup_schema.sql',
  'signup_management_schema.sql',
  'availability_schema.sql',
  'event_chat_schema.sql',
  'event_logs.sql',
  'financial_schema.sql',
  'budget_actuals_schema.sql',
  'payroll_schema.sql',
  'integrations_schema.sql',
  'analytics_schema.sql',
  'leaderboard_schema.sql',
  'alerting_schema.sql',
  'support_hub_schema.sql',
  'support_hub_realtime_schema.sql',
] as const;

const WO133_MIGRATIONS = [
  '001_update_event_table.sql',
  '002_create_event_assignment_table.sql',
  '003_update_ambassador_table.sql',
  '004_update_signup_table.sql',
  '005_create_payroll_tables.sql',
  '006_create_availability_tables.sql',
] as const;

export type MigrationDirection = 'up' | 'down';

export function parseMigrationSections(sql: string): { up: string; down: string } {
  const normalized = sql.replace(/\r\n/g, '\n');
  const upMarker = /^\s*--\s*UP\s*$/im;
  const downMarker = /^\s*--\s*DOWN\s*$/im;

  const upMatch = upMarker.exec(normalized);
  const downMatch = downMarker.exec(normalized);

  if (!downMatch) {
    return { up: normalized.trim(), down: '' };
  }

  const upStart = upMatch ? upMatch.index + upMatch[0].length : 0;
  const up = normalized.slice(upStart, downMatch.index).trim();
  const down = normalized.slice(downMatch.index + downMatch[0].length).trim();

  return { up, down };
}

async function runSql(pool: Pool, label: string, sql: string): Promise<void> {
  if (!sql.trim()) {
    console.log(`   ⏭️  ${label} (empty)`);
    return;
  }

  await pool.query('BEGIN');
  try {
    await pool.query(sql);
    await pool.query('COMMIT');
    console.log(`   ✅ ${label}`);
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  }
}

export async function migrate(direction: MigrationDirection = 'up'): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    console.log(`🔄 Running migrations (${direction.toUpperCase()})...\n`);

    if (direction === 'up') {
      for (const schemaFile of SCHEMA_ORDER) {
        const schemaPath = join(__dirname, schemaFile);
        const schema = readFileSync(schemaPath, 'utf-8');
        console.log(`📄 Running base schema: ${schemaFile}`);
        try {
          await runSql(pool, schemaFile, schema);
        } catch (error: any) {
          console.log(`   ⚠️  ${error.message?.split('\n')[0] || 'Error'}`);
        }
      }

      console.log('\n📦 Running WO-133 migrations...');
      for (const migrationFile of WO133_MIGRATIONS) {
        const migrationPath = join(__dirname, 'migrations', migrationFile);
        const migration = readFileSync(migrationPath, 'utf-8');
        const { up } = parseMigrationSections(migration);

        console.log(`📄 ${migrationFile}`);
        await runSql(pool, `${migrationFile} [UP]`, up);
      }
    } else {
      console.log('↩️  Rolling back WO-133 migrations...');

      for (const migrationFile of [...WO133_MIGRATIONS].reverse()) {
        const migrationPath = join(__dirname, 'migrations', migrationFile);
        const migration = readFileSync(migrationPath, 'utf-8');
        const { down } = parseMigrationSections(migration);

        console.log(`📄 ${migrationFile}`);
        if (!down.trim()) {
          console.log('   ⏭️  No DOWN section, skipping');
          continue;
        }

        await runSql(pool, `${migrationFile} [DOWN]`, down);
      }
    }

    console.log('\n✅ Migration run complete!\n');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

const args = new Set(process.argv.slice(2));
const direction: MigrationDirection =
  args.has('--rollback') || args.has('--down') ? 'down' : 'up';

if ((process.argv[1] || '').includes('migrate-all')) {
  migrate(direction);
}
