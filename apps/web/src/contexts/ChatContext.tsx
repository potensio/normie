import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
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
import { DEFAULT_PROVIDER, getDefaultModel, isValidModel } from "@/lib/constants";
import { useAuth } from "./AuthContext";

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

// Preference keys
const PREFERRED_PROVIDER_KEY = "selectedProvider";
const PREFERRED_MODEL_KEY = "selectedModel";

// Valid providers list for validation
const VALID_PROVIDERS: Provider[] = ["claude", "opencode", "kimi", "bedrock"];

/**
 * Get saved provider preference with validation.
 * Clears invalid preferences from localStorage.
 */
function getPreferredProvider(): Provider {
  const saved = localStorage.getItem(PREFERRED_PROVIDER_KEY) as Provider;
  if (saved && VALID_PROVIDERS.includes(saved)) {
    return saved;
  }
  // Clear invalid preference
  if (saved) {
    localStorage.removeItem(PREFERRED_PROVIDER_KEY);
  }
  return DEFAULT_PROVIDER;
}

/**
 * Get saved model preference with validation.
 * Clears invalid preferences from localStorage.
 */
function getPreferredModel(provider: Provider): string {
  const saved = localStorage.getItem(PREFERRED_MODEL_KEY);
  if (saved && isValidModel(provider, saved)) {
    return saved;
  }
  // Clear invalid preference
  if (saved) {
    localStorage.removeItem(PREFERRED_MODEL_KEY);
  }
  return getDefaultModel(provider);
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, currentWorkspace, logout } = useAuth();

  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChat, setCurrentChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  const [selectedProvider, setSelectedProvider] =
    useState<Provider>(getPreferredProvider());
  const [selectedModel, setSelectedModel] = useState<string>(
    getPreferredModel(getPreferredProvider()),
  );
  const [thinkingMode, setThinkingMode] = useState<ThinkingMode>("normal");

  // Abort controller for streaming
  const abortControllerRef = React.useRef<AbortController | null>(null);

  // Load chats on mount and when workspace changes
  useEffect(() => {
    if (isLoggedIn && currentWorkspace) {
      refreshChats();
    } else {
      // Load from localStorage as fallback
      const saved = localStorage.getItem("allChats");
      if (saved) {
        try {
          setChats(JSON.parse(saved));
        } catch {
          setChats([]);
        }
      }
    }
  }, [isLoggedIn, currentWorkspace]);

  const refreshChats = useCallback(async () => {
    if (!window.authAPI || !currentWorkspace) return;

    try {
      const chatsData = await window.authAPI.getChats(currentWorkspace.id);
      // Transform API response - each chat already has the right shape
      const transformedChats = chatsData.map(
        (chat: Record<string, unknown>) => ({
          id: String(chat.id),
          title: String(chat.title || "New chat"),
          provider: String(chat.provider || "claude") as Provider,
          model: String(chat.model || ""),
          sessionId: chat.sessionId ? String(chat.sessionId) : undefined,
          updatedAt: chat.updatedAt
            ? new Date(chat.updatedAt as string).getTime()
            : Date.now(),
          messages: [], // Messages loaded separately
        }),
      );

      // Sort by updated time (most recent first)
      transformedChats.sort((a: Chat, b: Chat) => b.updatedAt - a.updatedAt);
      setChats(transformedChats);
    } catch (err) {
      console.error("[ChatContext] Failed to load chats:", err);
      // If session expired, logout
      if (err instanceof Error && err.message.includes("Session expired")) {
        logout();
      }
    }
  }, [currentWorkspace, logout]);

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

    // Reset to saved preferences with validation
    const provider = getPreferredProvider();
    const model = getPreferredModel(provider);
    setSelectedProvider(provider);
    setSelectedModel(model);

    localStorage.removeItem("currentChatId");
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
        // Use cached version (instant)
        setCurrentChat(cachedChat);
        setMessages(cachedChat.messages);
        setTodos(cachedChat.todos || []);
        setToolCalls(cachedChat.toolCalls || []);

        // Update current state (but don't update preferences - user's choice should persist)
        if (cachedChat.provider) {
          setSelectedProvider(cachedChat.provider);
        }
        if (cachedChat.model) {
          setSelectedModel(cachedChat.model);
        }

        localStorage.setItem("currentChatId", chatId);
        return;
      }

      // If not cached or empty, load from API
      let chat: Chat | null = null;
      if (isLoggedIn && currentWorkspace) {
        try {
          const chatData = await window.authAPI?.getChat(chatId);
          if (chatData) {
            chat = transformApiChat(chatData as Record<string, unknown>);

            // Cache the loaded chat
            setChats((prev) => {
              const index = prev.findIndex((c) => c.id === chatId);
              if (index !== -1) {
                const updated = [...prev];
                updated[index] = chat!;
                return updated;
              }
              return prev;
            });
          }
        } catch (err) {
          console.error("[ChatContext] Failed to load chat from API:", err);
          if (err instanceof Error && err.message.includes("Session expired")) {
            logout();
            return;
          }
        }
      }

      if (chat) {
        setCurrentChat(chat);
        setMessages(chat.messages);
        setTodos(chat.todos || []);
        setToolCalls(chat.toolCalls || []);

        // Restore provider/model for current session (but don't update preferences)
        if (chat.provider) {
          setSelectedProvider(chat.provider);
        }
        if (chat.model) {
          setSelectedModel(chat.model);
        }

        localStorage.setItem("currentChatId", chatId);
      }
    },
    [chats, isLoggedIn, currentWorkspace, isStreaming, logout],
  );

  const deleteChat = useCallback(
    async (chatId: string) => {
      // Delete from API
      if (isLoggedIn) {
        try {
          await window.authAPI?.deleteChat(chatId);
        } catch (err) {
          console.error("[ChatContext] Failed to delete chat from API:", err);
          if (err instanceof Error && err.message.includes("Session expired")) {
            logout();
            return;
          }
          // Continue with local deletion anyway
        }
      }

      // Remove from local state
      setChats((prev) => prev.filter((c) => c.id !== chatId));

      if (currentChat?.id === chatId) {
        createNewChat();
      }
    },
    [currentChat, isLoggedIn, createNewChat, logout],
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
        const pendingToolCalls = new Map<string, string>(); // API tool ID -> local tool ID

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          if (!value) continue;

          // Parse SSE data
          const lines = value.split("\n");
          for (const line of lines) {
            if (line.startsWith(":")) continue; // Skip heartbeat comments
            if (!line.startsWith("data: ")) continue;

            try {
              const data = JSON.parse(line.slice(6));

              switch (data.type) {
                case "text":
                  if (data.content) {
                    if (data.isReasoning) {
                      // Accumulate reasoning content
                      fullReasoning += data.content;
                      setMessages((prev) =>
                        prev.map((m) =>
                          m.id === assistantMessageId
                            ? { ...m, reasoning: fullReasoning }
                            : m,
                        ),
                      );
                    } else {
                      // Regular content
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

                    // Create tool call for sidebar
                    const toolCall: ToolCall = {
                      id: localToolId,
                      name: data.name,
                      input: data.input || {},
                      status: "running",
                    };
                    setToolCalls((prev) => [...prev, toolCall]);

                    // Track correlation if API provided an ID
                    if (data.id) {
                      pendingToolCalls.set(data.id, localToolId);
                    }

                    // Add inline tool call to the message
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

                    // Handle TodoWrite
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
                      // Update sidebar tool call
                      setToolCalls((prev) =>
                        prev.map((t) =>
                          t.id === localId
                            ? { ...t, status: "success", result: data.result }
                            : t,
                        ),
                      );

                      // Update inline tool call
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
            } catch (parseErr) {
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

        // Update or create chat in local state
        const finalMessages: Message[] = [
          ...messages,
          userMessage,
          {
            id: assistantMessageId,
            role: "assistant",
            content: fullContent,
            reasoning: fullReasoning || undefined,
            inlineToolCalls: undefined, // Don't persist inline tool calls in saved state
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

        // Update chats list
        setChats((prev) => {
          const exists = prev.find((c) => c.id === chatId);
          if (exists) {
            return prev.map((c) =>
              c.id === chatId ? { ...updatedChat, messages: [] } : c,
            );
          }
          return [{ ...updatedChat, messages: [] }, ...prev];
        });

        // Refresh chat list from server to get the saved version
        await refreshChats();
      } catch (error) {
        console.error("[ChatContext] Send message error:", error);

        // Update assistant message with error
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

        // If session expired, logout
        if (
          error instanceof Error &&
          error.message.includes("Session expired")
        ) {
          logout();
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
      refreshChats,
      logout,
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
    setSelectedProvider(provider);
    const defaultModel = getDefaultModel(provider);
    setSelectedModel(defaultModel);
    localStorage.setItem(PREFERRED_PROVIDER_KEY, provider);
    localStorage.setItem(PREFERRED_MODEL_KEY, defaultModel);
  }, []);

  const setModel = useCallback((model: string) => {
    setSelectedModel(model);
    localStorage.setItem(PREFERRED_MODEL_KEY, model);
  }, []);

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
    refreshChats,
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
