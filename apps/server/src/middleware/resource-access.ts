/**
 * Resource Access Middleware
 *
 * Reusable middleware for loading and authorizing access to resources
 * (chats, workspaces, etc.)
 *
 * This centralizes the repeated pattern of:
 * 1. Load resource from DB
 * 2. Check if it exists
 * 3. Check if user has access
 * 4. Attach to req for downstream handlers
 */

import type { Request, Response, NextFunction } from "express";
import { eq, and } from "drizzle-orm";
import { getDb } from "../db/index.js";
import * as schema from "../db/schema.js";
import { NotFoundError, ForbiddenError, ValidationError } from "./errors.js";

// ============================================
// Type Extensions
// ============================================
// Note: Types are already declared in auth/types.ts
// Re-declaring here for documentation purposes

declare global {
  namespace Express {
    interface Request {
      // Loaded resources
      chat?: typeof schema.chats.$inferSelect;
      // workspaceRole is already declared in auth/types.ts
    }
  }
}

// ============================================
// Workspace Middleware
// ============================================

/**
 * Load workspace by ID from params or body
 * Attaches workspace to req.workspace
 */
export async function loadWorkspace(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const workspaceId = req.params.workspaceId || req.body.workspaceId;

  if (!workspaceId) {
    throw new ValidationError("Workspace ID required");
  }

  const db = getDb();
  const [workspace] = await db
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspaceId));

  if (!workspace) {
    throw new NotFoundError("Workspace");
  }

  req.workspace = workspace;
  next();
}

/**
 * Require workspace access (owner or member)
 * Must be used after requireAuth
 */
export async function requireWorkspaceAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const workspaceId = req.params.workspaceId || req.body.workspaceId;

  if (!workspaceId) {
    throw new ValidationError("Workspace ID required");
  }

  const db = getDb();

  // Load workspace
  const [workspace] = await db
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspaceId));

  if (!workspace) {
    throw new NotFoundError("Workspace");
  }

  req.workspace = workspace;

  // Check if owner
  if (workspace.ownerId === req.userId) {
    req.isWorkspaceOwner = true;
    next();
    return;
  }

  // Check membership
  const [membership] = await db
    .select()
    .from(schema.workspaceMembers)
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, workspaceId),
        eq(schema.workspaceMembers.userId, req.userId!),
      ),
    );

  if (!membership) {
    throw new ForbiddenError("Access denied to this workspace");
  }

  req.workspaceRole = membership.role as "admin" | "member" | "viewer";
  next();
}

/**
 * Require workspace write access (owner, admin, or member - not viewer)
 */
export function requireWorkspaceWriteAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.isWorkspaceOwner) {
    next();
    return;
  }

  if (req.workspaceRole === "viewer") {
    throw new ForbiddenError("Viewers cannot perform this action");
  }

  next();
}

/**
 * Require workspace owner role
 */
export function requireWorkspaceOwner(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.isWorkspaceOwner) {
    throw new ForbiddenError("Only workspace owner can perform this action");
  }
  next();
}

// ============================================
// Chat Middleware
// ============================================

/**
 * Load chat by ID from params
 * Attaches chat and workspace to req
 */
export async function loadChat(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const chatId = req.params.chatId;

  if (!chatId || Array.isArray(chatId)) {
    throw new ValidationError("Chat ID required");
  }

  const db = getDb();
  const [chat] = await db
    .select()
    .from(schema.chats)
    .where(eq(schema.chats.id, chatId));

  if (!chat) {
    throw new NotFoundError("Chat");
  }

  req.chat = chat;
  next();
}

/**
 * Require access to the chat's workspace
 * Must be used after loadChat
 */
export async function requireChatAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const chat = req.chat!;
  const db = getDb();

  // Load workspace if not already loaded
  if (!req.workspace || req.workspace.id !== chat.workspaceId) {
    const [workspace] = await db
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, chat.workspaceId));

    if (!workspace) {
      throw new NotFoundError("Workspace");
    }
    req.workspace = workspace;
  }

  const workspace = req.workspace;

  // Check if owner
  if (workspace.ownerId === req.userId) {
    req.isWorkspaceOwner = true;
    next();
    return;
  }

  // Check membership
  const [membership] = await db
    .select()
    .from(schema.workspaceMembers)
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, workspace.id),
        eq(schema.workspaceMembers.userId, req.userId!),
      ),
    );

  if (!membership) {
    throw new ForbiddenError("Access denied to this chat");
  }

  req.workspaceRole = membership.role as "admin" | "member" | "viewer";
  next();
}

/**
 * Require write access to chat (owner, admin, member - not viewer)
 */
export function requireChatWriteAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.isWorkspaceOwner) {
    next();
    return;
  }

  if (req.workspaceRole === "viewer") {
    throw new ForbiddenError("Viewers cannot modify chats");
  }

  next();
}

// ============================================
// Composite Middleware Chains
// ============================================

/**
 * Full chat access chain: load + verify membership
 * Usage: router.get('/:chatId', requireChat, ...)
 */
export const requireChat = [loadChat, requireChatAccess];

/**
 * Full chat write access chain
 * Usage: router.delete('/:chatId', requireChatWrite, ...)
 */
export const requireChatWrite = [
  loadChat,
  requireChatAccess,
  requireChatWriteAccess,
];
