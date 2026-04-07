/**
 * Chat Routes
 * 
 * Thin HTTP layer that delegates to chat service.
 * All business logic is in services/chat.service.ts
 */

import { Router, Request, Response } from 'express';
import { eq, desc } from 'drizzle-orm';
import { requireAuth, requireWorkspaceAccess } from '../auth/index.js';
import { getDb } from '../db/index.js';
import * as schema from '../db/schema.js';
import {
  ValidationError,
  ForbiddenError,
  NotFoundError,
  asyncHandler,
  requireChat,
  requireChatWrite
} from '../middleware/index.js';
import {
  getWorkspaceChats,
  getChatWithMessages,
  createChat,
  updateChat,
  switchChatModel,
  deleteChat,
  addMessage,
  createBranch,
  getChatTree,
  verifyChatAccess,
  verifyChatWriteAccess,
  updateMessageMetadata,
  type CreateChatInput,
  type UpdateChatInput,
  type SwitchModelInput,
  type CreateBranchInput,
  type AddMessageInput
} from '../services/chat.service.js';
import {
  streamChatWithRequest
} from '../services/chat-stream.service.js';
import { getValidatedModel } from '../pi/index.js';

const router = Router();

router.use(requireAuth);

/**
 * Helper to get string param (handles string[] case)
 */
function getStringParam(value: string | string[] | undefined): string {
  if (!value) return '';
  if (Array.isArray(value)) return value[0] || '';
  return value;
}

// ============================================
// LIST CHATS
// ============================================
router.get('/workspace/:workspaceId', requireWorkspaceAccess, asyncHandler(async (req: Request, res: Response) => {
  const chats = await getWorkspaceChats(getDb(), getStringParam(req.params.workspaceId));
  res.json({ chats });
}));

// ============================================
// CREATE CHAT
// ============================================
router.post('/workspace/:workspaceId', requireWorkspaceAccess, asyncHandler(async (req: Request, res: Response) => {
  if (req.workspaceRole === 'viewer') {
    throw new ForbiddenError('Viewers cannot create chats');
  }

  const input: CreateChatInput = {
    title: req.body.title,
    provider: req.body.provider,
    model: req.body.model
  };

  const chat = await createChat(getDb(), getStringParam(req.params.workspaceId), req.userId!, input);
  res.json(chat);
}));

// ============================================
// GET CHAT WITH MESSAGES
// ============================================
router.get('/:chatId', asyncHandler(async (req: Request, res: Response) => {
  const chatId = getStringParam(req.params.chatId);
  const { chat, messages } = await getChatWithMessages(getDb(), chatId);
  
  // Verify access
  await verifyChatAccess(getDb(), chatId, req.userId!);
  
  res.json({ ...chat, messages });
}));

// ============================================
// UPDATE CHAT
// ============================================
router.patch('/:chatId', asyncHandler(async (req: Request, res: Response) => {
  const chatId = getStringParam(req.params.chatId);
  const { chat } = await verifyChatWriteAccess(getDb(), chatId, req.userId!);

  const input: UpdateChatInput = {
    title: req.body.title,
    model: req.body.model
  };

  const updated = await updateChat(getDb(), chat.id, input);
  res.json(updated);
}));

// ============================================
// SWITCH MODEL
// ============================================
router.patch('/:chatId/model', asyncHandler(async (req: Request, res: Response) => {
  const chatId = getStringParam(req.params.chatId);
  const input: SwitchModelInput = req.body;

  if (!input.provider || !input.model) {
    throw new ValidationError('Provider and model are required');
  }

  // Validate provider/model
  const validatedModel = getValidatedModel(input.provider, input.model);
  if (!validatedModel) {
    throw new ValidationError(`Invalid provider/model: ${input.provider}/${input.model}`);
  }

  const { chat } = await verifyChatWriteAccess(getDb(), chatId, req.userId!);
  const updated = await switchChatModel(getDb(), chat.id, input);
  res.json(updated);
}));

// ============================================
// CREATE BRANCH
// ============================================
router.post('/:chatId/branch', asyncHandler(async (req: Request, res: Response) => {
  const chatId = getStringParam(req.params.chatId);
  const { chat } = await verifyChatAccess(getDb(), chatId, req.userId!);

  const input: CreateBranchInput = {
    branchFromMessageId: req.body.branchFromMessageId,
    title: req.body.title
  };

  if (!input.branchFromMessageId) {
    throw new ValidationError('branchFromMessageId is required');
  }

  // Create branch session via Pi Agent
  const { NormieSessionManager } = await import('../pi/index.js');
  const branchSession = await NormieSessionManager.createBranch(
    { workspaceId: chat.workspaceId, chatId: chat.id },
    input.branchFromMessageId
  );

  const branchChat = await createBranch(getDb(), chat.id, req.userId!, input);
  
  res.json(branchChat);
}));

// ============================================
// GET CONVERSATION TREE
// ============================================
router.get('/:chatId/tree', asyncHandler(async (req: Request, res: Response) => {
  const chatId = getStringParam(req.params.chatId);
  await verifyChatAccess(getDb(), chatId, req.userId!);
  
  const tree = await getChatTree(getDb(), chatId);
  res.json({ root: tree });
}));

// ============================================
// DELETE CHAT
// ============================================
router.delete('/:chatId', asyncHandler(async (req: Request, res: Response) => {
  const chatId = getStringParam(req.params.chatId);
  await verifyChatWriteAccess(getDb(), chatId, req.userId!);
  
  await deleteChat(getDb(), chatId);
  res.json({ success: true });
}));

// ============================================
// ADD MESSAGE
// ============================================
router.post('/:chatId/messages', asyncHandler(async (req: Request, res: Response) => {
  const chatId = getStringParam(req.params.chatId);
  const input: AddMessageInput = req.body;

  if (!input.role || !input.content) {
    throw new ValidationError('Role and content required');
  }

  const { chat } = await verifyChatWriteAccess(getDb(), chatId, req.userId!);

  const message = await addMessage(getDb(), chat.id, input);
  res.json(message);
}));

// ============================================
// STREAM CHAT
// ============================================
router.post('/:chatId/stream', asyncHandler(async (req: Request, res: Response) => {
  const chatId = getStringParam(req.params.chatId);
  const { message, provider, model, workspaceId, attachments } = req.body;

  console.log('[STREAM] Request:', { chatId, provider, model, messagePreview: message?.substring(0, 50), hasAttachments: !!attachments?.length });

  // Validate required fields
  if (!message || !provider || !model) {
    throw new ValidationError('message, provider, and model are required');
  }

  if (!workspaceId) {
    throw new ValidationError('workspaceId is required for new chats');
  }

  // Stream the chat
  await streamChatWithRequest(getDb(), {
    chatId,
    message,
    provider,
    model,
    workspaceId,
    userId: req.userId!,
    attachments
  }, req, res);
}));

// ============================================
// UPDATE MESSAGE METADATA (for blocks persistence)
// ============================================
router.patch('/messages/:messageId/metadata', asyncHandler(async (req: Request, res: Response) => {
  const messageId = getStringParam(req.params.messageId);
  const { blocks } = req.body;

  // Verify message exists and user has access
  const [message] = await getDb().select()
    .from(schema.messages)
    .where(eq(schema.messages.id, messageId));

  if (!message) {
    throw new NotFoundError('Message');
  }

  // Verify chat access
  await verifyChatAccess(getDb(), message.chatId, req.userId!);

  // Update metadata with blocks
  const updated = await updateMessageMetadata(getDb(), messageId, { blocks });

  res.json(updated);
}));

export default router;