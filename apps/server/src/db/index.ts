import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from './schema.js';

let db: NodePgDatabase<typeof schema> | null = null;
let pool: Pool | null = null;

export function getDb(): NodePgDatabase<typeof schema> {
  if (!db) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    db = drizzle(pool, { schema });
  }
  return db;
}

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
  }
  return pool;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    db = null;
  }
}

export { schema };

// Export types for use in other modules
export type DbClient = NodePgDatabase<typeof schema>;
