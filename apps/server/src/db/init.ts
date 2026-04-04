import { getDb, getPool } from './index.js';
import * as schema from './schema.js';

/**
 * Initialize database connection and verify tables exist.
 * 
 * Tables are managed by drizzle-kit, not by this function.
 * Run `pnpm db:push` to create/update tables.
 */
async function initializeDatabase(): Promise<void> {
  console.log('[DB] Checking database connection...');
  
  const db = getDb();
  
  // Verify connection by querying a table
  try {
    await db.select({ id: schema.users.id }).from(schema.users).limit(1);
    console.log('[DB] Database connection successful');
  } catch (error) {
    console.error('[DB] Database initialization failed');
    console.error('[DB] Run: pnpm db:push to create tables');
    throw error;
  }
}

/**
 * Enable pgvector extension for vector embeddings.
 * This is called separately after drizzle-kit push since
 * drizzle doesn't natively support vector columns yet.
 */
async function enablePgVector(): Promise<void> {
  const pool = getPool();
  
  try {
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
    console.log('[DB] pgvector extension enabled');
  } catch (error) {
    console.warn('[DB] Could not enable pgvector extension:', error);
    // Don't throw - this is not critical for all use cases
  }
}

/**
 * Add vector column to memories table if it doesn't exist.
 * This is needed because drizzle-orm doesn't support vector type natively.
 */
async function ensureVectorColumn(): Promise<void> {
  const pool = getPool();
  
  try {
    // Check if column exists
    const result = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'memories' AND column_name = 'embedding'
    `);
    
    if (result.rows.length === 0) {
      await pool.query('ALTER TABLE memories ADD COLUMN embedding vector(1536)');
      console.log('[DB] Added embedding column to memories table');
      
      // Create vector similarity index
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_memories_embedding ON memories 
        USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
      `);
      console.log('[DB] Created vector similarity index');
    }
  } catch (error) {
    console.warn('[DB] Could not ensure vector column:', error);
  }
}

/**
 * Full database setup for development.
 * Runs after drizzle-kit push to add vector support.
 */
async function setupVectorSupport(): Promise<void> {
  await enablePgVector();
  await ensureVectorColumn();
}

export { initializeDatabase, setupVectorSupport };
