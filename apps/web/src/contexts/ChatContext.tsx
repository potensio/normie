/**
 * ChatContext - Stateless orchestrator combining chat hooks
 * 
 * This context does NOT hold state. It only combines hooks and exposes
 * their values through a unified API. All logic is in hooks for testability.
 */
import { createContext, useContext, useState, useCallback } from 'react';
import type { Chat, Message, Provider, ToolCall, Todo, ThinkingMode } from '@normie/types';
import { useAuth } from './AuthContext';
import { useChats, usePreferences, useChatStream, useChatActions, useChatSender } from '@/hooks';
import { setCurrentChatId } from '@/lib/storage';

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
  const { isLoggedIn, currentWorkspace, user, clearAuthState } = useAuth();

  // TanStack Query for chats list
  const { data: chats = [], refetch: refreshChats } = useChats(currentWorkspace?.id);

  // Preferences
  const {
    provider: selectedProvider,
    model: selectedModel,
    setProvider: setProviderPreference,
    setModel: setModelPreference,
  } = usePreferences();

  // Thinking mode (simple local state)
  const [thinkingMode, setThinkingMode] = useState<ThinkingMode>('normal');

  // Chat streaming
  const {
    messages,
    isStreaming,
    toolCalls,
    todos,
    sendMessage: sendStreamMessage,
    stopStreaming: stopStream,
    loadMessages,
    reset: resetStream,
  } = useChatStream();

  // Chat actions
  const {
    currentChat,
    isLoading,
    createNewChat,
    loadChat,
    deleteChat,
    setCurrentChat,
  } = useChatActions({
    workspaceId: currentWorkspace?.id,
    isLoggedIn,
    chats,
    isStreaming,
    abortStreaming: () => stopStream(currentChat?.id || '', selectedProvider),
    clearAuthState,
    onChatLoaded: (chat) => loadMessages(chat),
    reset: resetStream,
  });

  // Chat sender (extracted orchestration logic)
  const { sendMessage } = useChatSender({
    currentChat,
    workspaceId: currentWorkspace?.id,
    provider: selectedProvider,
    model: selectedModel,
    userId: user?.id,
    messages,
    todos,
    toolCalls,
    isStreaming,
    sendStreamMessage,
    setCurrentChat,
  });

  // Stop streaming wrapper
  const stopStreaming = useCallback(async () => {
    if (!isStreaming || !currentChat) return;
    await stopStream(currentChat.id, selectedProvider);
  }, [isStreaming, currentChat, selectedProvider, stopStream]);

  // Provider/model setters
  const setProvider = useCallback((provider: Provider) => {
    setProviderPreference(provider);
  }, [setProviderPreference]);

  const setModel = useCallback((model: string) => {
    setModelPreference(model);
  }, [setModelPreference]);

  const toggleThinkingMode = useCallback(() => {
    setThinkingMode((prev) => (prev === 'normal' ? 'extended' : 'normal'));
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
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}