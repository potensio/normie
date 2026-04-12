/**
 * Chat Service
 *
 * Handles all chat operations including message processing with Pi Agent.
 */

import { eq, desc, and } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
} from "../middleware/index.js";
import { resolveCredentials } from "../pi/credentials.js";
import { generateConversationTitle } from "./title-generator.js";

export type DbClient = NodePgDatabase<typeof schema>;

// ============================================
// Types
// ============================================

export interface CreateChatInput {
  title?: string;
  provider: string;
  model: string;
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
  role: "user" | "assistant";
  content: string;
  parentId?: string;
}

export interface SendMessageInput {
  chatId: string;
  message: string;
  provider: string;
  model: string;
  workspaceId: string;
  userId: string;
  attachments?: Array<{ path: string }>;
}

// ============================================
// Chat CRUD
// ============================================

export async function getWorkspaceChats(
  db: DbClient,
  workspaceId: string,
): Promise<Array<typeof schema.chats.$inferSelect>> {
  return db
    .select()
    .from(schema.chats)
    .where(eq(schema.chats.workspaceId, workspaceId))
    .orderBy(desc(schema.chats.updatedAt));
}

export async function getChatById(
  db: DbClient,
  chatId: string,
): Promise<typeof schema.chats.$inferSelect> {
  const [chat] = await db
    .select()
    .from(schema.chats)
    .where(eq(schema.chats.id, chatId));

  if (!chat) {
    throw new NotFoundError("Chat");
  }

  return chat;
}

export async function getChatWithMessages(
  db: DbClient,
  chatId: string,
): Promise<{
  chat: typeof schema.chats.$inferSelect;
  messages: Array<typeof schema.messages.$inferSelect>;
}> {
  const chat = await getChatById(db, chatId);

  const messages = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.chatId, chatId))
    .orderBy(schema.messages.createdAt);

  return { chat, messages };
}

export async function createChat(
  db: DbClient,
  workspaceId: string,
  userId: string,
  input: CreateChatInput,
  chatId?: string,
): Promise<typeof schema.chats.$inferSelect> {
  const [chat] = await db
    .insert(schema.chats)
    .values({
      id: chatId,
      workspaceId,
      userId,
      title: input.title || "New Chat",
      provider: input.provider,
      model: input.model,
    })
    .returning();

  return chat;
}

export async function updateChat(
  db: DbClient,
  chatId: string,
  input: UpdateChatInput,
): Promise<typeof schema.chats.$inferSelect> {
  const [chat] = await db
    .update(schema.chats)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(schema.chats.id, chatId))
    .returning();

  if (!chat) {
    throw new NotFoundError("Chat");
  }

  return chat;
}

export async function switchChatModel(
  db: DbClient,
  chatId: string,
  input: SwitchModelInput,
): Promise<typeof schema.chats.$inferSelect> {
  const [chat] = await db
    .update(schema.chats)
    .set({
      provider: input.provider,
      model: input.model,
      updatedAt: new Date(),
    })
    .where(eq(schema.chats.id, chatId))
    .returning();

  if (!chat) {
    throw new NotFoundError("Chat");
  }

  return chat;
}

export async function deleteChat(db: DbClient, chatId: string): Promise<void> {
  await db.delete(schema.chats).where(eq(schema.chats.id, chatId));
}

export async function updateChatTitle(
  db: DbClient,
  chatId: string,
  title: string,
): Promise<void> {
  await db
    .update(schema.chats)
    .set({ title, updatedAt: new Date() })
    .where(eq(schema.chats.id, chatId));
}

// ============================================
// Messages
// ============================================

export async function addMessage(
  db: DbClient,
  chatId: string,
  input: AddMessageInput,
): Promise<typeof schema.messages.$inferSelect> {
  const values: any = {
    chatId,
    role: input.role,
    content: input.content,
  };

  if (input.parentId) {
    values.parentId = input.parentId;
  }

  const [message] = await db.insert(schema.messages).values(values).returning();

  return message;
}

export async function addUserMessage(
  db: DbClient,
  chatId: string,
  content: string,
): Promise<typeof schema.messages.$inferSelect> {
  return addMessage(db, chatId, { role: "user", content });
}

export async function addAssistantMessage(
  db: DbClient,
  chatId: string,
  content: string,
): Promise<typeof schema.messages.$inferSelect> {
  return addMessage(db, chatId, { role: "assistant", content });
}

export async function getChatMessageCount(
  db: DbClient,
  chatId: string,
): Promise<number> {
  const messages = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.chatId, chatId));

  return messages.length;
}

export async function updateMessageMetadata(
  db: DbClient,
  messageId: string,
  metadata: Record<string, unknown>,
): Promise<typeof schema.messages.$inferSelect> {
  const [message] = await db
    .update(schema.messages)
    .set({ metadata })
    .where(eq(schema.messages.id, messageId))
    .returning();

  if (!message) {
    throw new NotFoundError("Message");
  }

  return message;
}

// ============================================
// Access Control
// ============================================

export async function verifyChatAccess(
  db: DbClient,
  chatId: string,
  userId: string,
): Promise<{
  chat: typeof schema.chats.$inferSelect;
  workspace: typeof schema.workspaces.$inferSelect;
}> {
  const chat = await getChatById(db, chatId);

  const [workspace] = await db
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, chat.workspaceId));

  if (!workspace) {
    throw new NotFoundError("Workspace");
  }

  if (workspace.ownerId === userId) {
    return { chat, workspace };
  }

  const [membership] = await db
    .select()
    .from(schema.workspaceMembers)
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, chat.workspaceId),
        eq(schema.workspaceMembers.userId, userId),
      ),
    );

  if (!membership) {
    throw new ForbiddenError("Access denied");
  }

  return { chat, workspace };
}

export async function verifyChatWriteAccess(
  db: DbClient,
  chatId: string,
  userId: string,
): Promise<{
  chat: typeof schema.chats.$inferSelect;
  workspace: typeof schema.workspaces.$inferSelect;
}> {
  const { chat, workspace } = await verifyChatAccess(db, chatId, userId);

  if (workspace.ownerId === userId) {
    return { chat, workspace };
  }

  const [membership] = await db
    .select()
    .from(schema.workspaceMembers)
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, chat.workspaceId),
        eq(schema.workspaceMembers.userId, userId),
      ),
    );

  if (membership?.role === "viewer") {
    throw new ForbiddenError("Viewers cannot modify chats");
  }

  return { chat, workspace };
}

// ============================================
// Branching
// ============================================

export async function createBranch(
  db: DbClient,
  chatId: string,
  userId: string,
  input: CreateBranchInput,
): Promise<typeof schema.chats.$inferSelect> {
  const chat = await getChatById(db, chatId);

  const branchChat = await createChat(db, chat.workspaceId, userId, {
    title: input.title || `${chat.title} (branch)`,
    provider: chat.provider,
    model: chat.model || "default",
  });

  return branchChat;
}

export async function getChatTree(
  db: DbClient,
  chatId: string,
): Promise<unknown> {
  const messages = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.chatId, chatId))
    .orderBy(schema.messages.createdAt);

  return messages;
}

// ============================================
