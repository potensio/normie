/**
 * Migration runner for adding skills tables
 * 
 * Usage: npx tsx apps/server/migrations/run-skills-migration.ts
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    console.log('Running skills migration...');
    
    const sql = fs.readFileSync(
      path.join(__dirname, 'add_skills_tables.sql'),
      'utf-8'
    );

    await pool.query(sql);
    
    console.log('✓ Skills tables created successfully');
  } catch (error) {
    console.error('✗ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();