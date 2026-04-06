import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from './schema.js';

let db: NodePgDatabase<typeof schema> | null = null;
let pool: Pool | null = null;

function getPoolConfig() {
  if (!process.env.DATABASE_URL) {
    throw new Error('[DB] DATABASE_URL is not set. Check your .env file.');
  }
  return {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    // Connection pool settings untuk Neon
    max: 10,                          // Max connections (Neon free tier: ~20)
    min: 1,                           // Keep at least 1 connection warm
    idleTimeoutMillis: 30000,         // Close idle after 30s (Neon can drop idle)
    connectionTimeoutMillis: 10000,   // Connection timeout 10s
    // Handle Neon cold start
    keepAliveInitialDelayMillis: 10000, // Keep-alive ping
  };
}

export function getDb(): NodePgDatabase<typeof schema> {
  if (!db) {
    const poolConfig = getPoolConfig();
    pool = new Pool(poolConfig);
    
    // Log connection errors untuk debugging
    pool.on('error', (err) => {
      console.error('[DB] Unexpected connection error:', err.message);
    });
    
    db = drizzle(pool, { schema });
  }
  return db;
}

export function getPool(): Pool {
  if (!pool) {
    const poolConfig = getPoolConfig();
    pool = new Pool(poolConfig);
    pool.on('error', (err) => {
      console.error('[DB] Unexpected connection error:', err.message);
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
