import { Router, Request, Response } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { requireAuth, requireWorkspaceAccess } from '../auth/index.js';
import { getDb } from '../db/index.js';
import * as schema from '../db/schema.js';
import {
  getValidatedModel,
  NormieSessionManager,
  getEnabledProviders,
} from '../pi/index.js';

const router = Router();

router.use(requireAuth);

// Request body types
interface CreateChatBody {
  title?: string;
  provider?: string;
  model?: string;
}

interface UpdateChatBody {
  title?: string;
  model?: string;
}

interface SwitchModelBody {
  provider: string;
  model: string;
}

interface CreateBranchBody {
  branchFromMessageId: string;
  title?: string;
}

interface AddMessageBody {
  role: string;
  content: string;
  metadata?: Record<string, unknown>;
}

// ============================================
// LIST CHATS
// ============================================
router.get('/workspace/:workspaceId', requireWorkspaceAccess, async (req: Request, res: Response) => {
  try {
    const workspaceId = req.params.workspaceId as string;
    const db = getDb();
    const chatsList = await db.select({
      id: schema.chats.id,
      title: schema.chats.title,
      provider: schema.chats.provider,
      model: schema.chats.model,
      sessionFilePath: schema.chats.sessionFilePath,
      parentChatId: schema.chats.parentChatId,
      createdAt: schema.chats.createdAt,
      updatedAt: schema.chats.updatedAt
    })
      .from(schema.chats)
      .where(eq(schema.chats.workspaceId, workspaceId))
      .orderBy(desc(schema.chats.updatedAt));

    res.json({ chats: chatsList });
  } catch (err) {
    console.error('[CHAT] List error:', err);
    res.status(500).json({ error: 'Failed to list chats' });
  }
});

// ============================================
// CREATE CHAT
// ============================================
router.post('/workspace/:workspaceId', requireWorkspaceAccess, async (req: Request, res: Response) => {
  if (req.workspaceRole === 'viewer') {
    return res.status(403).json({ error: 'Viewers cannot create chats' });
  }

  try {
    const workspaceId = req.params.workspaceId as string;
    const { title, provider = 'claude', model } = req.body as CreateChatBody;
    const db = getDb();

    const [chat] = await db.insert(schema.chats)
      .values({
        workspaceId,
        userId: req.userId!,
        title: title || 'New Chat',
        provider,
        model: model || null
      })
      .returning({
        id: schema.chats.id,
        title: schema.chats.title,
        provider: schema.chats.provider,
        model: schema.chats.model,
        sessionFilePath: schema.chats.sessionFilePath,
        parentChatId: schema.chats.parentChatId,
        createdAt: schema.chats.createdAt
      });

    res.json(chat);
  } catch (err) {
    console.error('[CHAT] Create error:', err);
    res.status(500).json({ error: 'Failed to create chat' });
  }
});

// ============================================
// GET CHAT WITH MESSAGES
// ============================================
router.get('/:chatId', async (req: Request, res: Response) => {
  try {
    const chatId = req.params.chatId as string;
    const db = getDb();

    // Get chat
    const [chat] = await db.select()
      .from(schema.chats)
      .where(eq(schema.chats.id, chatId));

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    // Verify workspace access
    const [workspace] = await db.select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, chat.workspaceId));

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

    // Get messages
    const messages = await db.select()
      .from(schema.messages)
      .where(eq(schema.messages.chatId, chat.id))
      .orderBy(schema.messages.createdAt);

    res.json({ ...chat, messages });
  } catch (err) {
    console.error('[CHAT] Get error:', err);
    res.status(500).json({ error: 'Failed to get chat' });
  }
});

// ============================================
// UPDATE CHAT
// ============================================
router.patch('/:chatId', async (req: Request, res: Response) => {
  try {
    const chatId = req.params.chatId as string;
    const { title, model } = req.body as UpdateChatBody;
    const db = getDb();

    // Get chat and verify ownership
    const [chat] = await db.select()
      .from(schema.chats)
      .where(eq(schema.chats.id, chatId));

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    // Verify access
    const [workspace] = await db.select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, chat.workspaceId));

    if (workspace.ownerId !== req.userId) {
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

    const [updated] = await db.update(schema.chats)
      .set({ title, model, updatedAt: new Date() })
      .where(eq(schema.chats.id, chat.id))
      .returning({
        id: schema.chats.id,
        title: schema.chats.title,
        model: schema.chats.model
      });

    res.json(updated);
  } catch (err) {
    console.error('[CHAT] Update error:', err);
    res.status(500).json({ error: 'Failed to update chat' });
  }
});

// ============================================
// SWITCH MODEL (Pi Agent)
// ============================================
router.patch('/:chatId/model', async (req: Request, res: Response) => {
  try {
    const chatId = req.params.chatId as string;
    const { provider, model } = req.body as SwitchModelBody;
    const db = getDb();

    if (!provider || !model) {
      return res.status(400).json({ error: 'Provider and model are required' });
    }

    // Validate provider/model
    const validatedModel = getValidatedModel(provider, model);
    if (!validatedModel) {
      return res.status(400).json({ error: `Invalid provider/model: ${provider}/${model}` });
    }

    // Get chat and verify ownership
    const [chat] = await db.select()
      .from(schema.chats)
      .where(eq(schema.chats.id, chatId));

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    // Verify access
    const [workspace] = await db.select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, chat.workspaceId));

    if (workspace.ownerId !== req.userId) {
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

    const [updated] = await db.update(schema.chats)
      .set({ 
        provider, 
        model,
        updatedAt: new Date() 
      })
      .where(eq(schema.chats.id, chat.id))
      .returning({
        id: schema.chats.id,
        provider: schema.chats.provider,
        model: schema.chats.model,
        updatedAt: schema.chats.updatedAt
      });

    res.json(updated);
  } catch (err) {
    console.error('[CHAT] Switch model error:', err);
    res.status(500).json({ error: 'Failed to switch model' });
  }
});

// ============================================
// CREATE BRANCH (Pi Agent)
// ============================================
router.post('/:chatId/branch', async (req: Request, res: Response) => {
  try {
    const chatId = req.params.chatId as string;
    const { branchFromMessageId, title } = req.body as CreateBranchBody;
    const db = getDb();

    if (!branchFromMessageId) {
      return res.status(400).json({ error: 'branchFromMessageId is required' });
    }

    // Get parent chat
    const [parentChat] = await db.select()
      .from(schema.chats)
      .where(eq(schema.chats.id, chatId));

    if (!parentChat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    // Verify access
    const [workspace] = await db.select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, parentChat.workspaceId));

    if (workspace.ownerId !== req.userId) {
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

    // Create branch session
    const branchSession = await NormieSessionManager.createBranch(
      {
        workspaceId: parentChat.workspaceId,
        chatId: parentChat.id,
      },
      branchFromMessageId,
    );

    // Create new chat record for branch
    const [branchChat] = await db.insert(schema.chats)
      .values({
        workspaceId: parentChat.workspaceId,
        userId: req.userId!,
        title: title || `${parentChat.title} (branch)`,
        provider: parentChat.provider,
        model: parentChat.model,
        parentChatId: parentChat.id,
        branchPointMessageId: branchFromMessageId,
        sessionFilePath: branchSession.getSessionFilePath(),
      })
      .returning();

    res.json(branchChat);
  } catch (err) {
    console.error('[CHAT] Branch creation error:', err);
    res.status(500).json({ error: 'Failed to create branch' });
  }
});

// ============================================
// GET CONVERSATION TREE (Pi Agent)
// ============================================
router.get('/:chatId/tree', async (req: Request, res: Response) => {
  try {
    const chatId = req.params.chatId as string;
    const db = getDb();

    // Get root chat
    const [rootChat] = await db.select()
      .from(schema.chats)
      .where(eq(schema.chats.id, chatId));

    if (!rootChat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    // Verify access
    const [workspace] = await db.select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, rootChat.workspaceId));

    if (workspace.ownerId !== req.userId) {
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

    // Build tree recursively
    const buildChatTree = async (chatId: string): Promise<any> => {
      const [chat] = await db.select()
        .from(schema.chats)
        .where(eq(schema.chats.id, chatId));

      if (!chat) return null;

      // Get child branches
      const branches = await db.select()
        .from(schema.chats)
        .where(eq(schema.chats.parentChatId, chatId))
        .orderBy(schema.chats.createdAt);

      // Recursively build tree for each branch
      const branchTrees = await Promise.all(
        branches.map((branch) => buildChatTree(branch.id)),
      );

      return {
        id: chat.id,
        title: chat.title,
        provider: chat.provider,
        model: chat.model,
        branchPointMessageId: chat.branchPointMessageId,
        createdAt: chat.createdAt,
        branches: branchTrees.filter(Boolean),
      };
    };

    const tree = await buildChatTree(rootChat.id);
    res.json({ root: tree });
  } catch (err) {
    console.error('[CHAT] Tree retrieval error:', err);
    res.status(500).json({ error: 'Failed to get conversation tree' });
  }
});

// ============================================
// DELETE CHAT
// ============================================
router.delete('/:chatId', async (req: Request, res: Response) => {
  try {
    const chatId = req.params.chatId as string;
    const db = getDb();

    // Get chat and verify ownership
    const [chat] = await db.select()
      .from(schema.chats)
      .where(eq(schema.chats.id, chatId));

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    // Verify access
    const [workspace] = await db.select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, chat.workspaceId));

    if (workspace.ownerId !== req.userId) {
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

    await db.delete(schema.chats)
      .where(eq(schema.chats.id, chat.id));

    res.json({ success: true });
  } catch (err) {
    console.error('[CHAT] Delete error:', err);
    res.status(500).json({ error: 'Failed to delete chat' });
  }
});

// ============================================
// ADD MESSAGE
// ============================================
router.post('/:chatId/messages', async (req: Request, res: Response) => {
  try {
    const chatId = req.params.chatId as string;
    const { role, content, metadata } = req.body as AddMessageBody;
    
    if (!role || !content) {
      return res.status(400).json({ error: 'Role and content required' });
    }

    const db = getDb();

    // Get chat and verify access
    const [chat] = await db.select()
      .from(schema.chats)
      .where(eq(schema.chats.id, chatId));

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    // Verify access
    const [workspace] = await db.select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, chat.workspaceId));

    if (workspace.ownerId !== req.userId) {
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

    const [message] = await db.insert(schema.messages)
      .values({
        chatId: chat.id,
        role,
        content,
        metadata: metadata || {}
      })
      .returning({
        id: schema.messages.id,
        role: schema.messages.role,
        content: schema.messages.content,
        metadata: schema.messages.metadata,
        createdAt: schema.messages.createdAt
      });

    // Update chat updatedAt
    await db.update(schema.chats)
      .set({ updatedAt: new Date() })
      .where(eq(schema.chats.id, chat.id));

    res.json(message);
  } catch (err) {
    console.error('[CHAT] Add message error:', err);
    res.status(500).json({ error: 'Failed to add message' });
  }
});

export default router;
