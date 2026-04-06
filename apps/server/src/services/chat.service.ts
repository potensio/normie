/**
 * Chat Service
 * 
 * Business logic for chat operations.
 * All functions receive db client as parameter for testability.
 */

import { eq, and, desc, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../middleware/index.js';

// ============================================
// Types
// ============================================

export type DbClient = NodePgDatabase<typeof schema>;

export interface CreateChatInput {
  title?: string;
  provider?: string;
  model?: string;
}

export interface UpdateChatInput {
  title?: string;
  model?: string;
}

export interface SwitchModelInput {
  provider: string;
  model: string;
}

export interface CreateBranchInput {
  branchFromMessageId: string;
  title?: string;
}

export interface AddMessageInput {
  role: 'user' | 'assistant';
  content: string;
  metadata?: Record<string, unknown>;
}

// ============================================
// Chat CRUD
// ============================================

/**
 * Get all chats for a workspace
 */
export async function getWorkspaceChats(
  db: DbClient,
  workspaceId: string
): Promise<(typeof schema.chats.$inferSelect)[]> {
  const chats = await db.select()
    .from(schema.chats)
    .where(eq(schema.chats.workspaceId, workspaceId))
    .orderBy(desc(schema.chats.updatedAt));

  return chats;
}

/**
 * Get a single chat by ID (without messages)
 */
export async function getChatById(
  db: DbClient,
  chatId: string
): Promise<typeof schema.chats.$inferSelect> {
  const [chat] = await db.select()
    .from(schema.chats)
    .where(eq(schema.chats.id, chatId));

  if (!chat) {
    throw new NotFoundError('Chat');
  }

  return chat;
}

/**
 * Get a chat with all messages
 */
export async function getChatWithMessages(
  db: DbClient,
  chatId: string
): Promise<{
  chat: typeof schema.chats.$inferSelect;
  messages: typeof schema.messages.$inferSelect[];
}> {
  const chat = await getChatById(db, chatId);

  const messages = await db.select()
    .from(schema.messages)
    .where(eq(schema.messages.chatId, chat.id))
    .orderBy(schema.messages.createdAt);

  return { chat, messages };
}

/**
 * Create a new chat
 */
export async function createChat(
  db: DbClient,
  workspaceId: string,
  userId: string,
  input: CreateChatInput = {},
  id?: string
): Promise<typeof schema.chats.$inferSelect> {
  const [chat] = await db.insert(schema.chats)
    .values({
      id,
      workspaceId,
      userId,
      title: input.title || 'New Chat',
      provider: input.provider || 'claude',
      model: input.model || null
    })
    .returning();

  return chat;
}

/**
 * Update chat properties
 */
export async function updateChat(
  db: DbClient,
  chatId: string,
  input: UpdateChatInput
): Promise<typeof schema.chats.$inferSelect> {
  const [updated] = await db.update(schema.chats)
    .set({
      ...input,
      updatedAt: new Date()
    })
    .where(eq(schema.chats.id, chatId))
    .returning();

  if (!updated) {
    throw new NotFoundError('Chat');
  }

  return updated;
}

/**
 * Switch chat to a different model
 */
export async function switchChatModel(
  db: DbClient,
  chatId: string,
  input: SwitchModelInput
): Promise<typeof schema.chats.$inferSelect> {
  if (!input.provider || !input.model) {
    throw new ValidationError('Provider and model are required');
  }

  const [updated] = await db.update(schema.chats)
    .set({
      provider: input.provider,
      model: input.model,
      updatedAt: new Date()
    })
    .where(eq(schema.chats.id, chatId))
    .returning();

  if (!updated) {
    throw new NotFoundError('Chat');
  }

  return updated;
}

/**
 * Delete a chat
 */
export async function deleteChat(
  db: DbClient,
  chatId: string
): Promise<void> {
  const result = await db.delete(schema.chats)
    .where(eq(schema.chats.id, chatId))
    .returning({ id: schema.chats.id });

  if (result.length === 0) {
    throw new NotFoundError('Chat');
  }
}

/**
 * Update chat session file path (for Pi Agent)
 */
export async function updateChatSession(
  db: DbClient,
  chatId: string,
  sessionFilePath: string
): Promise<void> {
  await db.update(schema.chats)
    .set({
      sessionFilePath,
      updatedAt: new Date()
    })
    .where(eq(schema.chats.id, chatId));
}

/**
 * Update chat title
 */
export async function updateChatTitle(
  db: DbClient,
  chatId: string,
  title: string
): Promise<void> {
  await db.update(schema.chats)
    .set({
      title,
      updatedAt: new Date()
    })
    .where(eq(schema.chats.id, chatId));
}

// ============================================
// Messages
// ============================================

/**
 * Get messages for a chat
 */
export async function getChatMessages(
  db: DbClient,
  chatId: string
): Promise<typeof schema.messages.$inferSelect[]> {
  const messages = await db.select()
    .from(schema.messages)
    .where(eq(schema.messages.chatId, chatId))
    .orderBy(schema.messages.createdAt);

  return messages;
}

/**
 * Add a message to a chat
 */
export async function addMessage(
  db: DbClient,
  chatId: string,
  input: AddMessageInput
): Promise<typeof schema.messages.$inferSelect> {
  const [message] = await db.insert(schema.messages)
    .values({
      chatId,
      role: input.role,
      content: input.content,
      metadata: input.metadata || {}
    })
    .returning();

  // Update chat's updatedAt
  await db.update(schema.chats)
    .set({ updatedAt: new Date() })
    .where(eq(schema.chats.id, chatId));

  return message;
}

/**
 * Add a user message
 */
export async function addUserMessage(
  db: DbClient,
  chatId: string,
  content: string
): Promise<typeof schema.messages.$inferSelect> {
  return addMessage(db, chatId, { role: 'user', content });
}

/**
 * Add an assistant message
 */
export async function addAssistantMessage(
  db: DbClient,
  chatId: string,
  content: string
): Promise<typeof schema.messages.$inferSelect> {
  return addMessage(db, chatId, { role: 'assistant', content });
}

/**
 * Update message metadata (for storing blocks)
 */
export async function updateMessageMetadata(
  db: DbClient,
  messageId: string,
  metadata: Record<string, unknown>
): Promise<typeof schema.messages.$inferSelect> {
  // Get current message to merge metadata
  const [existing] = await db.select()
    .from(schema.messages)
    .where(eq(schema.messages.id, messageId));

  if (!existing) {
    throw new NotFoundError('Message');
  }

  // Merge with existing metadata
  const mergedMetadata = {
    ...(existing.metadata || {}),
    ...metadata
  };

  const [updated] = await db.update(schema.messages)
    .set({ metadata: mergedMetadata })
    .where(eq(schema.messages.id, messageId))
    .returning();

  return updated;
}

/**
 * Get message count for a chat
 */
export async function getChatMessageCount(
  db: DbClient,
  chatId: string
): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.messages)
    .where(eq(schema.messages.chatId, chatId));

  return result?.count ?? 0;
}

// ============================================
// Branching
// ============================================

/**
 * Create a branch from a chat
 */
export async function createBranch(
  db: DbClient,
  parentChatId: string,
  userId: string,
  input: CreateBranchInput
): Promise<typeof schema.chats.$inferSelect> {
  if (!input.branchFromMessageId) {
    throw new ValidationError('branchFromMessageId is required');
  }

  // Get parent chat
  const parentChat = await getChatById(db, parentChatId);

  // Create branch chat
  const [branchChat] = await db.insert(schema.chats)
    .values({
      workspaceId: parentChat.workspaceId,
      userId,
      title: input.title || `${parentChat.title} (branch)`,
      provider: parentChat.provider,
      model: parentChat.model,
      parentChatId: parentChat.id,
      branchPointMessageId: input.branchFromMessageId
    })
    .returning();

  return branchChat;
}

/**
 * Get conversation tree (all branches)
 */
export async function getChatTree(
  db: DbClient,
  rootChatId: string
): Promise<ChatTreeNode> {
  const rootChat = await getChatById(db, rootChatId);
  return buildChatTree(db, rootChat);
}

interface ChatTreeNode {
  id: string;
  title: string | null;
  provider: string;
  model: string | null;
  branchPointMessageId: string | null;
  createdAt: Date;
  branches: ChatTreeNode[];
}

async function buildChatTree(
  db: DbClient,
  chat: typeof schema.chats.$inferSelect
): Promise<ChatTreeNode> {
  // Get child branches
  const branches = await db.select()
    .from(schema.chats)
    .where(eq(schema.chats.parentChatId, chat.id))
    .orderBy(schema.chats.createdAt);

  // Recursively build tree for each branch
  const branchTrees = await Promise.all(
    branches.map(branch => buildChatTree(db, branch))
  );

  return {
    id: chat.id,
    title: chat.title,
    provider: chat.provider,
    model: chat.model,
    branchPointMessageId: chat.branchPointMessageId,
    createdAt: chat.createdAt,
    branches: branchTrees
  };
}

// ============================================
// Authorization Helpers
// ============================================

/**
 * Verify user has access to a chat's workspace
 * Returns workspace info if authorized
 */
export async function verifyChatAccess(
  db: DbClient,
  chatId: string,
  userId: string
): Promise<{
  chat: typeof schema.chats.$inferSelect;
  workspace: typeof schema.workspaces.$inferSelect;
  isOwner: boolean;
  role: 'owner' | 'admin' | 'member' | 'viewer' | null;
}> {
  const chat = await getChatById(db, chatId);

  const [workspace] = await db.select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, chat.workspaceId));

  if (!workspace) {
    throw new NotFoundError('Workspace');
  }

  // Check if owner
  if (workspace.ownerId === userId) {
    return { chat, workspace, isOwner: true, role: 'owner' };
  }

  // Check membership
  const [membership] = await db.select()
    .from(schema.workspaceMembers)
    .where(and(
      eq(schema.workspaceMembers.workspaceId, workspace.id),
      eq(schema.workspaceMembers.userId, userId)
    ));

  if (!membership) {
    throw new ForbiddenError('Access denied to this chat');
  }

  return {
    chat,
    workspace,
    isOwner: false,
    role: membership.role as 'admin' | 'member' | 'viewer'
  };
}

/**
 * Verify user has write access to a chat
 */
export async function verifyChatWriteAccess(
  db: DbClient,
  chatId: string,
  userId: string
): Promise<{
  chat: typeof schema.chats.$inferSelect;
  workspace: typeof schema.workspaces.$inferSelect;
}> {
  const access = await verifyChatAccess(db, chatId, userId);

  if (!access.isOwner && access.role === 'viewer') {
    throw new ForbiddenError('Viewers cannot modify chats');
  }

  return { chat: access.chat, workspace: access.workspace };
}