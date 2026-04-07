import pg from 'pg';
const { Pool } = pg;
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env first - check multiple locations
const envPaths = [
  path.join(__dirname, '..', '..', '..', '.env'),  // monorepo root
  path.join(__dirname, '..', '.env'),  // server package
];

for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    console.log('[MIGRATE] Loading env from:', envPath);
    dotenv.config({ path: envPath });
    break;
  }
}

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
    } catch (err: unknown) {
      if (!(err as Error).message.includes('already exists')) {
        console.warn('[MIGRATE] Could not create vector index:', (err as Error).message);
      }
    }
    
    // Check and create message_attachments table
    const { rows: attachmentTableExists } = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_name = 'message_attachments'
    `);
    
    if (attachmentTableExists.length === 0) {
      console.log('[MIGRATE] Creating message_attachments table...');
      await pool.query(`
        CREATE TABLE message_attachments (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
          filename VARCHAR(255) NOT NULL,
          original_name VARCHAR(255) NOT NULL,
          mime_type VARCHAR(100) NOT NULL,
          size INTEGER NOT NULL,
          storage_path TEXT NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
      await pool.query(`
        CREATE INDEX idx_message_attachments_message ON message_attachments(message_id)
      `);
      console.log('[MIGRATE] message_attachments table created');
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
    
  } catch (error: unknown) {
    console.error('[MIGRATE] Error:', (error as Error).message);
    throw error;
  } finally {
    await pool.end();
  }
}

migrate().catch(console.error);