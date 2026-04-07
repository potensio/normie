/**
 * useChatStream - Simple streaming without over-engineering
 *
 * REALITY CHECK:
 * ChatGPT, Claude.ai, etc. achieve smooth streaming because:
 * 1. Their backends send small, frequent chunks (1-10 chars at a time)
 * 2. They use simple React rendering - no fancy tricks
 * 3. The "smoothness" is from consistent chunk timing, not frontend magic
 *
 * If your backend sends big chunks infrequently, NO frontend trick will help.
 */
import { useState, useRef, useCallback } from "react";
import type {
  Message,
  ToolCall,
  Todo,
  InlineToolCall,
  Provider,
  MessageBlock,
  TextBlock,
  ToolBlock,
} from "@normie/types";
import { generateId } from "@normie/utils";
import { chatApi } from "@/lib/api";
import { queryClient } from "@/lib/query-client";
import { classifyToolError } from "@/lib/error-messages";

// Helper to check if error is a user-initiated abort
function isAbortError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.name === "AbortError" ||
      error.message?.includes("abort") ||
      error.message?.includes("cancelled") ||
      error.message?.includes("The operation was aborted")
    );
  }
  return false;
}

interface UseChatStreamReturn {
  messages: Message[];
  isStreaming: boolean;
  toolCalls: ToolCall[];
  todos: Todo[];
  generatedTitle: string | null;
  sendMessage: (
    params: {
      content: string;
      chatId: string;
      chatTitle: string;
      provider: Provider;
      model: string;
      workspaceId: string | null;
      userId: string;
      attachments?: Array<{
        id: string;
        filename: string;
        originalName: string;
        mimeType: string;
        size: number;
        storagePath: string;
      }>;
    },
    callbacks?: {
      onTitleUpdate?: (title: string) => void;
    },
  ) => Promise<{ chatId: string; chatTitle: string } | null>;
  stopStreaming: (chatId: string, provider: Provider) => Promise<void>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setToolCalls: React.Dispatch<React.SetStateAction<ToolCall[]>>;
  setTodos: React.Dispatch<React.SetStateAction<Todo[]>>;
  loadMessages: (chat: {
    messages: Message[];
    todos?: Todo[];
    toolCalls?: ToolCall[];
  }) => void;
  reset: () => void;
}

/**
 * Merge adjacent text blocks for efficiency
 */
function mergeTextBlocks(blocks: MessageBlock[]): MessageBlock[] {
  const result: MessageBlock[] = [];

  for (const block of blocks) {
    const lastBlock = result[result.length - 1];

    if (block.type === "text" && lastBlock?.type === "text") {
      // Merge with previous text block
      lastBlock.content += block.content;
    } else {
      result.push(block);
    }
  }

  return result;
}

export function useChatStream(): UseChatStreamReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [generatedTitle, setGeneratedTitle] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setMessages([]);
    setToolCalls([]);
    setTodos([]);
    setGeneratedTitle(null);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const loadMessages = useCallback(
    (chat: { messages: Message[]; todos?: Todo[]; toolCalls?: ToolCall[] }) => {
      setMessages(chat.messages);
      setTodos(chat.todos || []);
      setToolCalls(chat.toolCalls || []);
    },
    [],
  );

  const stopStreaming = useCallback(
    async (chatId: string, provider: Provider) => {
      window.electronAPI?.abortCurrentRequest();
      if (chatId) {
        await chatApi.abort(chatId, provider);
      }
      setIsStreaming(false);
    },
    [],
  );

  const sendMessage = useCallback(
    async (
      params: {
        content: string;
        chatId: string;
        chatTitle: string;
        provider: Provider;
        model: string;
        workspaceId: string | null;
        userId: string;
        attachments?: Array<{
          id: string;
          filename: string;
          originalName: string;
          mimeType: string;
          size: number;
          storagePath: string;
        }>;
      },
      callbacks?: {
        onTitleUpdate?: (title: string) => void;
      },
    ): Promise<{ chatId: string; chatTitle: string } | null> => {
      const {
        content,
        chatId,
        chatTitle,
        provider,
        model,
        workspaceId,
        userId,
        attachments,
      } = params;

      if (!content.trim() || isStreaming) return null;

      const userMessage: Message = {
        id: generateId(),
        role: "user",
        blocks: [{ type: "text", content: content.trim() }],
        attachments: attachments,
      };

      // Add user message
      setMessages((prev) => [...prev, userMessage]);

      // Create placeholder assistant message
      const assistantMessageId = generateId();
      setMessages((prev) => [
        ...prev,
        {
          id: assistantMessageId,
          role: "assistant",
          blocks: [],
          reasoning: "",
        },
      ]);

      setIsStreaming(true);

      try {
        // Convert attachments to paths for API
        const attachmentPaths = attachments?.map((a) => ({
          path: a.storagePath,
        }));

        const reader = await chatApi.send({
          content,
          chatId,
          provider,
          model,
          workspaceId,
          userId,
          attachments: attachmentPaths,
        });

        let blocks: MessageBlock[] = [];
        let fullReasoning = "";
        const pendingToolCalls = new Map<
          string,
          { localId: string; startTime: number }
        >();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;

          // Parse SSE data
          const lines = value.split("\n");
          for (const line of lines) {
            if (line.startsWith(":")) continue;
            if (!line.startsWith("data: ")) continue;

            try {
              const data = JSON.parse(line.slice(6));

              switch (data.type) {
                case "text":
                  if (data.content) {
                    if (data.isReasoning) {
                      fullReasoning += data.content;
                    } else {
                      // Append text block
                      blocks = mergeTextBlocks([
                        ...blocks,
                        { type: "text", content: data.content } as TextBlock,
                      ]);
                    }
                    // Update message with new blocks
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantMessageId
                          ? {
                              ...m,
                              blocks: [...blocks],
                              reasoning: fullReasoning,
                            }
                          : m,
                      ),
                    );
                  }
                  break;

                case "connection_action":
                  // Handle connection action from connect_toolkit tool
                  if (data.data) {
                    const localToolId = generateId();
                    const startTime = Date.now();

                    // Create an inline tool call for the connection
                    const inlineToolCall: InlineToolCall = {
                      id: localToolId,
                      name: "connect_toolkit",
                      input: {
                        toolkitSlug: data.data.toolkitSlug,
                        reason: data.data.message,
                      },
                      status: "success",
                      result: data.data,
                      startTime,
                      duration: 0,
                    };

                    // Append tool block with connection result
                    blocks = [
                      ...blocks,
                      { type: "tool", toolCall: inlineToolCall } as ToolBlock,
                    ];

                    // Also track in ToolCall[] state
                    const toolCall: ToolCall = {
                      id: localToolId,
                      name: "connect_toolkit",
                      input: {
                        toolkitSlug: data.data.toolkitSlug,
                        reason: data.data.message,
                      },
                      status: "success",
                      result: data.data,
                    };
                    setToolCalls((prev) => [...prev, toolCall]);

                    // Update message
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantMessageId
                          ? {
                              ...m,
                              blocks: [...blocks],
                              reasoning: fullReasoning,
                            }
                          : m,
                      ),
                    );
                  }
                  break;

                case "tool_use":
                  if (data.name) {
                    const localToolId = generateId();
                    const startTime = Date.now();

                    // Track tool call (for ToolCall[] state - separate from blocks)
                    const toolCall: ToolCall = {
                      id: localToolId,
                      name: data.name,
                      input: data.input || {},
                      status: "running",
                    };
                    setToolCalls((prev) => [...prev, toolCall]);

                    // Track for later update
                    if (data.id) {
                      pendingToolCalls.set(data.id, {
                        localId: localToolId,
                        startTime,
                      });
                    }

                    // Append tool block
                    const inlineToolCall: InlineToolCall = {
                      id: localToolId,
                      name: data.name,
                      input: data.input || {},
                      status: "running",
                      startTime,
                    };
                    blocks = [
                      ...blocks,
                      { type: "tool", toolCall: inlineToolCall } as ToolBlock,
                    ];

                    // Update message
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantMessageId
                          ? {
                              ...m,
                              blocks: [...blocks],
                              reasoning: fullReasoning,
                            }
                          : m,
                      ),
                    );

                    // Handle TodoWrite
                    if (data.name === "TodoWrite" && data.input?.todos) {
                      setTodos(data.input.todos as Todo[]);
                    }
                  }
                  break;

                case "tool_result":
                  if (data.tool_use_id || data.result !== undefined) {
                    const apiToolId = data.tool_use_id;
                    const tracking = apiToolId
                      ? pendingToolCalls.get(apiToolId)
                      : null;

                    if (tracking) {
                      const { localId, startTime } = tracking;
                      const duration =
                        Math.round((Date.now() - startTime) / 100) / 10;

                      // Update ToolCall[] state
                      const isError =
                        data.result?.error || data.result?.status === "error";
                      setToolCalls((prev) =>
                        prev.map((t) =>
                          t.id === localId
                            ? {
                                ...t,
                                status: isError ? "error" : "success",
                                result: data.result,
                              }
                            : t,
                        ),
                      );

                      // Update tool block in blocks array
                      blocks = blocks.map((block) => {
                        if (
                          block.type === "tool" &&
                          block.toolCall.id === localId
                        ) {
                          return {
                            ...block,
                            toolCall: {
                              ...block.toolCall,
                              status: isError ? "error" : "success",
                              result: data.result,
                              duration,
                              errorMessage: isError
                                ? classifyToolError(
                                    data.result?.error || data.result,
                                  )
                                : undefined,
                            },
                          } as ToolBlock;
                        }
                        return block;
                      });

                      // Update message
                      setMessages((prev) =>
                        prev.map((m) =>
                          m.id === assistantMessageId
                            ? {
                                ...m,
                                blocks: [...blocks],
                                reasoning: fullReasoning,
                              }
                            : m,
                        ),
                      );

                      pendingToolCalls.delete(apiToolId);
                    }
                  }
                  break;

                case "title_update":
                  // Title was auto-generated by AI after first exchange
                  if (data.title) {
                    setGeneratedTitle(data.title);
                    // Update the chat title in query cache
                    queryClient.setQueryData(
                      ["chats", "list"],
                      (old: unknown) => {
                        if (
                          !old ||
                          typeof old !== "object" ||
                          !("chats" in old)
                        )
                          return old;
                        const oldData = old as {
                          chats: Array<{ id: string; title: string }>;
                        };
                        return {
                          ...oldData,
                          chats: oldData.chats.map((chat) =>
                            chat.id === chatId
                              ? { ...chat, title: data.title }
                              : chat,
                          ),
                        };
                      },
                    );
                    // Call the callback if provided
                    callbacks?.onTitleUpdate?.(data.title);
                  }
                  break;

                case "error":
                  throw new Error(data.message || "Stream error");
              }
            } catch {
              // Skip parse errors
            }
          }
        }

        // Final update
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== assistantMessageId) return m;
            return {
              ...m,
              blocks: blocks.length > 0 ? blocks : undefined,
              reasoning: fullReasoning || undefined,
            };
          }),
        );

        // Persist blocks to backend
        if (blocks.length > 0) {
          try {
            await chatApi.updateMessageBlocks(assistantMessageId, blocks);
          } catch (err) {
            console.warn("[useChatStream] Failed to persist blocks:", err);
          }
        }

        return { chatId, chatTitle };
      } catch (error) {
        console.error("[useChatStream] Error:", error);

        // Don't show error for user-initiated abort
        if (isAbortError(error)) {
          console.log("[useChatStream] Stream aborted by user, not an error");
          // Clean up: remove empty placeholder or keep accumulated content
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    // Keep accumulated blocks, clean up reasoning if empty
                    reasoning: m.reasoning || undefined,
                  }
                : m,
            ),
          );
        } else {
          // Only show error for actual errors (not aborts)
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== assistantMessageId) return m;

              // Add error as text block
              const errorBlock: TextBlock = {
                type: "text",
                content: `\n\n[Error: ${error instanceof Error ? error.message : "Unknown error"}]`,
              };

              return {
                ...m,
                blocks: m.blocks ? [...m.blocks, errorBlock] : [errorBlock],
              };
            }),
          );
        }

        return null;
      } finally {
        setIsStreaming(false);
      }
    },
    [isStreaming],
  );

  return {
    messages,
    isStreaming,
    toolCalls,
    todos,
    generatedTitle,
    sendMessage,
    stopStreaming,
    setMessages,
    setToolCalls,
    setTodos,
    loadMessages,
    reset,
  };
}
