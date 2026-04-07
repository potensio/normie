/**
 * ChatContext - Stateless orchestrator combining chat hooks
 *
 * This context does NOT hold state. It only combines hooks and exposes
 * their values through a unified API. All logic is in hooks for testability.
 */
import { createContext, useContext, useState, useCallback } from "react";
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
  useChatSender,
  useCurrentChat,
  useChatNavigation,
  useChatDelete,
} from "@/hooks";

interface ChatContextType {
  // State
  chats: Chat[];
  currentChat: Chat | null;
  messages: Message[];
  isLoading: boolean;
  isFetching: boolean;
  isStreaming: boolean;
  error: Error | null;
  todos: Todo[];
  toolCalls: ToolCall[];
  selectedProvider: Provider;
  selectedModel: string;
  thinkingMode: ThinkingMode;

  // Actions
  createNewChat: () => void;
  loadChat: (chatId: string) => void;
  deleteChat: (chatId: string) => Promise<void>;
  sendMessage: (
    content: string,
    attachments?: Array<{
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
  prefetchChat: (chatId: string) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, currentWorkspace, user, clearAuthState } = useAuth();

  // TanStack Query for chats list
  const { data: chats = [], refetch: refreshChats } = useChats(
    currentWorkspace?.id,
  );

  // NEW: Non-blocking chat navigation
  const { currentChatId, navigateToChat, navigateToNewChat } =
    useChatNavigation();

  // NEW: TanStack Query-powered chat loading (instant cached data + background refetch)
  const {
    chat: currentChat,
    messages,
    todos,
    toolCalls,
    isLoading: isLoadingChat,
    isFetching: isFetchingChat,
    error: chatError,
    prefetchChat,
  } = useCurrentChat({
    workspaceId: currentWorkspace?.id,
    chatId: currentChatId,
    enabled: isLoggedIn,
  });

  // Preferences
  const {
    provider: selectedProvider,
    model: selectedModel,
    setProvider: setProviderPreference,
    setModel: setModelPreference,
  } = usePreferences();

  // Thinking mode (simple local state)
  const [thinkingMode, setThinkingMode] = useState<ThinkingMode>("normal");

  // Chat streaming (for new messages)
  const {
    messages: streamMessages,
    isStreaming,
    toolCalls: streamToolCalls,
    todos: streamTodos,
    sendMessage: sendStreamMessage,
    stopStreaming: stopStream,
    reset: resetStream,
  } = useChatStream();

  // Chat delete action
  const { deleteChat: deleteChatAction } = useChatDelete();

  // Combine messages: use stream messages when active, otherwise use loaded chat messages
  const displayMessages = streamMessages.length > 0 ? streamMessages : messages;
  const displayTodos = streamTodos.length > 0 ? streamTodos : (todos ?? []);
  const displayToolCalls =
    streamToolCalls.length > 0 ? streamToolCalls : (toolCalls ?? []);

  // Chat sender (for sending new messages)
  const { sendMessage: sendChatMessage } = useChatSender({
    currentChat,
    workspaceId: currentWorkspace?.id,
    provider: selectedProvider,
    model: selectedModel,
    userId: user?.id,
    messages: displayMessages,
    todos: displayTodos,
    toolCalls: displayToolCalls,
    isStreaming,
    sendStreamMessage,
    setCurrentChat: (chat) => {
      // Update currentChatId when a new chat is created
      if (chat && chat.id !== currentChatId) {
        navigateToChat(chat.id);
      }
    },
  });

  // Wrapped actions
  const createNewChat = useCallback(() => {
    resetStream();
    navigateToNewChat();
  }, [navigateToNewChat, resetStream]);

  const loadChat = useCallback(
    (chatId: string) => {
      resetStream();
      navigateToChat(chatId);
    },
    [navigateToChat, resetStream],
  );

  const deleteChat = useCallback(
    async (chatId: string) => {
      await deleteChatAction(chatId);
      // Navigate to new chat after delete if current was deleted
      if (currentChatId === chatId) {
        navigateToNewChat();
      }
    },
    [deleteChatAction, currentChatId, navigateToNewChat],
  );

  const sendMessage = useCallback(
    async (content: string, attachments?: Array<{ path: string }>) => {
      await sendChatMessage(content, attachments);
    },
    [sendChatMessage],
  );

  // Stop streaming wrapper
  const stopStreaming = useCallback(async () => {
    if (!isStreaming || !currentChatId) return;
    await stopStream(currentChatId, selectedProvider);
  }, [isStreaming, currentChatId, selectedProvider, stopStream]);

  // Provider/model setters
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

  // Combined loading state:
  // - isLoading: true only on first load when no cached data (shows skeleton)
  // - isFetching: true during any fetch including background refetch (subtle indicator)
  const isLoading = isLoadingChat && !currentChat;

  const value: ChatContextType = {
    chats,
    currentChat,
    messages: displayMessages,
    isLoading,
    isFetching: isFetchingChat,
    isStreaming,
    error: chatError,
    todos: displayTodos,
    toolCalls: displayToolCalls,
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
    prefetchChat,
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
