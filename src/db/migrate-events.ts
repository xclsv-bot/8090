import { readFileSync } from 'fs';
import { Pool } from 'pg';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATABASE_URL = 'postgresql://neondb_owner:npg_XwRHzDI6h4WU@ep-twilight-thunder-aidv5htg-pooler.c-4.us-east-1.aws.neon.tech/neondb?sslmode=require';

async function migrate() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  
  try {
    console.log('🔄 Creating event_logs table...');
    
    const schemaPath = join(__dirname, 'event_logs.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    
    await pool.query(schema);
    
    console.log('✅ event_logs table created!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate();
