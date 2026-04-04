// Temporary script to push schema to database
// Run: npx tsx push-schema.ts

import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '..', '..', '.env') });
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './src/db/schema.js';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const db = drizzle(pool, { schema });

async function pushSchema() {
  try {
    console.log('Creating sessions table...');
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id VARCHAR(64) PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_agent TEXT,
        ip_address VARCHAR(45),
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
      )
    `);
    
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)`);
    
    console.log('✅ Sessions table created');
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
    process.exit(1);
  }
}

pushSchema();