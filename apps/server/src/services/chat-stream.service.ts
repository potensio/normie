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
import { buildSystemContext } from "./context-builder.js";
import { generateConversationTitle } from "./title-generator.js";
import { runPiQueryStream, type PiStreamEvent } from "../pi/stream.js";

/**
 * SSE Event types
 */
export interface StreamEvent {
  type: "text" | "tool" | "thinking" | "done" | "error";
  content?: string;
  toolName?: string;
  toolStatus?: "running" | "completed" | "failed";
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
  const { chatId, message, provider, model, workspaceId, userId } = input;

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

  // Save user message
  await addUserMessage(db, chatId, message);

  // Build system context
  const systemPrompt = await buildSystemContext(workspaceId, db);

  // Collect full response for DB
  let fullResponse = "";

  // Run Pi Agent query with streaming
  await runPiQueryStream(
    {
      provider,
      model,
      workspaceId,
      chatId,
      userId,
      systemPrompt: systemPrompt || undefined,
      currentMessage: message,
      sessionId: chat.sessionFilePath || undefined,
      credentials,
    },
    (piEvent: PiStreamEvent) => {
      // Transform Pi Agent events to SSE events
      if (piEvent.type === "message_update" && piEvent.assistantMessageEvent) {
        const delta = piEvent.assistantMessageEvent.delta;
        fullResponse += delta;

        onEvent({
          type: "text",
          content: delta,
        });
      }

      if (piEvent.type === "tool_call" && piEvent.toolCall) {
        onEvent({
          type: "tool",
          toolName: piEvent.toolCall.name,
          toolStatus: piEvent.toolCall.status,
        });
      }

      if (piEvent.type === "thinking") {
        onEvent({
          type: "thinking",
          content: piEvent.content,
        });
      }
    },
  );

  // Save assistant response
  if (fullResponse) {
    await addAssistantMessage(db, chatId, fullResponse);

    // Generate title after first exchange
    const messageCount = await getChatMessageCount(db, chatId);
    if (messageCount === 2) {
      const title = await generateConversationTitle({
        userMessage: message,
        assistantResponse: fullResponse,
      });

      await updateChatTitle(db, chatId, title);
    }
  }

  console.log("[CHAT:Stream] Completed");
}
