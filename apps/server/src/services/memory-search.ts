import { getPool } from '../db/index.js';
import { generateEmbedding } from './embeddings.js';
import type { Pool } from 'pg';

/**
 * Options for memory search
 */
export interface SearchOptions {
  limit?: number;
  threshold?: number;
  types?: string[] | null;
}

/**
 * Search result for memories
 */
export interface MemorySearchResult {
  id: string;
  workspaceId: string;
  content: string;
  memoryType: string;
  sourceChatId: string | null;
  importance: number;
  createdAt: Date;
  similarity: number | null;
}

/**
 * Options for storing a memory
 */
export interface StoreMemoryOptions {
  memoryType?: string;
  sourceChatId?: string | null;
  importance?: number;
}

/**
 * Result from storing a memory
 */
export interface StoredMemory {
  id: string;
  workspaceId: string;
  content: string;
  memoryType: string;
  sourceChatId: string | null;
  importance: number;
  createdAt: Date;
}

/**
 * Daily note search result
 */
export interface DailyNoteResult {
  id: string;
  workspaceId: string;
  noteDate: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Memory context item
 */
export interface MemoryContextItem {
  id: string;
  content: string;
  memoryType: string;
  importance: number;
  createdAt: Date;
}

/**
 * Daily note context item
 */
export interface DailyNoteContextItem {
  id: string;
  noteDate: string;
  content: string;
  createdAt: Date;
}

/**
 * Context memories result
 */
export interface ContextMemoriesResult {
  memories: MemoryContextItem[];
  dailyNotes: DailyNoteContextItem[];
}

/**
 * Options for getting context memories
 */
export interface ContextMemoriesOptions {
  memoryLimit?: number;
  daysLimit?: number;
}

/**
 * Search memories by semantic similarity
 * @param workspaceId - Workspace ID
 * @param query - Search query
 * @param options - Search options
 * @returns Matching memories with similarity scores
 */
export async function searchMemories(
  workspaceId: string,
  query: string,
  options: SearchOptions = {}
): Promise<MemorySearchResult[]> {
  const { limit = 10, threshold = 0.5, types = null } = options;
  const pool = getPool();
  
  try {
    // Generate embedding for query
    const queryEmbedding = await generateEmbedding(query);
    if (!queryEmbedding) {
      // Fall back to text search if embedding fails
      return searchMemoriesByText(workspaceId, query, limit);
    }
    
    // Convert to PostgreSQL array format
    const embeddingStr = `[${queryEmbedding.join(',')}]`;
    
    // Search using pgvector cosine similarity
    let sqlQuery: string;
    let params: (string | string[] | number | string[][])[];
    
    if (types) {
      sqlQuery = `
        SELECT 
          id, workspace_id, content, memory_type, source_chat_id, importance, created_at,
          1 - (embedding <=> $2::vector) as similarity
        FROM memories
        WHERE workspace_id = $1
          AND memory_type = ANY($3)
        ORDER BY embedding <=> $2::vector
        LIMIT $4
      `;
      params = [workspaceId, embeddingStr, types, limit];
    } else {
      sqlQuery = `
        SELECT 
          id, workspace_id, content, memory_type, source_chat_id, importance, created_at,
          1 - (embedding <=> $2::vector) as similarity
        FROM memories
        WHERE workspace_id = $1
        ORDER BY embedding <=> $2::vector
        LIMIT $3
      `;
      params = [workspaceId, embeddingStr, limit];
    }
    
    const { rows } = await pool.query(sqlQuery, params);
    
    // Filter by threshold and format results
    return rows
      .filter(row => row.similarity >= threshold)
      .map(row => ({
        id: row.id,
        workspaceId: row.workspace_id,
        content: row.content,
        memoryType: row.memory_type,
        sourceChatId: row.source_chat_id,
        importance: row.importance,
        createdAt: row.created_at,
        similarity: parseFloat(row.similarity.toFixed(4))
      }));
  } catch (error) {
    // If embedding fails or pgvector not available, fall back to text search
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.warn('[MEMORY SEARCH] Vector search failed, falling back to text search:', message);
    return searchMemoriesByText(workspaceId, query, limit);
  }
}

/**
 * Fallback text search when embeddings unavailable
 */
async function searchMemoriesByText(
  workspaceId: string,
  query: string,
  limit: number = 10
): Promise<MemorySearchResult[]> {
  const pool = getPool();
  
  const { rows } = await pool.query(`
    SELECT 
      id, workspace_id, content, memory_type, source_chat_id, importance, created_at,
      ts_rank_cd(to_tsvector('english', content), to_tsquery('english', $2)) as rank
    FROM memories
    WHERE workspace_id = $1
      AND to_tsvector('english', content) @@ to_tsquery('english', $2)
    ORDER BY rank DESC
    LIMIT $3
  `, [workspaceId, query.split(' ').join(' & '), limit]);
  
  return rows.map(row => ({
    id: row.id,
    workspaceId: row.workspace_id,
    content: row.content,
    memoryType: row.memory_type,
    sourceChatId: row.source_chat_id,
    importance: row.importance,
    createdAt: row.created_at,
    similarity: null // No similarity score for text search
  }));
}

/**
 * Store a memory with embedding
 */
export async function storeMemory(
  workspaceId: string,
  content: string,
  options: StoreMemoryOptions = {}
): Promise<StoredMemory> {
  const { memoryType = 'note', sourceChatId = null, importance = 5 } = options;
  const pool = getPool();
  
  try {
    // Generate embedding
    const embedding = await generateEmbedding(content);
    if (!embedding) {
      throw new Error('Failed to generate embedding');
    }
    const embeddingStr = `[${embedding.join(',')})]`;
    
    // Insert with embedding
    const { rows } = await pool.query(`
      INSERT INTO memories (workspace_id, content, memory_type, source_chat_id, importance, embedding)
      VALUES ($1, $2, $3, $4, $5, $6::vector)
      RETURNING id, workspace_id, content, memory_type, source_chat_id, importance, created_at
    `, [workspaceId, content, memoryType, sourceChatId, importance, embeddingStr]);
    
    return {
      id: rows[0].id,
      workspaceId: rows[0].workspace_id,
      content: rows[0].content,
      memoryType: rows[0].memory_type,
      sourceChatId: rows[0].source_chat_id,
      importance: rows[0].importance,
      createdAt: rows[0].created_at
    };
  } catch (error) {
    // If embedding fails, store without embedding
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.warn('[MEMORY STORE] Embedding failed, storing without vector:', message);
    
    const { rows } = await pool.query(`
      INSERT INTO memories (workspace_id, content, memory_type, source_chat_id, importance)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, workspace_id, content, memory_type, source_chat_id, importance, created_at
    `, [workspaceId, content, memoryType, sourceChatId, importance]);
    
    return {
      id: rows[0].id,
      workspaceId: rows[0].workspace_id,
      content: rows[0].content,
      memoryType: rows[0].memory_type,
      sourceChatId: rows[0].source_chat_id,
      importance: rows[0].importance,
      createdAt: rows[0].created_at
    };
  }
}

/**
 * Update embedding for existing memory
 */
export async function updateMemoryEmbedding(memoryId: string): Promise<void> {
  const pool = getPool();
  
  // Get memory content
  const { rows } = await pool.query(
    'SELECT content FROM memories WHERE id = $1',
    [memoryId]
  );
  
  const memory = rows[0];
  if (!memory) {
    throw new Error('Memory not found');
  }
  
  // Generate and update embedding
  const embedding = await generateEmbedding(memory.content);
  if (!embedding) {
    throw new Error('Failed to generate embedding');
  }
  const embeddingStr = `[${embedding.join(',')}]`;
  
  await pool.query(
    'UPDATE memories SET embedding = $1::vector WHERE id = $2',
    [embeddingStr, memoryId]
  );
}

/**
 * Search daily notes by content
 */
export async function searchDailyNotes(
  workspaceId: string,
  query: string,
  limit: number = 10
): Promise<DailyNoteResult[]> {
  const pool = getPool();
  
  const { rows } = await pool.query(`
    SELECT 
      id, workspace_id, note_date, content, created_at, updated_at,
      ts_rank_cd(to_tsvector('english', content), to_tsquery('english', $2)) as rank
    FROM daily_notes
    WHERE workspace_id = $1
      AND to_tsvector('english', content) @@ to_tsquery('english', $2)
    ORDER BY rank DESC
    LIMIT $3
  `, [workspaceId, query.split(' ').join(' & '), limit]);
  
  return rows.map(row => ({
    id: row.id,
    workspaceId: row.workspace_id,
    noteDate: row.note_date,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

/**
 * Get recent memories and daily notes for context
 */
export async function getContextMemories(
  workspaceId: string,
  options: ContextMemoriesOptions = {}
): Promise<ContextMemoriesResult> {
  const { memoryLimit = 10, daysLimit = 7 } = options;
  const pool = getPool();
  
  // Get recent important memories
  const { rows: memories } = await pool.query(`
    SELECT id, content, memory_type, importance, created_at
    FROM memories
    WHERE workspace_id = $1
    ORDER BY importance DESC, created_at DESC
    LIMIT $2
  `, [workspaceId, memoryLimit]);
  
  // Get recent daily notes
  const { rows: dailyNotes } = await pool.query(`
    SELECT id, note_date, content, created_at
    FROM daily_notes
    WHERE workspace_id = $1
      AND note_date >= CURRENT_DATE - INTERVAL '${daysLimit} days'
    ORDER BY note_date DESC
  `, [workspaceId]);
  
  return {
    memories: memories.map((m: { id: string; content: string; memory_type: string; importance: number; created_at: Date }) => ({
      id: m.id,
      content: m.content,
      memoryType: m.memory_type,
      importance: m.importance,
      createdAt: m.created_at
    })),
    dailyNotes: dailyNotes.map((n: { id: string; note_date: string; content: string; created_at: Date }) => ({
      id: n.id,
      noteDate: n.note_date,
      content: n.content,
      createdAt: n.created_at
    }))
  };
}
