/**
 * Create system_api_keys table
 * 
 * Run: node scripts/create-system-api-keys.js
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { Client } = pg;

async function main() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  await client.connect();

  console.log('Creating system_api_keys table...');

  await client.query(`
    CREATE TABLE IF NOT EXISTS system_api_keys (
      provider VARCHAR(50) PRIMARY KEY,
      key_encrypted TEXT NOT NULL,
      key_preview VARCHAR(20),
      base_url TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
    );
  `);

  console.log('✓ system_api_keys table created');

  await client.end();
}

main().catch(console.error);