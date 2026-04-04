import 'dotenv/config';
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function createSessionsTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id VARCHAR(64) PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_agent TEXT,
        ip_address VARCHAR(45),
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('Sessions table created successfully');
    
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)`);
    console.log('Indexes created');
    
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
    process.exit(1);
  }
}

createSessionsTable();