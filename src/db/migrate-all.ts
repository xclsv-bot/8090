import { readFileSync, readdirSync } from 'fs';
import { Pool } from 'pg';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATABASE_URL = 'postgresql://neondb_owner:npg_XwRHzDI6h4WU@ep-twilight-thunder-aidv5htg-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require';

// Order matters - base schema first, then extensions
const SCHEMA_ORDER = [
  'schema.sql',           // Base tables (events, ambassadors, signups, etc.)
  'operator_schema.sql',  // Operators
  'cpa_schema.sql',       // CPA rates
  'ambassador_schema.sql', // Ambassador extensions
  'event_management_schema.sql', // Event management
  'signup_schema.sql',    // Signup extensions
  'availability_schema.sql', // Availability & scheduling
  'event_chat_schema.sql', // Chat system
  'event_logs.sql',       // Event logs
  'financial_schema.sql', // Financial management
  'payroll_schema.sql',   // Payroll
  'integrations_schema.sql', // Integrations
];

async function migrate() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  
  try {
    console.log('🔄 Running all migrations...\n');
    
    for (const schemaFile of SCHEMA_ORDER) {
      const schemaPath = join(__dirname, schemaFile);
      try {
        const schema = readFileSync(schemaPath, 'utf-8');
        console.log(`📄 Running ${schemaFile}...`);
        await pool.query(schema);
        console.log(`   ✅ Success`);
      } catch (error: any) {
        console.log(`   ⚠️  ${error.message?.split('\n')[0] || 'Error'}`);
        // Continue on error - some might be "already exists"
      }
    }
    
    console.log('\n✅ All migrations complete!\n');
    
    // Verify tables
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    console.log(`📋 ${result.rows.length} tables in database:`);
    result.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
