/**
 * Chat Streaming Service
 *
 * Handles SSE streaming for real-time AI responses.
 */

import type { DbClient } from "./chat.service.js";
import {
  getChatById,
  createChat,
  addUserMessage,
  addAssistantMessage,
  getChatMessageCount,
  updateChatTitle,
  type SendMessageInput,
} from "./chat.service.js";
import { NotFoundError, ValidationError } from "../middleware/index.js";
import { resolveCredentials } from "../pi/credentials.js";
import { generateConversationTitle } from "./title-generator.js";
import { runPiQueryStream, type PiStreamEvent } from "../pi/stream.js";
import { repairSync, checkSyncStatus } from "../pi/session-sync.js";
import * as schema from "../db/schema.js";
import { eq } from "drizzle-orm";

/**
 * SSE Event types
 */
export interface StreamEvent {
  type: "text" | "tool" | "thinking" | "done" | "error" | "auth_required";
  content?: string;

  // Tool-specific fields
  toolCallId?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolStatus?: "running" | "success" | "error";
  toolResult?: unknown;
  toolError?: string;

  // Auth required fields
  authRequired?: {
    toolkitSlug: string;
    toolkitName: string;
    authUrl: string;
    connectionRequestId: string;
    message: string;
  };

  error?: string;
}

export type StreamEventCallback = (event: StreamEvent) => void;

/**
 * Process message with SSE streaming
 */
export async function processMessageStream(
  db: DbClient,
  input: SendMessageInput,
  onEvent: StreamEventCallback,
): Promise<void> {
  const { chatId, message, provider, model, workspaceId, userId, attachments } = input;

  console.log("=".repeat(60));
  console.log("[CHAT:Stream] Processing message with streaming");
  console.log(`[CHAT:Stream] Chat: ${chatId}`);
  console.log(`[CHAT:Stream] Provider: ${provider}`);
  console.log(`[CHAT:Stream] Model: ${model}`);
  console.log("=".repeat(60));

  // Get or create chat
  let chat: Awaited<ReturnType<typeof getChatById>>;

  try {
    chat = await getChatById(db, chatId);
  } catch (error) {
    if (error instanceof NotFoundError) {
      const initialTitle =
        message.length > 50 ? message.substring(0, 47) + "..." : message;

      chat = await createChat(
        db,
        workspaceId,
        userId,
        { title: initialTitle, provider, model },
        chatId,
      );
    } else {
      throw error;
    }
  }

  // Resolve credentials
  const credentials = await resolveCredentials(userId, provider);
  if (!credentials.configured && provider !== "amazon-bedrock") {
    throw new ValidationError(credentials.error || "No API key configured");
  }

  // Check and repair session sync before processing
  // This ensures the AI has proper conversation context
  const syncStatus = await checkSyncStatus(db, workspaceId, chatId);
  if (!syncStatus.inSync) {
    console.warn("[CHAT:Stream] Session out of sync:", syncStatus);
    const repairResult = await repairSync(db, workspaceId, chatId);
    console.log("[CHAT:Stream] Repair result:", repairResult);
  }

  // Save user message to database
  await addUserMessage(db, chatId, message);

  // Collect full response and blocks for DB
  let fullResponse = "";
  const blocks: Array<{
    type: "text" | "tool";
    content?: string;
    toolCall?: any;
  }> = [];
  let currentTextBlock: { type: "text"; content: string } | null = null;

  // Run Pi Agent query with streaming
  // Note: sessionId parameter removed - session path is now deterministic
  await runPiQueryStream(
    {
      provider,
      model,
      workspaceId,
      chatId,
      userId,
      currentMessage: message,
      attachments,
      credentials,
    },
    (piEvent: PiStreamEvent) => {
      // Transform Pi Agent events to SSE events
      if (piEvent.type === "message_update" && piEvent.assistantMessageEvent) {
        const delta = piEvent.assistantMessageEvent.delta;
        fullResponse += delta;

        // Accumulate text in current text block
        if (!currentTextBlock) {
          currentTextBlock = { type: "text", content: delta };
          blocks.push(currentTextBlock);
        } else {
          currentTextBlock.content += delta;
        }

        onEvent({
          type: "text",
          content: delta,
        });
      }

      if (piEvent.type === "tool_call" && piEvent.toolCall) {
        // Tool call interrupts text, start new text block after tool
        currentTextBlock = null;

        // Find existing tool block or create new one
        const existingToolIndex = blocks.findIndex(
          (b) => b.type === "tool" && b.toolCall?.id === piEvent.toolCall!.id,
        );

        const toolBlock = {
          type: "tool" as const,
          toolCall: {
            id: piEvent.toolCall.id,
            name: piEvent.toolCall.name,
            input: piEvent.toolCall.input || {},
            status: piEvent.toolCall.status,
            result: piEvent.toolCall.result,
            startTime: Date.now(),
            errorMessage: piEvent.toolCall.error,
          },
        };

        if (existingToolIndex >= 0) {
          // Update existing tool block
          blocks[existingToolIndex] = toolBlock;
        } else {
          // Add new tool block
          blocks.push(toolBlock);
        }

        onEvent({
          type: "tool",
          toolCallId: piEvent.toolCall.id,
          toolName: piEvent.toolCall.name,
          toolInput: piEvent.toolCall.input,
          toolStatus: piEvent.toolCall.status,
          toolResult: piEvent.toolCall.result,
          toolError: piEvent.toolCall.error,
        });
      }

      if (piEvent.type === "thinking") {
        onEvent({
          type: "thinking",
          content: piEvent.content,
        });
      }

      // Handle auth required from Composio tools
      if (piEvent.type === "auth_required" && piEvent.authRequired) {
        onEvent({
          type: "auth_required",
          authRequired: piEvent.authRequired,
        });
      }
    },
  );

  // Save assistant response with blocks in metadata
  if (fullResponse) {
    const messageRecord = await addAssistantMessage(db, chatId, fullResponse);

    // Store blocks in metadata
    if (blocks.length > 0) {
      await db
        .update(schema.messages)
        .set({
          metadata: { blocks },
        })
        .where(eq(schema.messages.id, messageRecord.id));
    }

    // Generate title after first exchange
    const messageCount = await getChatMessageCount(db, chatId);
    if (messageCount === 2) {
      const title = await generateConversationTitle({
        userMessage: message,
        assistantResponse: fullResponse,
      });

      await updateChatTitle(db, chatId, title);
    }
  } else {
    // No response - something went wrong
    console.error("[CHAT:Stream] No response received from AI");
    // Try to repair sync in case there's partial data in session
    await repairSync(db, workspaceId, chatId);
  }

  console.log("[CHAT:Stream] Completed");
}
