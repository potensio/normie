/**
 * Chat Stream Service
 * 
 * Handles streaming chat logic with Pi Agent.
 * Broken into smaller functions for testability.
 */

import type { Response, Request } from 'express';
import { eq, and } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema.js';
import { NotFoundError, ForbiddenError, ValidationError } from '../middleware/index.js';
import { getValidatedModel, runPiQuery } from '../pi/index.js';
import { resolveCredentials, type ResolvedCredentials } from '../pi/credentials.js';
import { buildFullContext } from './context-builder.js';
import { generateConversationTitle } from './title-generator.js';
import {
  getChatById,
  createChat,
  addUserMessage,
  addAssistantMessage,
  getChatMessageCount,
  updateChatSession,
  updateChatTitle,
  type DbClient
} from './chat.service.js';
import type { StreamChunk } from '@normie/types';

// ============================================
// Types
// ============================================

export interface StreamParams {
  chatId: string;
  message: string;
  provider: string;
  model: string;
  workspaceId: string;
  userId: string;
}

export interface StreamContext {
  chat: typeof schema.chats.$inferSelect;
  workspaceId: string;
  isNewChat: boolean;
  initialTitle: string;
}

// ============================================
// SSE Helpers
// ============================================

/**
 * Setup SSE response headers
 */
export function setupSSEResponse(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();
}

/**
 * Send SSE event to client
 */
export function sendSSEEvent(res: Response, chunk: StreamChunk): void {
  if (!res.writableEnded) {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }
}

/**
 * Start heartbeat to keep connection alive
 */
export function startHeartbeat(res: Response): NodeJS.Timeout {
  return setInterval(() => {
    if (!res.writableEnded) {
      res.write(': heartbeat\n\n');
    }
  }, 15000);
}

/**
 * Stop heartbeat
 */
export function stopHeartbeat(interval: NodeJS.Timeout): void {
  clearInterval(interval);
}

// ============================================
// Chat Setup
// ============================================

/**
 * Get or create chat for streaming
 * Handles both existing chats and new chats from frontend
 */
export async function getOrCreateStreamChat(
  db: DbClient,
  params: StreamParams
): Promise<StreamContext> {
  const { chatId, message, provider, model, workspaceId, userId } = params;

  // Try to get existing chat
  let chat: typeof schema.chats.$inferSelect | null = null;
  let isNewChat = false;
  let initialTitle = '';

  try {
    chat = await getChatById(db, chatId);
  } catch (error) {
    // Chat doesn't exist, create new
    if (error instanceof NotFoundError) {
      isNewChat = true;
    } else {
      throw error;
    }
  }

  if (!chat) {
    // Create new chat
    console.log('[STREAM] Creating new chat:', chatId);
    
    // Generate title from first message
    initialTitle = message.length > 50 
      ? message.substring(0, 47) + '...' 
      : message;

    chat = await createChat(db, workspaceId, userId, {
      title: initialTitle,
      provider,
      model
    }, chatId);

    console.log('[STREAM] Created new chat:', chat.id, 'with title:', initialTitle);
  }

  return {
    chat,
    workspaceId: workspaceId || chat.workspaceId,
    isNewChat,
    initialTitle
  };
}

/**
 * Verify user has access to workspace for new chat creation
 */
export async function verifyWorkspaceAccess(
  db: DbClient,
  workspaceId: string,
  userId: string
): Promise<void> {
  const [workspace] = await db.select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspaceId));

  if (!workspace) {
    throw new NotFoundError('Workspace');
  }

  // Owner has access
  if (workspace.ownerId === userId) {
    return;
  }

  // Check membership
  const [membership] = await db.select()
    .from(schema.workspaceMembers)
    .where(and(
      eq(schema.workspaceMembers.workspaceId, workspaceId),
      eq(schema.workspaceMembers.userId, userId)
    ));

  if (!membership) {
    throw new ForbiddenError('Access denied to workspace');
  }

  // Viewers cannot create chats
  if (membership.role === 'viewer') {
    throw new ForbiddenError('Viewers cannot create chats');
  }
}

// ============================================
// Credentials & Context
// ============================================

/**
 * Resolve credentials for provider
 */
export async function resolveProviderCredentials(
  userId: string,
  provider: string
): Promise<ResolvedCredentials> {
  const credentials = await resolveCredentials(userId, provider);
  
  console.log(`[STREAM] Credentials source: ${credentials.source}`);
  
  if (!credentials.configured && provider !== 'amazon-bedrock') {
    throw new ValidationError(credentials.error || `No API key configured for ${provider}`);
  }

  return credentials;
}

/**
 * Build context for AI query
 */
export async function buildStreamContext(
  db: DbClient,
  workspaceId: string,
  chatId: string,
  message: string
): Promise<{
  systemPrompt: string | null;
  messages: Array<{ role: string; content: string }>;
}> {
  const contextResult = await buildFullContext(
    workspaceId,
    chatId,
    message,
    db,
    { maxMessages: 20 }
  );

  console.log('[STREAM] Built context:', {
    hasSystemPrompt: !!contextResult.systemPrompt,
    messageCount: contextResult.messages.length
  });

  return {
    systemPrompt: contextResult.systemPrompt || null,
    messages: contextResult.messages
  };
}

// ============================================
// Message Persistence
// ============================================

/**
 * Save user message to database
 */
export async function saveUserMessage(
  db: DbClient,
  chatId: string,
  content: string
): Promise<void> {
  await addUserMessage(db, chatId, content);
  console.log('[STREAM] Saved user message');
}

/**
 * Save assistant response to database
 */
export async function saveAssistantResponse(
  db: DbClient,
  chatId: string,
  content: string,
  sessionId?: string
): Promise<void> {
  // Save message
  await addAssistantMessage(db, chatId, content);
  console.log('[STREAM] Saved assistant response');

  // Update session if provided
  if (sessionId) {
    await updateChatSession(db, chatId, sessionId);
  }
}

// ============================================
// Title Generation
// ============================================

/**
 * Check if title should be generated (after first exchange)
 */
export function shouldGenerateTitle(messageCount: number): boolean {
  return messageCount === 2; // First exchange = 2 messages
}

/**
 * Generate and save title for chat
 */
export async function generateAndSaveTitle(
  db: DbClient,
  chatId: string,
  userMessage: string,
  assistantResponse: string
): Promise<string> {
  console.log('[STREAM] First exchange, generating title...');
  
  try {
    const title = await generateConversationTitle({
      userMessage,
      assistantResponse
    });

    await updateChatTitle(db, chatId, title);
    console.log('[STREAM] Generated title:', title);
    
    return title;
  } catch (error) {
    console.error('[STREAM] Title generation failed:', error);
    throw error;
  }
}

// ============================================
// Main Stream Function
// ============================================

/**
 * Stream a chat message using Pi Agent
 * 
 * This is the main orchestrator function that:
 * 1. Verifies access
 * 2. Sets up SSE
 * 3. Resolves credentials
 * 4. Saves user message
 * 5. Builds context
 * 6. Runs Pi Agent query
 * 7. Saves assistant response
 * 8. Generates title if needed
 */
export async function streamChat(
  db: DbClient,
  params: StreamParams,
  res: Response,
  signal?: AbortSignal
): Promise<void> {
  const { chatId, message, provider, model, workspaceId, userId } = params;

  console.log('='.repeat(60));
  console.log('[STREAM] Starting stream');
  console.log(`[STREAM] Chat: ${chatId}`);
  console.log(`[STREAM] Provider: ${provider}`);
  console.log(`[STREAM] Model: ${model}`);
  console.log('='.repeat(60));

  // 1. Setup SSE
  setupSSEResponse(res);
  const heartbeat = startHeartbeat(res);

  // Handle client disconnect
  const abortController = new AbortController();
  // Note: req listener is set up in streamChatWithRequest wrapper
  // signal parameter handles abort from there

  // Merge external signal with internal abort
  const effectiveSignal = signal || abortController.signal;

  let assistantResponse = '';
  let sessionId: string | undefined;

  try {
    // 2. Get or create chat
    const context = await getOrCreateStreamChat(db, params);
    
    // Emit title for new chats
    if (context.isNewChat && context.initialTitle) {
      sendSSEEvent(res, {
        type: 'title_update',
        title: context.initialTitle
      });
    }

    // 3. Resolve credentials
    const credentials = await resolveProviderCredentials(userId, provider);
    
    if (!credentials.configured && provider !== 'amazon-bedrock') {
      sendSSEEvent(res, {
        type: 'error',
        message: credentials.error || 'No API key configured',
        provider
      });
      stopHeartbeat(heartbeat);
      res.end();
      return;
    }

    // 4. Save user message
    await saveUserMessage(db, chatId, message);

    // 5. Build context
    const { systemPrompt, messages } = await buildStreamContext(
      db,
      context.workspaceId,
      chatId,
      message
    );

    // 6. Get Composio client
    let composioClient: unknown = null;
    try {
      const { getComposioClient } = await import('../pi/tools/composio-tools.js');
      composioClient = getComposioClient();
    } catch (err) {
      console.warn('[STREAM] Composio not available:', (err as Error).message);
    }

    // 7. Stream from Pi Agent
    for await (const chunk of runPiQuery({
      provider,
      model,
      workspaceId: context.workspaceId,
      chatId,
      userId,
      systemPrompt: systemPrompt || undefined,
      messages,
      composioClient,
      signal: effectiveSignal,
      sessionId: context.chat.sessionFilePath || undefined,
      credentials
    })) {
      // Send to client
      sendSSEEvent(res, chunk);

      // Capture session ID
      if (chunk.type === 'session_init' && 'session_id' in chunk) {
        sessionId = chunk.session_id;
      }

      // Accumulate response
      if (chunk.type === 'text' && !chunk.isReasoning) {
        assistantResponse += chunk.content || '';
      }
    }

    // 8. Save assistant response
    if (assistantResponse) {
      await saveAssistantResponse(db, chatId, assistantResponse, sessionId);

      // 9. Generate title after first exchange
      const messageCount = await getChatMessageCount(db, chatId);
      console.log('[STREAM] Message count:', messageCount);

      if (shouldGenerateTitle(messageCount)) {
        try {
          const title = await generateAndSaveTitle(
            db,
            chatId,
            message,
            assistantResponse
          );

          // Send title update
          if (!res.writableEnded) {
            sendSSEEvent(res, {
              type: 'title_update',
              title
            });
          }
        } catch (err) {
          console.error('[STREAM] Title generation failed:', err);
        }
      }
    }

    stopHeartbeat(heartbeat);
    if (!res.writableEnded) {
      res.end();
    }

    console.log('[STREAM] Completed');

  } catch (error) {
    stopHeartbeat(heartbeat);
    console.error('[STREAM] Error:', error);

    // Handle abort
    if ((error as Error).name === 'AbortError' || effectiveSignal.aborted) {
      console.log('[STREAM] Request aborted by user');
      if (!res.writableEnded) {
        sendSSEEvent(res, {
          type: 'aborted',
          provider
        });
        res.end();
      }
    } else {
      // Handle other errors
      if (!res.writableEnded) {
        sendSSEEvent(res, {
          type: 'error',
          message: (error as Error).message,
          provider
        });
        res.end();
      }
    }
  }
}

/**
 * Stream chat with request handling
 * Wrapper that handles request lifecycle
 */
export async function streamChatWithRequest(
  db: DbClient,
  params: StreamParams,
  req: Request,
  res: Response
): Promise<void> {
  // Setup abort handling from request
  const abortController = new AbortController();
  
  req.on('close', () => {
    abortController.abort();
  });

  await streamChat(db, params, res, abortController.signal);
}

// Re-export for backward compatibility if needed