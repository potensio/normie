/**
 * ChatContext - Clean implementation
 *
 * Single source of truth for chat state.
 * Stream messages are the live state, server messages are loaded on mount.
 */
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import type {
  Chat,
  Message,
  Provider,
  ToolCall,
  Todo,
  ThinkingMode,
} from "@normie/types";
import { useAuth } from "./AuthContext";
import {
  useChats,
  usePreferences,
  useChatStream,
  useChatDelete,
} from "@/hooks";
import { chatApi } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

interface ChatContextType {
  // State
  chats: Chat[];
  currentChatId: string | null;
  messages: Message[];
  isLoading: boolean;
  isStreaming: boolean;
  error: Error | null;
  todos: Todo[];
  toolCalls: ToolCall[];
  selectedProvider: Provider;
  selectedModel: string;
  thinkingMode: ThinkingMode;

  // Actions
  createNewChat: () => void;
  deleteChat: (chatId: string) => Promise<void>;
  sendMessage: (
    content: string,
    attachments?: Array<{
      id: string;
      filename: string;
      originalName: string;
      mimeType: string;
      size: number;
      storagePath: string;
    }>,
  ) => Promise<void>;
  stopStreaming: () => void;
  setProvider: (provider: Provider) => void;
  setModel: (model: string) => void;
  toggleThinkingMode: () => void;
  refreshChats: () => Promise<void>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, currentWorkspace, user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const routerState = useRouterState();

  // Extract chatId from URL
  const currentChatId = routerState.location.pathname.startsWith("/c/")
    ? routerState.location.pathname.split("/c/")[1]
    : null;

  // Chats list
  const { data: chats = [], refetch: refreshChats } = useChats(
    currentWorkspace?.id,
  );

  // Preferences
  const {
    provider: selectedProvider,
    model: selectedModel,
    setProvider: setProviderPreference,
    setModel: setModelPreference,
  } = usePreferences();

  // Thinking mode
  const [thinkingMode, setThinkingMode] = useState<ThinkingMode>("normal");

  // Chat streaming
  const {
    messages: streamMessages,
    isStreaming,
    toolCalls: streamToolCalls,
    todos: streamTodos,
    sendMessage: sendStreamMessage,
    stopStreaming: stopStream,
    reset: resetStream,
    loadMessages,
  } = useChatStream();

  // Chat delete
  const { deleteChat: deleteChatAction } = useChatDelete();

  // Server messages (loaded once when chat changes)
  const [serverMessages, setServerMessages] = useState<Message[]>([]);
  const [serverTodos, setServerTodos] = useState<Todo[]>([]);
  const [serverToolCalls, setServerToolCalls] = useState<ToolCall[]>([]);
  const [isLoadingChat, setIsLoadingChat] = useState(false);

  // Load chat from server when chatId changes
  useEffect(() => {
    if (!currentChatId || isStreaming) return;

    let cancelled = false;
    setIsLoadingChat(true);

    chatApi
      .get(currentChatId)
      .then((chat) => {
        if (cancelled) return;
        setServerMessages(chat.messages || []);
        setServerTodos(chat.todos || []);
        setServerToolCalls(chat.toolCalls || []);

        // Load into stream state for continuity
        loadMessages({
          messages: chat.messages || [],
          todos: chat.todos || [],
          toolCalls: chat.toolCalls || [],
        });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[ChatContext] Failed to load chat:", err);
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoadingChat(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentChatId, isStreaming, loadMessages]);

  // Clear server state when leaving a chat
  useEffect(() => {
    if (!currentChatId) {
      setServerMessages([]);
      setServerTodos([]);
      setServerToolCalls([]);
      resetStream();
    }
  }, [currentChatId, resetStream]);

  // Display state: always use stream messages (they're loaded from server on mount)
  const messages = streamMessages;
  const todos = streamTodos;
  const toolCalls = streamToolCalls;

  // Actions
  const createNewChat = useCallback(() => {
    resetStream();
    navigate({ to: "/" });
  }, [navigate, resetStream]);

  const deleteChat = useCallback(
    async (chatId: string) => {
      await deleteChatAction(chatId);
      if (currentChatId === chatId) {
        navigate({ to: "/" });
      }
    },
    [deleteChatAction, currentChatId, navigate],
  );

  const sendMessage = useCallback(
    async (
      content: string,
      attachments?: Array<{
        id: string;
        filename: string;
        originalName: string;
        mimeType: string;
        size: number;
        storagePath: string;
      }>,
    ) => {
      if (!content.trim() || isStreaming || !user?.id) return;

      // Generate chatId if new chat
      const chatId = currentChatId || crypto.randomUUID();
      const chatTitle =
        content.length > 30 ? content.substring(0, 30) + "..." : content;

      // Navigate to chat immediately if new
      if (!currentChatId) {
        navigate({ to: "/c/$chatId", params: { chatId } });
      }

      // Start streaming
      const result = await sendStreamMessage(
        {
          content,
          chatId,
          chatTitle,
          provider: selectedProvider,
          model: selectedModel,
          workspaceId: currentWorkspace?.id || null,
          userId: user.id,
          attachments,
        },
        {
          onTitleUpdate: (title) => {
            // Update chat list with new title
            queryClient.setQueryData(
              ["chats", "list", currentWorkspace?.id],
              (old: any) => {
                if (!old?.chats) return old;
                return {
                  ...old,
                  chats: old.chats.map((chat: any) =>
                    chat.id === chatId ? { ...chat, title } : chat,
                  ),
                };
              },
            );
          },
        },
      );

      // Refresh chat list after completion
      if (result) {
        await refreshChats();
      }
    },
    [
      currentChatId,
      isStreaming,
      user,
      selectedProvider,
      selectedModel,
      currentWorkspace,
      navigate,
      sendStreamMessage,
      queryClient,
      refreshChats,
    ],
  );

  const stopStreaming = useCallback(async () => {
    if (!isStreaming || !currentChatId) return;
    await stopStream(currentChatId, selectedProvider);
  }, [isStreaming, currentChatId, selectedProvider, stopStream]);

  const setProvider = useCallback(
    (provider: Provider) => {
      setProviderPreference(provider);
    },
    [setProviderPreference],
  );

  const setModel = useCallback(
    (model: string) => {
      setModelPreference(model);
    },
    [setModelPreference],
  );

  const toggleThinkingMode = useCallback(() => {
    setThinkingMode((prev) => (prev === "normal" ? "extended" : "normal"));
  }, []);

  const value: ChatContextType = {
    chats,
    currentChatId,
    messages,
    isLoading: isLoadingChat,
    isStreaming,
    error: null,
    todos,
    toolCalls,
    selectedProvider,
    selectedModel,
    thinkingMode,
    createNewChat,
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
