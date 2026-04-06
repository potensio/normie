/**
 * Script to truncate all tables without dropping the schema.
 * Respects foreign key constraints by truncating in correct order.
 * 
 * Usage: npx tsx scripts/truncate-db.ts
 */

import 'dotenv/config';
import { getDb, closeDb } from '../apps/server/src/db/index.js';
import { sql } from 'drizzle-orm';

async function truncateAllTables() {
  console.log('🗑️  Starting database truncation...\n');

  const db = getDb();

  try {
    // Truncate all tables in correct order (child tables first, then parents)
    // CASCADE will automatically handle foreign key constraints
    const tables = [
      'messages',
      'chats',
      'memories',
      'daily_notes',
      'workspace_integrations',
      'workspace_invites',
      'workspace_files',
      'workspace_members',
      'user_api_keys',
      'user_preferences',
      'refresh_tokens',
      'sessions',
      'workspaces',
      'users',
    ];

    // Use CASCADE to handle foreign key constraints
    // RESTART IDENTITY resets auto-increment sequences
    await db.execute(sql`TRUNCATE TABLE ${sql.raw(tables.join(', '))} RESTART IDENTITY CASCADE;`);

    console.log('✅ All tables truncated successfully!');
    console.log('\nTables cleared:');
    tables.forEach(t => console.log(`  - ${t}`));
    
  } catch (error) {
    console.error('❌ Error truncating tables:', error);
    await closeDb();
    process.exit(1);
  }

  await closeDb();
  process.exit(0);
}

truncateAllTables();