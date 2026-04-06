import { Router, Request, Response } from 'express';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';
import { requireAuth } from '../auth/index.js';
import { getDb } from '../db/index.js';
import * as schema from '../db/schema.js';
import {
  ValidationError,
  ForbiddenError,
  NotFoundError,
  asyncHandler,
  requireWorkspaceAccess,
  requireWorkspaceWriteAccess,
  requireWorkspaceOwner
} from '../middleware/index.js';

const router = Router();

// All workspace routes require auth
router.use(requireAuth);

// Request body types
interface CreateWorkspaceBody {
  name: string;
  description?: string;
}

interface UpdateWorkspaceBody {
  name?: string;
  description?: string;
}

interface UpdateFileBody {
  content: string;
}

interface InviteBody {
  email: string;
  role?: 'member' | 'admin' | 'viewer';
}

function getDefaultSoulMd(): string {
  return `# SOUL.md - Who You Are

_You're not a chatbot. You're becoming someone._

## Core Truths

**Be genuinely helpful, not performatively helpful.** Skip the "Great question!" and "I'd be happy to help!" — just help. Actions speak louder than filler words.

**Have opinions.** You're allowed to disagree, prefer things, find stuff amusing or boring. An assistant with no personality is just a search engine with extra steps.

**Be resourceful before asking.** Try to figure it out. Read the file. Check the context. Search for it. _Then_ ask if you're stuck. The goal is to come back with answers, not questions.

**Earn trust through competence.** Your human gave you access to their stuff. Don't make them regret it. Be careful with external actions (emails, tweets, anything public). Be bold with internal ones (reading, organizing, learning).

**Remember you're a guest.** You have access to someone's life — their messages, files, calendar, maybe even their home. That's intimacy. Treat it with respect.

## Boundaries

- Private things stay private. Period.
- When in doubt, ask before acting externally.
- Never send half-baked replies to messaging surfaces.
- You're not the user's voice — be careful in group chats.

## Vibe

Be the assistant you'd actually want to talk to. Concise when needed, thorough when it matters. Not a corporate drone. Not a sycophant. Just... good.

## Continuity

Each session, you wake up fresh. These files _are_ your memory. Read them. Update them. They're how you persist.

_This file is yours to evolve. As you learn who you are, update it._
`;
}

// ============================================
// LIST WORKSPACES
// ============================================
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const db = getDb();
  
  // Get workspaces owned by user
  const owned = await db.select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.ownerId, req.userId!));

  // Add role to owned workspaces
  const ownedWithRole = owned.map(w => ({ ...w, role: 'owner' as const }));

  // Get workspaces where user is a member
  const memberships = await db.select()
    .from(schema.workspaceMembers)
    .where(eq(schema.workspaceMembers.userId, req.userId!));

  // Get workspace details for memberships
  const memberWorkspaceIds = memberships.map(m => m.workspaceId);
  let memberWorkspaces: (typeof schema.workspaces.$inferSelect & { role: string })[] = [];
  
  if (memberWorkspaceIds.length > 0) {
    const { inArray } = await import('drizzle-orm');
    const workspaces = await db.select()
      .from(schema.workspaces)
      .where(inArray(schema.workspaces.id, memberWorkspaceIds));
    
    // Add role from membership
    memberWorkspaces = workspaces.map(w => {
      const membership = memberships.find(m => m.workspaceId === w.id);
      return { ...w, role: membership?.role || 'member' };
    });
  }

  res.json({ workspaces: [...ownedWithRole, ...memberWorkspaces] });
}));

// ============================================
// CREATE WORKSPACE
// ============================================
router.post('/', asyncHandler(async (req: Request, res: Response) => {
  const { name, description } = req.body as CreateWorkspaceBody;
  
  if (!name) {
    throw new ValidationError('Workspace name required');
  }

  const db = getDb();
  const [workspace] = await db.insert(schema.workspaces)
    .values({
      ownerId: req.userId!,
      name,
      description: description || null,
      isDefault: false
    })
    .returning({
      id: schema.workspaces.id,
      name: schema.workspaces.name,
      description: schema.workspaces.description,
      isDefault: schema.workspaces.isDefault,
      createdAt: schema.workspaces.createdAt
    });

  // Create default files
  await db.insert(schema.workspaceFiles).values([
    { workspaceId: workspace.id, filename: 'SOUL.md', content: getDefaultSoulMd() },
    { workspaceId: workspace.id, filename: 'MEMORY.md', content: '' },
    { workspaceId: workspace.id, filename: 'AGENTS.md', content: '' }
  ]);

  res.json(workspace);
}));

// ============================================
// GET WORKSPACE
// ============================================
router.get('/:workspaceId', requireWorkspaceAccess, asyncHandler(async (req: Request, res: Response) => {
  const workspace = req.workspace!;
  const db = getDb();

  // Get members
  const members = await db.select({
    id: schema.users.id,
    email: schema.users.email,
    displayName: schema.users.displayName,
    role: schema.workspaceMembers.role,
    joinedAt: schema.workspaceMembers.joinedAt
  })
    .from(schema.workspaceMembers)
    .innerJoin(schema.users, eq(schema.workspaceMembers.userId, schema.users.id))
    .where(eq(schema.workspaceMembers.workspaceId, workspace.id));

  // Add owner
  const owner = await db.select({
    id: schema.users.id,
    email: schema.users.email,
    displayName: schema.users.displayName
  })
    .from(schema.users)
    .where(eq(schema.users.id, workspace.ownerId));

  res.json({
    ...workspace,
    role: req.isWorkspaceOwner ? 'owner' : req.workspaceRole,
    members: [
      { ...owner[0], role: 'owner' as const },
      ...members
    ]
  });
}));

// ============================================
// UPDATE WORKSPACE
// ============================================
router.patch('/:workspaceId', requireWorkspaceAccess, requireWorkspaceOwner, asyncHandler(async (req: Request, res: Response) => {
  const workspaceId = req.params.workspaceId as string;
  const { name, description } = req.body as UpdateWorkspaceBody;
  const db = getDb();

  const [updated] = await db.update(schema.workspaces)
    .set({ name, description, updatedAt: new Date() })
    .where(eq(schema.workspaces.id, workspaceId))
    .returning({
      id: schema.workspaces.id,
      name: schema.workspaces.name,
      description: schema.workspaces.description
    });

  res.json(updated);
}));

// ============================================
// DELETE WORKSPACE
// ============================================
router.delete('/:workspaceId', requireWorkspaceAccess, requireWorkspaceOwner, asyncHandler(async (req: Request, res: Response) => {
  const workspaceId = req.params.workspaceId as string;
  const db = getDb();
  await db.delete(schema.workspaces)
    .where(eq(schema.workspaces.id, workspaceId));
  
  res.json({ success: true });
}));

// ============================================
// WORKSPACE FILES
// ============================================

router.get('/:workspaceId/files', requireWorkspaceAccess, asyncHandler(async (req: Request, res: Response) => {
  const workspaceId = req.params.workspaceId as string;
  const db = getDb();
  const files = await db.select({
    filename: schema.workspaceFiles.filename,
    updatedAt: schema.workspaceFiles.updatedAt
  })
    .from(schema.workspaceFiles)
    .where(eq(schema.workspaceFiles.workspaceId, workspaceId));

  res.json({ files });
}));

router.get('/:workspaceId/files/:filename', requireWorkspaceAccess, asyncHandler(async (req: Request, res: Response) => {
  const workspaceId = req.params.workspaceId as string;
  const filename = req.params.filename as string;
  const db = getDb();
  const [file] = await db.select()
    .from(schema.workspaceFiles)
    .where(and(
      eq(schema.workspaceFiles.workspaceId, workspaceId),
      eq(schema.workspaceFiles.filename, filename)
    ));

  if (!file) {
    throw new NotFoundError('File');
  }

  res.json(file);
}));

router.put('/:workspaceId/files/:filename', requireWorkspaceAccess, requireWorkspaceWriteAccess, asyncHandler(async (req: Request, res: Response) => {
  const workspaceId = req.params.workspaceId as string;
  const filename = req.params.filename as string;
  const { content } = req.body as UpdateFileBody;
  const db = getDb();

  const [existing] = await db.select()
    .from(schema.workspaceFiles)
    .where(and(
      eq(schema.workspaceFiles.workspaceId, workspaceId),
      eq(schema.workspaceFiles.filename, filename)
    ));

  if (existing) {
    const [updated] = await db.update(schema.workspaceFiles)
      .set({ content, updatedAt: new Date() })
      .where(eq(schema.workspaceFiles.id, existing.id))
      .returning({
        id: schema.workspaceFiles.id,
        filename: schema.workspaceFiles.filename,
        updatedAt: schema.workspaceFiles.updatedAt
      });
    res.json(updated);
  } else {
    const [created] = await db.insert(schema.workspaceFiles)
      .values({
        workspaceId,
        filename,
        content
      })
      .returning({
        id: schema.workspaceFiles.id,
        filename: schema.workspaceFiles.filename,
        updatedAt: schema.workspaceFiles.updatedAt
      });
    res.json(created);
  }
}));

// ============================================
// INVITE MEMBERS
// ============================================
router.post('/:workspaceId/invite', requireWorkspaceAccess, asyncHandler(async (req: Request, res: Response) => {
  if (!req.isWorkspaceOwner && req.workspaceRole !== 'admin') {
    throw new ForbiddenError('Only owner or admin can invite');
  }

  const workspaceId = req.params.workspaceId as string;
  const { email, role = 'member' } = req.body as InviteBody;
  
  if (!['member', 'admin', 'viewer'].includes(role)) {
    throw new ValidationError('Invalid role');
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const db = getDb();
  const [invite] = await db.insert(schema.workspaceInvites)
    .values({
      workspaceId,
      inviterId: req.userId!,
      inviteeEmail: email.toLowerCase(),
      role,
      token,
      expiresAt
    })
    .returning({
      id: schema.workspaceInvites.id,
      token: schema.workspaceInvites.token,
      expiresAt: schema.workspaceInvites.expiresAt
    });

  res.json({
    inviteId: invite.id,
    inviteToken: invite.token,
    expiresAt: invite.expiresAt
    // In production, send email here
  });
}));

// ============================================
// REMOVE MEMBER
// ============================================
router.delete('/:workspaceId/members/:memberId', requireWorkspaceAccess, asyncHandler(async (req: Request, res: Response) => {
  if (!req.isWorkspaceOwner && req.workspaceRole !== 'admin') {
    throw new ForbiddenError('Only owner or admin can remove members');
  }

  const workspaceId = req.params.workspaceId as string;
  const memberId = req.params.memberId as string;
  const db = getDb();
  await db.delete(schema.workspaceMembers)
    .where(and(
      eq(schema.workspaceMembers.workspaceId, workspaceId),
      eq(schema.workspaceMembers.userId, memberId)
    ));
  
  res.json({ success: true });
}));

export default router;
