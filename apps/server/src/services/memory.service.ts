/**
 * Memory Service
 * 
 * Business logic for memory and daily note operations.
 * All functions receive db client as parameter for testability.
 */

import { eq, and, desc } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../middleware/index.js';
import { searchMemories, storeMemory, searchDailyNotes, getContextMemories } from './memory-search.js';

// ============================================
// Types
// ============================================

export type DbClient = NodePgDatabase<typeof schema>;

export interface CreateMemoryInput {
  content: string;
  memoryType?: string;
  sourceChatId?: string;
  importance?: number;
}

export interface SaveDailyNoteInput {
  content: string;
}

export interface ListMemoriesOptions {
  type?: string;
  limit?: number;
  offset?: number;
}

export interface SearchMemoriesOptions {
  limit?: number;
  threshold?: number;
  types?: string[] | null;
}

// ============================================
// Memories CRUD
// ============================================

/**
 * List memories for a workspace
 */
export async function listMemories(
  db: DbClient,
  workspaceId: string,
  options: ListMemoriesOptions = {}
): Promise<typeof schema.memories.$inferSelect[]> {
  const { type, limit = 50, offset = 0 } = options;

  let query = db.select()
    .from(schema.memories)
    .where(eq(schema.memories.workspaceId, workspaceId))
    .orderBy(desc(schema.memories.createdAt))
    .limit(limit)
    .offset(offset);

  if (type) {
    query = db.select()
      .from(schema.memories)
      .where(and(
        eq(schema.memories.workspaceId, workspaceId),
        eq(schema.memories.memoryType, type)
      ))
      .orderBy(desc(schema.memories.createdAt))
      .limit(limit)
      .offset(offset);
  }

  return query;
}

/**
 * Get a single memory by ID
 */
export async function getMemoryById(
  db: DbClient,
  memoryId: string
): Promise<typeof schema.memories.$inferSelect> {
  const [memory] = await db.select()
    .from(schema.memories)
    .where(eq(schema.memories.id, memoryId));

  if (!memory) {
    throw new NotFoundError('Memory');
  }

  return memory;
}

/**
 * Create a memory
 */
export async function createMemory(
  db: DbClient,
  workspaceId: string,
  input: CreateMemoryInput
): Promise<typeof schema.memories.$inferSelect> {
  if (!input.content) {
    throw new ValidationError('Content required');
  }

  const [memory] = await db.insert(schema.memories)
    .values({
      workspaceId,
      content: input.content,
      memoryType: input.memoryType || 'note',
      sourceChatId: input.sourceChatId || null,
      importance: input.importance || 5
    })
    .returning();

  return memory;
}

/**
 * Create a memory with embedding (for semantic search)
 */
export async function createMemoryWithEmbedding(
  workspaceId: string,
  input: CreateMemoryInput
): Promise<typeof schema.memories.$inferSelect> {
  if (!input.content) {
    throw new ValidationError('Content required');
  }

  const memory = await storeMemory(workspaceId, input.content, {
    memoryType: input.memoryType || 'note',
    sourceChatId: input.sourceChatId || null,
    importance: input.importance || 5
  });

  return memory;
}

/**
 * Delete a memory
 */
export async function deleteMemory(
  db: DbClient,
  memoryId: string
): Promise<void> {
  const result = await db.delete(schema.memories)
    .where(eq(schema.memories.id, memoryId))
    .returning({ id: schema.memories.id });

  if (result.length === 0) {
    throw new NotFoundError('Memory');
  }
}

// ============================================
// Daily Notes
// ============================================

/**
 * Get daily note for a specific date
 */
export async function getDailyNote(
  db: DbClient,
  workspaceId: string,
  date: string
): Promise<{ content: string; noteDate: string; id?: string; createdAt?: Date; updatedAt?: Date }> {
  const [note] = await db.select()
    .from(schema.dailyNotes)
    .where(and(
      eq(schema.dailyNotes.workspaceId, workspaceId),
      eq(schema.dailyNotes.noteDate, date)
    ));

  if (!note) {
    return { content: '', noteDate: date };
  }

  return note;
}

/**
 * Save (create or update) daily note
 */
export async function saveDailyNote(
  db: DbClient,
  workspaceId: string,
  date: string,
  input: SaveDailyNoteInput
): Promise<typeof schema.dailyNotes.$inferSelect> {
  const [existing] = await db.select()
    .from(schema.dailyNotes)
    .where(and(
      eq(schema.dailyNotes.workspaceId, workspaceId),
      eq(schema.dailyNotes.noteDate, date)
    ));

  if (existing) {
    const [updated] = await db.update(schema.dailyNotes)
      .set({ content: input.content, updatedAt: new Date() })
      .where(eq(schema.dailyNotes.id, existing.id))
      .returning();

    return updated;
  }

  const [created] = await db.insert(schema.dailyNotes)
    .values({
      workspaceId,
      noteDate: date,
      content: input.content
    })
    .returning();

  return created;
}

// ============================================
// Semantic Search
// ============================================

/**
 * Search memories semantically
 */
export async function searchWorkspaceMemories(
  workspaceId: string,
  query: string,
  options: SearchMemoriesOptions = {}
): Promise<unknown[]> {
  const { limit = 10, threshold = 0.5, types = null } = options;

  const results = await searchMemories(workspaceId, query, {
    limit,
    threshold,
    types
  });

  return results;
}

/**
 * Search daily notes
 */
export async function searchWorkspaceDailyNotes(
  workspaceId: string,
  query: string,
  limit: number = 10
): Promise<unknown[]> {
  return searchDailyNotes(workspaceId, query, limit);
}

/**
 * Get context memories for AI
 */
export async function getAIContext(
  workspaceId: string,
  options: { memoryLimit?: number; daysLimit?: number } = {}
): Promise<unknown> {
  return getContextMemories(workspaceId, {
    memoryLimit: options.memoryLimit || 10,
    daysLimit: options.daysLimit || 7
  });
}

// ============================================
// Authorization Helpers
// ============================================

/**
 * Verify user has access to a memory's workspace
 */
export async function verifyMemoryAccess(
  db: DbClient,
  memoryId: string,
  userId: string
): Promise<{
  memory: typeof schema.memories.$inferSelect;
  workspace: typeof schema.workspaces.$inferSelect;
  isOwner: boolean;
  role: 'owner' | 'admin' | 'member' | 'viewer' | null;
}> {
  const memory = await getMemoryById(db, memoryId);

  const [workspace] = await db.select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, memory.workspaceId));

  if (!workspace) {
    throw new NotFoundError('Workspace');
  }

  // Check if owner
  if (workspace.ownerId === userId) {
    return { memory, workspace, isOwner: true, role: 'owner' };
  }

  // Check membership
  const [membership] = await db.select()
    .from(schema.workspaceMembers)
    .where(and(
      eq(schema.workspaceMembers.workspaceId, workspace.id),
      eq(schema.workspaceMembers.userId, userId)
    ));

  if (!membership) {
    throw new ForbiddenError('Access denied to this memory');
  }

  return {
    memory,
    workspace,
    isOwner: false,
    role: membership.role as 'admin' | 'member' | 'viewer'
  };
}

/**
 * Verify user has write access to a memory
 */
export async function verifyMemoryWriteAccess(
  db: DbClient,
  memoryId: string,
  userId: string
): Promise<{
  memory: typeof schema.memories.$inferSelect;
  workspace: typeof schema.workspaces.$inferSelect;
}> {
  const access = await verifyMemoryAccess(db, memoryId, userId);

  if (!access.isOwner && access.role === 'viewer') {
    throw new ForbiddenError('Viewers cannot modify memories');
  }

  return { memory: access.memory, workspace: access.workspace };
}