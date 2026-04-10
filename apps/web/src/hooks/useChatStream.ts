import { useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { chatKeys } from "./useCurrentChat";
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

interface StreamState {
  isStreaming: boolean;
  error: string | null;
}

export function useChatStream() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<StreamState>({
    isStreaming: false,
    error: null,
  });

  const assistantMessageIdRef = useRef<string | null>(null);

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
      setState({ isStreaming: true, error: null });
      const userMessageId = generateId();
      const assistantMessageId = generateId();
      assistantMessageIdRef.current = assistantMessageId;

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
        if (!old)
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
        if (!response.ok)
          throw new Error(
            (await response.json().catch(() => ({ error: "Stream failed" })))
              .error || "Stream failed",
          );
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
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
                        messages[lastIndex] = {
                          ...messages[lastIndex],
                          blocks: [
                            {
                              type: "text",
                              content:
                                (messages[lastIndex].blocks[0]?.content || "") +
                                data.content,
                            },
                          ],
                        };
                      }
                      return { ...old, messages };
                    },
                  );
                }
                if (data.type === "done") {
                  setState((prev) => ({ ...prev, isStreaming: false }));
                  queryClient.invalidateQueries({
                    queryKey: chatKeys.detail(chatId),
                  });
                  queryClient.invalidateQueries({
                    queryKey: ["chats", "list"],
                  });
                }
                if (data.type === "error")
                  throw new Error(data.message || "Stream error");
              } catch (parseError) {
                console.error("[Stream] Parse error:", parseError);
              }
            }
          }
        }
      } catch (error) {
        console.error("[Stream] Error:", error);
        setState({ isStreaming: false, error: (error as Error).message });
        queryClient.invalidateQueries({ queryKey: chatKeys.detail(chatId) });
      }
    },
    [queryClient],
  );
  const stopStream = useCallback(() => {
    setState((prev) => ({ ...prev, isStreaming: false }));
  }, []);
  return { ...state, startStream, stopStream };
}
