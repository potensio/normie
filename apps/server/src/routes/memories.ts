/**
 * Memory Routes
 * 
 * Thin HTTP layer that delegates to memory service.
 * All business logic is in services/memory.service.ts
 */

import { Router, Request, Response } from 'express';
import { requireAuth, requireWorkspaceAccess } from '../auth/index.js';
import { getDb } from '../db/index.js';
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
  asyncHandler
} from '../middleware/index.js';
import {
  listMemories,
  getMemoryById,
  createMemory,
  createMemoryWithEmbedding,
  deleteMemory,
  getDailyNote,
  saveDailyNote,
  searchWorkspaceMemories,
  searchWorkspaceDailyNotes,
  getAIContext,
  verifyMemoryAccess,
  verifyMemoryWriteAccess,
  type CreateMemoryInput,
  type SaveDailyNoteInput,
  type ListMemoriesOptions,
  type SearchMemoriesOptions
} from '../services/memory.service.js';

const router = Router();

router.use(requireAuth);

// ============================================
// Helper
// ============================================

function getStringParam(value: string | string[] | undefined): string {
  if (!value) return '';
  if (Array.isArray(value)) return value[0] || '';
  return value;
}

// ============================================
// LIST MEMORIES
// ============================================
router.get('/workspace/:workspaceId', requireWorkspaceAccess, asyncHandler(async (req: Request, res: Response) => {
  const workspaceId = getStringParam(req.params.workspaceId);
  const { type, limit, offset } = req.query;

  const options: ListMemoriesOptions = {
    type: type as string | undefined,
    limit: limit ? parseInt(limit as string) : 50,
    offset: offset ? parseInt(offset as string) : 0
  };

  const memories = await listMemories(getDb(), workspaceId, options);
  res.json({ memories });
}));

// ============================================
// GET DAILY NOTE
// ============================================
router.get('/workspace/:workspaceId/daily/:date', requireWorkspaceAccess, asyncHandler(async (req: Request, res: Response) => {
  const workspaceId = getStringParam(req.params.workspaceId);
  const date = getStringParam(req.params.date);

  const note = await getDailyNote(getDb(), workspaceId, date);
  res.json(note);
}));

// ============================================
// SAVE DAILY NOTE
// ============================================
router.put('/workspace/:workspaceId/daily/:date', requireWorkspaceAccess, asyncHandler(async (req: Request, res: Response) => {
  if (req.workspaceRole === 'viewer') {
    throw new ForbiddenError('Viewers cannot edit');
  }

  const workspaceId = getStringParam(req.params.workspaceId);
  const date = getStringParam(req.params.date);
  const input: SaveDailyNoteInput = req.body;

  if (!input.content && input.content !== '') {
    throw new ValidationError('Content required');
  }

  const note = await saveDailyNote(getDb(), workspaceId, date, input);
  res.json(note);
}));

// ============================================
// CREATE MEMORY
// ============================================
router.post('/workspace/:workspaceId', requireWorkspaceAccess, asyncHandler(async (req: Request, res: Response) => {
  if (req.workspaceRole === 'viewer') {
    throw new ForbiddenError('Viewers cannot create memories');
  }

  const workspaceId = getStringParam(req.params.workspaceId);
  const input: CreateMemoryInput = {
    content: req.body.content,
    memoryType: req.body.memoryType,
    sourceChatId: req.body.sourceChatId,
    importance: req.body.importance
  };

  const memory = await createMemory(getDb(), workspaceId, input);
  res.json(memory);
}));

// ============================================
// CREATE MEMORY WITH EMBEDDING
// ============================================
router.post('/workspace/:workspaceId/with-embedding', requireWorkspaceAccess, asyncHandler(async (req: Request, res: Response) => {
  if (req.workspaceRole === 'viewer') {
    throw new ForbiddenError('Viewers cannot create memories');
  }

  const workspaceId = getStringParam(req.params.workspaceId);
  const input: CreateMemoryInput = {
    content: req.body.content,
    memoryType: req.body.memoryType,
    sourceChatId: req.body.sourceChatId,
    importance: req.body.importance
  };

  const memory = await createMemoryWithEmbedding(workspaceId, input);
  res.json({
    id: memory.id,
    workspaceId: memory.workspaceId,
    content: memory.content,
    memoryType: memory.memoryType,
    importance: memory.importance,
    createdAt: memory.createdAt
  });
}));

// ============================================
// GET MEMORY
// ============================================
router.get('/:memoryId', asyncHandler(async (req: Request, res: Response) => {
  const memoryId = getStringParam(req.params.memoryId);
  const { memory } = await verifyMemoryAccess(getDb(), memoryId, req.userId!);
  res.json(memory);
}));

// ============================================
// DELETE MEMORY
// ============================================
router.delete('/:memoryId', asyncHandler(async (req: Request, res: Response) => {
  const memoryId = getStringParam(req.params.memoryId);
  await verifyMemoryWriteAccess(getDb(), memoryId, req.userId!);
  await deleteMemory(getDb(), memoryId);
  res.json({ success: true });
}));

// ============================================
// SEMANTIC SEARCH MEMORIES
// ============================================
router.get('/workspace/:workspaceId/search', requireWorkspaceAccess, asyncHandler(async (req: Request, res: Response) => {
  const workspaceId = getStringParam(req.params.workspaceId);
  const { q, limit, threshold, types } = req.query;

  if (!q) {
    throw new ValidationError('Query parameter "q" required');
  }

  const options: SearchMemoriesOptions = {
    limit: limit ? parseInt(limit as string) : 10,
    threshold: threshold ? parseFloat(threshold as string) : 0.5,
    types: types ? (types as string).split(',').map(t => t.trim()) : null
  };

  const results = await searchWorkspaceMemories(workspaceId, q as string, options);
  res.json({ results, query: q });
}));

// ============================================
// SEARCH DAILY NOTES
// ============================================
router.get('/workspace/:workspaceId/search-notes', requireWorkspaceAccess, asyncHandler(async (req: Request, res: Response) => {
  const workspaceId = getStringParam(req.params.workspaceId);
  const { q, limit } = req.query;

  if (!q) {
    throw new ValidationError('Query parameter "q" required');
  }

  const results = await searchWorkspaceDailyNotes(
    workspaceId,
    q as string,
    limit ? parseInt(limit as string) : 10
  );
  res.json({ results, query: q });
}));

// ============================================
// GET CONTEXT (for AI)
// ============================================
router.get('/workspace/:workspaceId/context', requireWorkspaceAccess, asyncHandler(async (req: Request, res: Response) => {
  const workspaceId = getStringParam(req.params.workspaceId);
  const { memoryLimit, daysLimit } = req.query;

  const context = await getAIContext(workspaceId, {
    memoryLimit: memoryLimit ? parseInt(memoryLimit as string) : 10,
    daysLimit: daysLimit ? parseInt(daysLimit as string) : 7
  });

  res.json(context);
}));

export default router;