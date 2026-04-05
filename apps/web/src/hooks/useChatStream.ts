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
import { useState, useRef, useCallback } from 'react';
import type { Message, ToolCall, Todo, InlineToolCall, Provider } from '@normie/types';
import { generateId } from '@normie/utils';
import { chatApi } from '@/lib/api';

// Helper to check if error is a user-initiated abort
function isAbortError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.name === 'AbortError' ||
           error.message?.includes('abort') ||
           error.message?.includes('cancelled') ||
           error.message?.includes('The operation was aborted');
  }
  return false;
}

interface UseChatStreamReturn {
  messages: Message[];
  isStreaming: boolean;
  toolCalls: ToolCall[];
  todos: Todo[];
  sendMessage: (params: {
    content: string;
    chatId: string;
    chatTitle: string;
    provider: Provider;
    model: string;
    workspaceId: string | null;
    userId: string;
  }) => Promise<{ chatId: string; chatTitle: string } | null>;
  stopStreaming: (chatId: string, provider: Provider) => Promise<void>;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setToolCalls: React.Dispatch<React.SetStateAction<ToolCall[]>>;
  setTodos: React.Dispatch<React.SetStateAction<Todo[]>>;
  loadMessages: (chat: { messages: Message[]; todos?: Todo[]; toolCalls?: ToolCall[] }) => void;
  reset: () => void;
}

export function useChatStream(): UseChatStreamReturn {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    setMessages([]);
    setToolCalls([]);
    setTodos([]);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  const loadMessages = useCallback((chat: { messages: Message[]; todos?: Todo[]; toolCalls?: ToolCall[] }) => {
    setMessages(chat.messages);
    setTodos(chat.todos || []);
    setToolCalls(chat.toolCalls || []);
  }, []);

  const stopStreaming = useCallback(async (chatId: string, provider: Provider) => {
    window.electronAPI?.abortCurrentRequest();
    if (chatId) {
      await chatApi.abort(chatId, provider);
    }
    setIsStreaming(false);
  }, []);

  const sendMessage = useCallback(
    async (params: {
      content: string;
      chatId: string;
      chatTitle: string;
      provider: Provider;
      model: string;
      workspaceId: string | null;
      userId: string;
    }): Promise<{ chatId: string; chatTitle: string } | null> => {
      const { content, chatId, chatTitle, provider, model, workspaceId, userId } = params;

      if (!content.trim() || isStreaming) return null;

      const userMessage: Message = {
        id: generateId(),
        role: 'user',
        content: content.trim(),
      };

      // Add user message
      setMessages((prev) => [...prev, userMessage]);

      // Create placeholder assistant message
      const assistantMessageId = generateId();
      setMessages((prev) => [
        ...prev,
        {
          id: assistantMessageId,
          role: 'assistant',
          content: '',
          reasoning: '',
          inlineToolCalls: [],
        },
      ]);

      setIsStreaming(true);

      try {
        const reader = await chatApi.send({
          content,
          chatId,
          provider,
          model,
          workspaceId,
          userId,
        });

        let fullContent = '';
        let fullReasoning = '';
        const pendingToolCalls = new Map<string, string>();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;

          // Parse SSE data
          const lines = value.split('\n');
          for (const line of lines) {
            if (line.startsWith(':')) continue;
            if (!line.startsWith('data: ')) continue;

            try {
              const data = JSON.parse(line.slice(6));

              switch (data.type) {
                case 'text':
                  if (data.content) {
                    if (data.isReasoning) {
                      fullReasoning += data.content;
                    } else {
                      fullContent += data.content;
                    }
                    // Simple React update - this is how most apps do it
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantMessageId
                          ? { ...m, content: fullContent, reasoning: fullReasoning }
                          : m
                      )
                    );
                  }
                  break;

                case 'tool_use':
                  if (data.name) {
                    const localToolId = generateId();

                    const toolCall: ToolCall = {
                      id: localToolId,
                      name: data.name,
                      input: data.input || {},
                      status: 'running',
                    };
                    setToolCalls((prev) => [...prev, toolCall]);

                    if (data.id) {
                      pendingToolCalls.set(data.id, localToolId);
                    }

                    const inlineToolCall: InlineToolCall = {
                      id: localToolId,
                      name: data.name,
                      input: data.input || {},
                      status: 'running',
                    };
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantMessageId
                          ? {
                              ...m,
                              inlineToolCalls: [
                                ...(m.inlineToolCalls || []),
                                inlineToolCall,
                              ],
                            }
                          : m
                      )
                    );

                    if (data.name === 'TodoWrite' && data.input?.todos) {
                      setTodos(data.input.todos as Todo[]);
                    }
                  }
                  break;

                case 'tool_result':
                  if (data.tool_use_id || data.result !== undefined) {
                    const apiToolId = data.tool_use_id;
                    const localId = apiToolId
                      ? pendingToolCalls.get(apiToolId)
                      : null;

                    if (localId) {
                      setToolCalls((prev) =>
                        prev.map((t) =>
                          t.id === localId
                            ? { ...t, status: 'success', result: data.result }
                            : t
                        )
                      );

                      setMessages((prev) =>
                        prev.map((m) =>
                          m.id === assistantMessageId
                            ? {
                                ...m,
                                inlineToolCalls:
                                  m.inlineToolCalls?.map((t) =>
                                    t.id === localId
                                      ? {
                                          ...t,
                                          status: 'success',
                                          result: data.result,
                                        }
                                      : t
                                  ) || [],
                              }
                            : m
                        )
                      );

                      pendingToolCalls.delete(apiToolId);
                    }
                  }
                  break;

                case 'error':
                  throw new Error(data.message || 'Stream error');
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
              content: fullContent,
              reasoning: fullReasoning || undefined,
              inlineToolCalls: m.inlineToolCalls?.length
                ? m.inlineToolCalls
                : undefined,
            };
          })
        );

        return { chatId, chatTitle };
      } catch (error) {
        console.error('[useChatStream] Error:', error);

        // Don't show error for user-initiated abort
        if (isAbortError(error)) {
          console.log('[useChatStream] Stream aborted by user, not an error');
          // Clean up: remove empty placeholder or keep accumulated content
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    // Keep accumulated content, clean up reasoning if empty
                    reasoning: m.reasoning || undefined,
                  }
                : m
            )
          );
        } else {
          // Only show error for actual errors (not aborts)
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessageId
                ? {
                    ...m,
                    content:
                      m.content +
                      `\n\n[Error: ${error instanceof Error ? error.message : 'Unknown error'}]`,
                  }
                : m
            )
          );
        }

        return null;
      } finally {
        setIsStreaming(false);
      }
    },
    [isStreaming]
  );

  return {
    messages,
    isStreaming,
    toolCalls,
    todos,
    sendMessage,
    stopStreaming,
    setMessages,
    setToolCalls,
    setTodos,
    loadMessages,
    reset,
  };
}