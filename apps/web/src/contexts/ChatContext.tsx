import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import type {
  Chat,
  Message,
  Provider,
  ToolCall,
  Todo,
  ThinkingMode,
  InlineToolCall,
} from "@normie/types";
import { generateId, transformApiChat } from "@normie/utils";
import { useAuth } from "./AuthContext";
import { useChats, useDeleteChat, chatKeys } from "@/hooks";
import { usePreferences } from "@/hooks";
import { setCurrentChatId, getCurrentChatId } from "@/lib/storage";
import { useQueryClient } from "@tanstack/react-query";

interface ChatContextType {
  // State
  chats: Chat[];
  currentChat: Chat | null;
  messages: Message[];
  isLoading: boolean;
  isStreaming: boolean;
  todos: Todo[];
  toolCalls: ToolCall[];
  selectedProvider: Provider;
  selectedModel: string;
  thinkingMode: ThinkingMode;

  // Actions
  createNewChat: () => void;
  loadChat: (chatId: string) => Promise<void>;
  deleteChat: (chatId: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  stopStreaming: () => void;
  setProvider: (provider: Provider) => void;
  setModel: (model: string) => void;
  toggleThinkingMode: () => void;
  refreshChats: () => Promise<void>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, currentWorkspace, clearAuthState } = useAuth();
  const queryClient = useQueryClient();

  // TanStack Query for chats list
  const { data: chats = [], refetch: refreshChats } = useChats(currentWorkspace?.id);

  // Preferences hook - use directly, pass to context for backwards compatibility
  const {
    provider: selectedProvider,
    model: selectedModel,
    setProvider: setProviderPreference,
    setModel: setModelPreference,
  } = usePreferences();

  // Local state for current chat
  const [currentChat, setCurrentChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [thinkingMode, setThinkingMode] = useState<ThinkingMode>("normal");

  // Abort controller for streaming
  const abortControllerRef = useRef<AbortController | null>(null);

  // Workspace change - clear current chat only
  useEffect(() => {
    if (currentWorkspace?.id) {
      setCurrentChat(null);
      setMessages([]);
      setToolCalls([]);
      setTodos([]);
      setCurrentChatId(null);
    }
  }, [currentWorkspace?.id]);

  // Restore last open chat on mount
  useEffect(() => {
    const restoreLastChat = async () => {
      if (isLoggedIn && currentWorkspace?.id && chats.length > 0) {
        const lastChatId = getCurrentChatId();
        if (lastChatId && chats.some((c) => c.id === lastChatId)) {
          await loadChat(lastChatId);
        }
      }
    };
    restoreLastChat();
  }, [isLoggedIn, currentWorkspace?.id, chats.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const createNewChat = useCallback(() => {
    // Abort any ongoing request
    if (isStreaming && abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
    }

    setCurrentChat(null);
    setMessages([]);
    setTodos([]);
    setToolCalls([]);
    setCurrentChatId(null);
  }, [isStreaming]);

  const loadChat = useCallback(
    async (chatId: string) => {
      // Abort any ongoing request
      if (isStreaming && abortControllerRef.current) {
        abortControllerRef.current.abort();
        setIsStreaming(false);
      }

      // First, check if we have a cached version with messages
      const cachedChat = chats.find((c) => c.id === chatId);
      if (cachedChat && cachedChat.messages.length > 0) {
        setCurrentChat(cachedChat);
        setMessages(cachedChat.messages);
        setTodos(cachedChat.todos || []);
        setToolCalls(cachedChat.toolCalls || []);
        setCurrentChatId(chatId);
        return;
      }

      // If not cached or empty, load from API
      if (!isLoggedIn || !currentWorkspace) {
        return;
      }

      setIsLoading(true);
      try {
        const chatData = await window.authAPI?.getChat(chatId);
        if (chatData) {
          const chat = transformApiChat(chatData as Record<string, unknown>);
          setCurrentChat(chat);
          setMessages(chat.messages);
          setTodos(chat.todos || []);
          setToolCalls(chat.toolCalls || []);
          setCurrentChatId(chatId);

          // Update the chats list cache with this chat's metadata
          queryClient.setQueryData(chatKeys.list(currentWorkspace.id), (old: Chat[] | undefined) => {
            if (!old) return old;
            const exists = old.find((c) => c.id === chatId);
            if (exists) {
              return old.map((c) => (c.id === chatId ? { ...c, messages: [] } : c));
            }
            return [{ ...chat, messages: [] }, ...old];
          });
        }
      } catch (err) {
        console.error("[ChatContext] Failed to load chat from API:", err);
        if (err instanceof Error && err.message.includes("Session expired")) {
          clearAuthState();
          queryClient.clear();
        }
      } finally {
        setIsLoading(false);
      }
    },
    [chats, isLoggedIn, currentWorkspace, isStreaming, clearAuthState, queryClient],
  );

  const deleteChat = useCallback(
    async (chatId: string) => {
      // Use the mutation hook's logic directly
      try {
        if (isLoggedIn) {
          await window.authAPI?.deleteChat(chatId);
        }
        // Invalidate queries to trigger refetch
        queryClient.invalidateQueries({ queryKey: ['chats', 'list'] });
        queryClient.removeQueries({ queryKey: chatKeys.detail(chatId) });

        if (currentChat?.id === chatId) {
          createNewChat();
        }
      } catch (err) {
        console.error("[ChatContext] Failed to delete chat:", err);
        if (err instanceof Error && err.message.includes("Session expired")) {
          clearAuthState();
          queryClient.clear();
        }
      }
    },
    [currentChat, isLoggedIn, createNewChat, clearAuthState, queryClient],
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isStreaming) return;

      const userMessage: Message = {
        id: generateId(),
        role: "user",
        content: content.trim(),
      };

      // Generate chat ID if new
      const chatId = currentChat?.id || generateId();
      const chatTitle =
        currentChat?.title ||
        (content.length > 30 ? content.substring(0, 30) + "..." : content);

      // Add user message
      setMessages((prev) => [...prev, userMessage]);

      // Create placeholder assistant message
      const assistantMessageId = generateId();
      setMessages((prev) => [
        ...prev,
        {
          id: assistantMessageId,
          role: "assistant",
          content: "",
          reasoning: "",
          inlineToolCalls: [],
        },
      ]);

      setIsStreaming(true);
      setIsLoading(true);

      try {
        const workspaceId = currentWorkspace?.id || null;
        const userId = window.authAPI?.getUser()?.id || null;

        if (!userId) {
          throw new Error("User not authenticated");
        }

        const response = await window.electronAPI.sendMessage(
          content,
          chatId,
          selectedProvider,
          selectedModel,
          workspaceId,
          userId,
        );

        const reader = await response.getReader();
        let fullContent = "";
        let fullReasoning = "";
        const pendingToolCalls = new Map<string, string>();

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
                      setMessages((prev) =>
                        prev.map((m) =>
                          m.id === assistantMessageId
                            ? { ...m, reasoning: fullReasoning }
                            : m,
                        ),
                      );
                    } else {
                      fullContent += data.content;
                      setMessages((prev) =>
                        prev.map((m) =>
                          m.id === assistantMessageId
                            ? { ...m, content: fullContent }
                            : m,
                        ),
                      );
                    }
                  }
                  break;

                case "tool_use":
                  if (data.name) {
                    const localToolId = generateId();

                    const toolCall: ToolCall = {
                      id: localToolId,
                      name: data.name,
                      input: data.input || {},
                      status: "running",
                    };
                    setToolCalls((prev) => [...prev, toolCall]);

                    if (data.id) {
                      pendingToolCalls.set(data.id, localToolId);
                    }

                    const inlineToolCall: InlineToolCall = {
                      id: localToolId,
                      name: data.name,
                      input: data.input || {},
                      status: "running",
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
                          : m,
                      ),
                    );

                    if (data.name === "TodoWrite" && data.input?.todos) {
                      setTodos(data.input.todos as Todo[]);
                    }
                  }
                  break;

                case "tool_result":
                  if (data.tool_use_id || data.result !== undefined) {
                    const apiToolId = data.tool_use_id;
                    const localId = apiToolId
                      ? pendingToolCalls.get(apiToolId)
                      : null;

                    if (localId) {
                      setToolCalls((prev) =>
                        prev.map((t) =>
                          t.id === localId
                            ? { ...t, status: "success", result: data.result }
                            : t,
                        ),
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
                                          status: "success",
                                          result: data.result,
                                        }
                                      : t,
                                  ) || [],
                              }
                            : m,
                        ),
                      );

                      pendingToolCalls.delete(apiToolId);
                    }
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

        // Final update - clean up empty fields
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== assistantMessageId) return m;
            return {
              ...m,
              reasoning: m.reasoning || undefined,
              inlineToolCalls: m.inlineToolCalls?.length
                ? m.inlineToolCalls
                : undefined,
            };
          }),
        );

        // Update current chat
        const finalMessages: Message[] = [
          ...messages.filter((m) => m.id !== assistantMessageId),
          userMessage,
          {
            id: assistantMessageId,
            role: "assistant",
            content: fullContent,
            reasoning: fullReasoning || undefined,
          },
        ];

        const updatedChat: Chat = {
          id: chatId,
          title: chatTitle,
          provider: selectedProvider,
          model: selectedModel,
          updatedAt: Date.now(),
          messages: finalMessages,
          todos,
          toolCalls,
        };

        setCurrentChat(updatedChat);
        setCurrentChatId(chatId);

        // Refresh chat list from server
        queryClient.invalidateQueries({ queryKey: ['chats', 'list'] });
      } catch (error) {
        console.error("[ChatContext] Send message error:", error);

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  content:
                    m.content +
                    `\n\n[Error: ${error instanceof Error ? error.message : "Unknown error"}]`,
                }
              : m,
          ),
        );

        if (
          error instanceof Error &&
          error.message.includes("Session expired")
        ) {
          clearAuthState();
          queryClient.clear();
        }
      } finally {
        setIsStreaming(false);
        setIsLoading(false);
      }
    },
    [
      currentChat,
      currentWorkspace,
      messages,
      selectedProvider,
      selectedModel,
      todos,
      toolCalls,
      isStreaming,
      clearAuthState,
      queryClient,
    ],
  );

  const stopStreaming = useCallback(async () => {
    if (!isStreaming || !currentChat) return;

    window.electronAPI.abortCurrentRequest();

    if (currentChat.id) {
      await window.electronAPI.stopQuery(currentChat.id, selectedProvider);
    }

    setIsStreaming(false);
  }, [isStreaming, currentChat, selectedProvider]);

  const setProvider = useCallback((provider: Provider) => {
    setProviderPreference(provider);
  }, [setProviderPreference]);

  const setModel = useCallback((model: string) => {
    setModelPreference(model);
  }, [setModelPreference]);

  const toggleThinkingMode = useCallback(() => {
    setThinkingMode((prev) => (prev === "normal" ? "extended" : "normal"));
  }, []);

  const value: ChatContextType = {
    chats,
    currentChat,
    messages,
    isLoading,
    isStreaming,
    todos,
    toolCalls,
    selectedProvider,
    selectedModel,
    thinkingMode,
    createNewChat,
    loadChat,
    deleteChat,
    sendMessage,
    stopStreaming,
    setProvider,
    setModel,
    toggleThinkingMode,
    refreshChats: async () => {
      await refreshChats();
    },
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
}
