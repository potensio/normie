/**
 * ChatContext - Thin orchestrator combining chat hooks
 * 
 * This context provides a unified interface for chat operations.
 * All logic is extracted to hooks for testability and separation of concerns.
 */
import { createContext, useContext, useCallback, useState } from 'react';
import type { Chat, Message, Provider, ToolCall, Todo, ThinkingMode } from '@normie/types';
import { useAuth } from './AuthContext';
import { useChats, usePreferences, useChatStream, useChatActions } from '@/hooks';
import { setCurrentChatId } from '@/lib/storage';
import { useQueryClient } from '@tanstack/react-query';

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
    setMessages,
    setToolCalls,
    setTodos,
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
    onChatLoaded: (chat) => {
      setMessages(chat.messages);
      setTodos(chat.todos || []);
      setToolCalls(chat.toolCalls || []);
    },
    reset: resetStream,
  });

  // Send message wrapper
  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isStreaming) return;

      const chatId = currentChat?.id || crypto.randomUUID();
      const chatTitle =
        currentChat?.title ||
        (content.length > 30 ? content.substring(0, 30) + '...' : content);

      const userId = window.authAPI?.getUser()?.id;
      if (!userId) return;

      const result = await sendStreamMessage({
        content,
        chatId,
        chatTitle,
        provider: selectedProvider,
        model: selectedModel,
        workspaceId: currentWorkspace?.id || null,
        userId,
      });

      if (result) {
        // Update current chat
        const finalMessages: Message[] = messages.filter((m) => 
          !m.content.startsWith('[Error:')
        );

        const updatedChat: Chat = {
          id: result.chatId,
          title: result.chatTitle,
          provider: selectedProvider,
          model: selectedModel,
          updatedAt: Date.now(),
          messages: finalMessages,
          todos,
          toolCalls,
        };

        setCurrentChat(updatedChat);
        setCurrentChatId(result.chatId);

        // Refresh chat list from server
        queryClient.invalidateQueries({ queryKey: ['chats', 'list'] });
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
      sendStreamMessage,
      setCurrentChat,
      queryClient,
    ],
  );

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