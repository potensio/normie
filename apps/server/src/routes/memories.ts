import { Router, Request, Response } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { requireAuth, requireWorkspaceAccess } from '../auth/index.js';
import { getDb } from '../db/index.js';
import * as schema from '../db/schema.js';
import { searchMemories, storeMemory, searchDailyNotes, getContextMemories } from '../services/memory-search.js';

const router = Router();

router.use(requireAuth);

// Request body types
interface CreateMemoryBody {
  content: string;
  memoryType?: string;
  sourceChatId?: string;
  importance?: number;
}

interface SaveDailyNoteBody {
  content: string;
}

// Query parameter types
interface ListMemoriesQuery {
  type?: string;
  limit?: string;
  offset?: string;
}

interface SearchQuery {
  q?: string;
  limit?: string;
  threshold?: string;
  types?: string;
}

interface ContextQuery {
  memoryLimit?: string;
  daysLimit?: string;
}

// ============================================
// LIST MEMORIES
// ============================================
router.get('/workspace/:workspaceId', requireWorkspaceAccess, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.params.workspaceId as string;
    const { type, limit = '50', offset = '0' } = req.query as ListMemoriesQuery;
    const db = getDb();

    let memories;

    if (type) {
      memories = await db.select()
        .from(schema.memories)
        .where(and(
          eq(schema.memories.workspaceId, workspaceId),
          eq(schema.memories.memoryType, type)
        ))
        .orderBy(desc(schema.memories.createdAt))
        .limit(parseInt(limit))
        .offset(parseInt(offset));
    } else {
      memories = await db.select()
        .from(schema.memories)
        .where(eq(schema.memories.workspaceId, workspaceId))
        .orderBy(desc(schema.memories.createdAt))
        .limit(parseInt(limit))
        .offset(parseInt(offset));
    }

    res.json({ memories });
  } catch (err) {
    console.error('[MEMORY] List error:', err);
    res.status(500).json({ error: 'Failed to list memories' });
  }
});

// ============================================
// GET DAILY NOTE
// ============================================
router.get('/workspace/:workspaceId/daily/:date', requireWorkspaceAccess, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.params.workspaceId as string;
    const date = req.params.date as string;
    const db = getDb();

    const [note] = await db.select()
      .from(schema.dailyNotes)
      .where(and(
        eq(schema.dailyNotes.workspaceId, workspaceId),
        eq(schema.dailyNotes.noteDate, date)
      ));

    res.json(note || { content: '', noteDate: date });
  } catch (err) {
    console.error('[MEMORY] Get daily note error:', err);
    res.status(500).json({ error: 'Failed to get daily note' });
  }
});

// ============================================
// SAVE DAILY NOTE
// ============================================
router.put('/workspace/:workspaceId/daily/:date', requireWorkspaceAccess, async (req: Request, res: Response) => {
  if (req.workspaceRole === 'viewer') {
    return res.status(403).json({ error: 'Viewers cannot edit' });
  }

  try {
    const workspaceId = req.params.workspaceId as string;
    const date = req.params.date as string;
    const { content } = req.body as SaveDailyNoteBody;
    const db = getDb();

    const [existing] = await db.select()
      .from(schema.dailyNotes)
      .where(and(
        eq(schema.dailyNotes.workspaceId, workspaceId),
        eq(schema.dailyNotes.noteDate, date)
      ));

    if (existing) {
      const [updated] = await db.update(schema.dailyNotes)
        .set({ content, updatedAt: new Date() })
        .where(eq(schema.dailyNotes.id, existing.id))
        .returning();
      res.json(updated);
    } else {
      const [created] = await db.insert(schema.dailyNotes)
        .values({
          workspaceId,
          noteDate: date,
          content
        })
        .returning();
      res.json(created);
    }
  } catch (err) {
    console.error('[MEMORY] Save daily note error:', err);
    res.status(500).json({ error: 'Failed to save daily note' });
  }
});

// ============================================
// CREATE MEMORY
// ============================================
router.post('/workspace/:workspaceId', requireWorkspaceAccess, async (req: Request, res: Response) => {
  if (req.workspaceRole === 'viewer') {
    return res.status(403).json({ error: 'Viewers cannot create memories' });
  }

  try {
    const workspaceId = req.params.workspaceId as string;
    const { content, memoryType = 'note', sourceChatId, importance = 5 } = req.body as CreateMemoryBody;

    if (!content) {
      return res.status(400).json({ error: 'Content required' });
    }

    const db = getDb();
    const [memory] = await db.insert(schema.memories)
      .values({
        workspaceId,
        content,
        memoryType,
        sourceChatId: sourceChatId || null,
        importance
      })
      .returning();

    res.json(memory);
  } catch (err) {
    console.error('[MEMORY] Create error:', err);
    res.status(500).json({ error: 'Failed to create memory' });
  }
});

// ============================================
// GET MEMORY
// ============================================
router.get('/:memoryId', async (req: Request, res: Response) => {
  try {
    const memoryId = req.params.memoryId as string;
    const db = getDb();
    const [memory] = await db.select()
      .from(schema.memories)
      .where(eq(schema.memories.id, memoryId));

    if (!memory) {
      return res.status(404).json({ error: 'Memory not found' });
    }

    // Verify workspace access
    const [workspace] = await db.select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, memory.workspaceId));

    const isOwner = workspace.ownerId === req.userId;
    if (!isOwner) {
      const [membership] = await db.select()
        .from(schema.workspaceMembers)
        .where(and(
          eq(schema.workspaceMembers.workspaceId, workspace.id),
          eq(schema.workspaceMembers.userId, req.userId!)
        ));
      if (!membership) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    res.json(memory);
  } catch (err) {
    console.error('[MEMORY] Get error:', err);
    res.status(500).json({ error: 'Failed to get memory' });
  }
});

// ============================================
// DELETE MEMORY
// ============================================
router.delete('/:memoryId', async (req: Request, res: Response) => {
  try {
    const memoryId = req.params.memoryId as string;
    const db = getDb();
    const [memory] = await db.select()
      .from(schema.memories)
      .where(eq(schema.memories.id, memoryId));

    if (!memory) {
      return res.status(404).json({ error: 'Memory not found' });
    }

    // Verify workspace access with edit permission
    const [workspace] = await db.select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, memory.workspaceId));

    const isOwner = workspace.ownerId === req.userId;
    if (!isOwner) {
      const [membership] = await db.select()
        .from(schema.workspaceMembers)
        .where(and(
          eq(schema.workspaceMembers.workspaceId, workspace.id),
          eq(schema.workspaceMembers.userId, req.userId!)
        ));
      if (!membership || membership.role === 'viewer') {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    await db.delete(schema.memories)
      .where(eq(schema.memories.id, memory.id));

    res.json({ success: true });
  } catch (err) {
    console.error('[MEMORY] Delete error:', err);
    res.status(500).json({ error: 'Failed to delete memory' });
  }
});

// ============================================
// SEMANTIC SEARCH MEMORIES
// ============================================
router.get('/workspace/:workspaceId/search', requireWorkspaceAccess, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.params.workspaceId as string;
    const { q, limit = '10', threshold = '0.5', types } = req.query as SearchQuery;
    
    if (!q) {
      return res.status(400).json({ error: 'Query parameter "q" required' });
    }

    const typeArray = types ? types.split(',').map(t => t.trim()) : null;
    
    const results = await searchMemories(workspaceId, q, {
      limit: parseInt(limit),
      threshold: parseFloat(threshold),
      types: typeArray
    });
    
    res.json({ results, query: q });
  } catch (err) {
    console.error('[MEMORY] Search error:', err);
    res.status(500).json({ error: 'Failed to search memories' });
  }
});

// ============================================
// SEARCH DAILY NOTES
// ============================================
router.get('/workspace/:workspaceId/search-notes', requireWorkspaceAccess, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.params.workspaceId as string;
    const { q, limit = '10' } = req.query as SearchQuery;
    
    if (!q) {
      return res.status(400).json({ error: 'Query parameter "q" required' });
    }
    
    const results = await searchDailyNotes(workspaceId, q, parseInt(limit));
    res.json({ results, query: q });
  } catch (err) {
    console.error('[MEMORY] Search notes error:', err);
    res.status(500).json({ error: 'Failed to search daily notes' });
  }
});

// ============================================
// GET CONTEXT (for AI)
// ============================================
router.get('/workspace/:workspaceId/context', requireWorkspaceAccess, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.params.workspaceId as string;
    const { memoryLimit = '10', daysLimit = '7' } = req.query as ContextQuery;
    
    const context = await getContextMemories(workspaceId, {
      memoryLimit: parseInt(memoryLimit),
      daysLimit: parseInt(daysLimit)
    });
    
    res.json(context);
  } catch (err) {
    console.error('[MEMORY] Context error:', err);
    res.status(500).json({ error: 'Failed to get context' });
  }
});

// ============================================
// CREATE MEMORY WITH EMBEDDING
// ============================================
router.post('/workspace/:workspaceId/with-embedding', requireWorkspaceAccess, async (req: Request, res: Response) => {
  if (req.workspaceRole === 'viewer') {
    return res.status(403).json({ error: 'Viewers cannot create memories' });
  }

  try {
    const workspaceId = req.params.workspaceId as string;
    const { content, memoryType = 'note', sourceChatId, importance = 5 } = req.body as CreateMemoryBody;

    if (!content) {
      return res.status(400).json({ error: 'Content required' });
    }

    const memory = await storeMemory(workspaceId, content, {
      memoryType,
      sourceChatId: sourceChatId || null,
      importance
    });

    res.json({
      id: memory.id,
      workspaceId: memory.workspaceId,
      content: memory.content,
      memoryType: memory.memoryType,
      importance: memory.importance,
      createdAt: memory.createdAt
    });
  } catch (err) {
    console.error('[MEMORY] Create with embedding error:', err);
    res.status(500).json({ error: 'Failed to create memory' });
  }
});

export default router;
