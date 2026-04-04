import pg from 'pg';
const { Pool } = pg;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env first
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function migrate() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('[MIGRATE] Connecting to database...');
    
    // Check if tables exist
    const { rows: existingTables } = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    `);
    
    if (existingTables.length === 0) {
      console.log('[MIGRATE] No existing tables, creating schema...');
      
      // Read and execute schema file
      const schemaPath = path.join(__dirname, 'db', 'schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf8');
      await pool.query(schema);
      
      console.log('[MIGRATE] Schema created successfully!');
    } else {
      console.log('[MIGRATE] Tables already exist, checking for updates...');
    }
    
    // Ensure pgvector extension is enabled
    await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
    console.log('[MIGRATE] pgvector extension ready');
    
    // Add embedding column to memories if not exists
    const { rows: columns } = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'memories' 
      AND column_name = 'embedding'
    `);
    
    if (columns.length === 0) {
      console.log('[MIGRATE] Adding embedding column to memories...');
      await pool.query('ALTER TABLE memories ADD COLUMN embedding vector(1536)');
      console.log('[MIGRATE] Embedding column added');
    }
    
    // Create vector index if not exists
    try {
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_memories_embedding 
        ON memories USING ivfflat (embedding vector_cosine_ops) 
        WITH (lists = 100)
      `);
      console.log('[MIGRATE] Vector index ready');
    } catch (err) {
      if (!err.message.includes('already exists')) {
        console.warn('[MIGRATE] Could not create vector index:', err.message);
      }
    }
    
    // List tables
    const { rows } = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    console.log('[MIGRATE] Tables:', rows.map(r => r.table_name).join(', '));
    
  } catch (error) {
    console.error('[MIGRATE] Error:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

migrate().catch(console.error);