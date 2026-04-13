import { Router, Request, Response } from "express";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";
import { requireAuth } from "../auth/index.js";
import { getDb } from "../db/index.js";
import * as schema from "../db/schema.js";
import {
  ValidationError,
  ForbiddenError,
  asyncHandler,
  requireWorkspaceAccess,
  requireWorkspaceWriteAccess,
  requireWorkspaceOwner,
} from "../middleware/index.js";

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

interface InviteBody {
  email: string;
  role?: "member" | "admin" | "viewer";
}

// ============================================
// LIST WORKSPACES
// ============================================
router.get(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const db = getDb();

    // Get workspaces owned by user
    const owned = await db
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.ownerId, req.userId!));

    // Add role to owned workspaces
    const ownedWithRole = owned.map((w) => ({ ...w, role: "owner" as const }));

    // Get workspaces where user is a member
    const memberships = await db
      .select()
      .from(schema.workspaceMembers)
      .where(eq(schema.workspaceMembers.userId, req.userId!));

    // Get workspace details for memberships
    const memberWorkspaceIds = memberships.map((m) => m.workspaceId);
    let memberWorkspaces: (typeof schema.workspaces.$inferSelect & {
      role: string;
    })[] = [];

    if (memberWorkspaceIds.length > 0) {
      const { inArray } = await import("drizzle-orm");
      const workspaces = await db
        .select()
        .from(schema.workspaces)
        .where(inArray(schema.workspaces.id, memberWorkspaceIds));

      // Add role from membership
      memberWorkspaces = workspaces.map((w) => {
        const membership = memberships.find((m) => m.workspaceId === w.id);
        return { ...w, role: membership?.role || "member" };
      });
    }

    res.json({ workspaces: [...ownedWithRole, ...memberWorkspaces] });
  }),
);

// ============================================
// CREATE WORKSPACE
// ============================================
router.post(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const { name, description } = req.body as CreateWorkspaceBody;

    if (!name) {
      throw new ValidationError("Workspace name required");
    }

    const db = getDb();
    const [workspace] = await db
      .insert(schema.workspaces)
      .values({
        ownerId: req.userId!,
        name,
        description: description || null,
        isDefault: false,
      })
      .returning({
        id: schema.workspaces.id,
        name: schema.workspaces.name,
        description: schema.workspaces.description,
        isDefault: schema.workspaces.isDefault,
        createdAt: schema.workspaces.createdAt,
      });

    res.json(workspace);
  }),
);

// ============================================
// GET WORKSPACE
// ============================================
router.get(
  "/:workspaceId",
  requireWorkspaceAccess,
  asyncHandler(async (req: Request, res: Response) => {
    const workspace = req.workspace!;
    const db = getDb();

    // Get members
    const members = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        displayName: schema.users.displayName,
        role: schema.workspaceMembers.role,
        joinedAt: schema.workspaceMembers.joinedAt,
      })
      .from(schema.workspaceMembers)
      .innerJoin(
        schema.users,
        eq(schema.workspaceMembers.userId, schema.users.id),
      )
      .where(eq(schema.workspaceMembers.workspaceId, workspace.id));

    // Add owner
    const owner = await db
      .select({
        id: schema.users.id,
        email: schema.users.email,
        displayName: schema.users.displayName,
      })
      .from(schema.users)
      .where(eq(schema.users.id, workspace.ownerId));

    res.json({
      ...workspace,
      role: req.isWorkspaceOwner ? "owner" : req.workspaceRole,
      members: [{ ...owner[0], role: "owner" as const }, ...members],
    });
  }),
);

// ============================================
// UPDATE WORKSPACE
// ============================================
router.patch(
  "/:workspaceId",
  requireWorkspaceAccess,
  requireWorkspaceOwner,
  asyncHandler(async (req: Request, res: Response) => {
    const workspaceId = req.params.workspaceId as string;
    const { name, description } = req.body as UpdateWorkspaceBody;
    const db = getDb();

    const [updated] = await db
      .update(schema.workspaces)
      .set({ name, description, updatedAt: new Date() })
      .where(eq(schema.workspaces.id, workspaceId))
      .returning({
        id: schema.workspaces.id,
        name: schema.workspaces.name,
        description: schema.workspaces.description,
      });

    res.json(updated);
  }),
);

// ============================================
// DELETE WORKSPACE
// ============================================
router.delete(
  "/:workspaceId",
  requireWorkspaceAccess,
  requireWorkspaceOwner,
  asyncHandler(async (req: Request, res: Response) => {
    const workspaceId = req.params.workspaceId as string;
    const db = getDb();
    await db
      .delete(schema.workspaces)
      .where(eq(schema.workspaces.id, workspaceId));

    res.json({ success: true });
  }),
);

// ============================================
// INVITE MEMBERS
// ============================================
router.post(
  "/:workspaceId/invite",
  requireWorkspaceAccess,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.isWorkspaceOwner && req.workspaceRole !== "admin") {
      throw new ForbiddenError("Only owner or admin can invite");
    }

    const workspaceId = req.params.workspaceId as string;
    const { email, role = "member" } = req.body as InviteBody;

    if (!["member", "admin", "viewer"].includes(role)) {
      throw new ValidationError("Invalid role");
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const db = getDb();
    const [invite] = await db
      .insert(schema.workspaceInvites)
      .values({
        workspaceId,
        inviterId: req.userId!,
        inviteeEmail: email.toLowerCase(),
        role,
        token,
        expiresAt,
      })
      .returning({
        id: schema.workspaceInvites.id,
        token: schema.workspaceInvites.token,
        expiresAt: schema.workspaceInvites.expiresAt,
      });

    res.json({
      inviteId: invite.id,
      inviteToken: invite.token,
      expiresAt: invite.expiresAt,
      // In production, send email here
    });
  }),
);

// ============================================
// REMOVE MEMBER
// ============================================
router.delete(
  "/:workspaceId/members/:memberId",
  requireWorkspaceAccess,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.isWorkspaceOwner && req.workspaceRole !== "admin") {
      throw new ForbiddenError("Only owner or admin can remove members");
    }

    const workspaceId = req.params.workspaceId as string;
    const memberId = req.params.memberId as string;
    const db = getDb();
    await db
      .delete(schema.workspaceMembers)
      .where(
        and(
          eq(schema.workspaceMembers.workspaceId, workspaceId),
          eq(schema.workspaceMembers.userId, memberId),
        ),
      );

    res.json({ success: true });
  }),
);

export default router;
