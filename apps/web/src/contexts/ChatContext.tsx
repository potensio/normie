/**
 * ChatContext - Shared chat streaming state across routes
 *
 * Provides streaming state that persists across route navigation.
 * This ensures isStreaming is shared between home and chat routes.
 */

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { chatKeys } from "@/hooks/useCurrentChat";
import type { Message } from "@normie/types";
import { generateId } from "@normie/utils";

interface StreamOptions {
  chatId: string;
  message: string;
  provider: string;
  model: string;
  workspaceId: string;
  userId: string;
  attachments?: Array<{
    id: string;
    filename: string;
    originalName: string;
    mimeType: string;
    size: number;
    storagePath: string;
  }>;
}

interface ChatContextValue {
  isStreaming: boolean;
  startStream: (options: StreamOptions) => Promise<void>;
  stopStream: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [isStreaming, setIsStreaming] = useState(false);
  const assistantMessageIdRef = useRef<string | null>(null);
  const currentTextBlockIndexRef = useRef<number>(0);

  const startStream = useCallback(
    async (options: StreamOptions) => {
      const {
        chatId,
        message,
        provider,
        model,
        workspaceId,
        userId,
        attachments,
      } = options;

      console.log("[ChatContext] Starting stream for chat:", chatId);
      setIsStreaming(true);

      const userMessageId = generateId();
      const assistantMessageId = generateId();
      assistantMessageIdRef.current = assistantMessageId;
      currentTextBlockIndexRef.current = 0;

      const userMessage: Message = {
        id: userMessageId,
        role: "user",
        blocks: [{ type: "text", content: message.trim() }],
        attachments,
      };
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: "assistant",
        blocks: [{ type: "text", content: "" }],
      };

      queryClient.setQueryData(chatKeys.detail(chatId), (old: any) => {
        if (!old) {
          return {
            id: chatId,
            title: "New Chat",
            provider,
            model,
            workspaceId,
            userId,
            messages: [userMessage, assistantMessage],
            todos: [],
            toolCalls: [],
            updatedAt: Date.now(),
          };
        }
        return {
          ...old,
          messages: [...(old.messages || []), userMessage, assistantMessage],
        };
      });

      try {
        const response = await fetch(
          `http://localhost:3001/api/chats/${chatId}/stream`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              message,
              provider,
              model,
              workspaceId,
              attachments: attachments?.map((a) => ({ path: a.storagePath })),
            }),
          },
        );

        if (!response.ok) {
          throw new Error(
            (await response.json().catch(() => ({ error: "Stream failed" })))
              .error || "Stream failed",
          );
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log("[ChatContext] Stream done");
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.substring(6));

                if (data.type === "text") {
                  queryClient.setQueryData(
                    chatKeys.detail(chatId),
                    (old: any) => {
                      if (!old) return old;
                      const messages = [...(old.messages || [])];
                      const lastIndex = messages.length - 1;

                      if (
                        lastIndex >= 0 &&
                        messages[lastIndex].id === assistantMessageId
                      ) {
                        const blocks = [...(messages[lastIndex].blocks || [])];
                        const currentIndex = currentTextBlockIndexRef.current;

                        if (blocks[currentIndex]?.type === "text") {
                          blocks[currentIndex] = {
                            type: "text",
                            content:
                              (blocks[currentIndex].content || "") +
                              data.content,
                          };
                        } else {
                          const newBlock = {
                            type: "text" as const,
                            content: data.content,
                          };
                          blocks.splice(currentIndex, 0, newBlock);
                        }

                        messages[lastIndex] = {
                          ...messages[lastIndex],
                          blocks,
                        };
                      }
                      return { ...old, messages };
                    },
                  );
                }

                if (data.type === "tool") {
                  queryClient.setQueryData(
                    chatKeys.detail(chatId),
                    (old: any) => {
                      if (!old) return old;
                      const messages = [...(old.messages || [])];
                      const lastIndex = messages.length - 1;

                      if (
                        lastIndex >= 0 &&
                        messages[lastIndex].id === assistantMessageId
                      ) {
                        const blocks = [...(messages[lastIndex].blocks || [])];
                        const toolBlockIndex = blocks.findIndex(
                          (b) =>
                            b.type === "tool" &&
                            b.toolCall.id === data.toolCallId,
                        );

                        const toolBlock = {
                          type: "tool" as const,
                          toolCall: {
                            id: data.toolCallId!,
                            name: data.toolName!,
                            input: data.toolInput || {},
                            status: data.toolStatus!,
                            result: data.toolResult,
                            startTime: Date.now(),
                            errorMessage: data.toolError,
                          },
                        };

                        if (toolBlockIndex >= 0) {
                          blocks[toolBlockIndex] = toolBlock;
                        } else {
                          blocks.push(toolBlock);
                          currentTextBlockIndexRef.current = blocks.length;
                        }

                        messages[lastIndex] = {
                          ...messages[lastIndex],
                          blocks,
                        };
                      }

                      return { ...old, messages };
                    },
                  );
                }

                if (data.type === "done") {
                  console.log("[ChatContext] Received 'done' event");
                  setIsStreaming(false);
                  queryClient.invalidateQueries({
                    queryKey: ["chats", "list"],
                  });
                }

                if (data.type === "error") {
                  throw new Error(data.message || "Stream error");
                }
              } catch (parseError) {
                console.error("[ChatContext] Parse error:", parseError);
              }
            }
          }
        }
      } catch (error) {
        console.error("[ChatContext] Error:", error);
        setIsStreaming(false);
        queryClient.invalidateQueries({ queryKey: chatKeys.detail(chatId) });
      }
    },
    [queryClient],
  );

  const stopStream = useCallback(() => {
    console.log("[ChatContext] Stopping stream");
    setIsStreaming(false);
  }, []);

  return (
    <ChatContext.Provider value={{ isStreaming, startStream, stopStream }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChatContext() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return context;
}