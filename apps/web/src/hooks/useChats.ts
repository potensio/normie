/**
 * Chat hooks - queries, mutations, and navigation
 * 
 * All chat operations grouped in one file.
 * Split from useChatStream which handles streaming logic separately.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Chat, Message, Provider, Todo, ToolCall } from '@normie/types';
import { transformApiChat, transformApiChatLite } from '@normie/utils';
import { chatApi } from '@/lib/api';
import { setCurrentChatId } from '@/lib/storage';

// ============================================
// Query Keys
// ============================================

export const chatKeys = {
  all: ['chats'] as const,
  list: (workspaceId: string) => [...chatKeys.all, 'list', workspaceId] as const,
  detail: (chatId: string) => [...chatKeys.all, 'detail', chatId] as const,
};

// ============================================
// Queries
// ============================================

/**
 * Fetch chats for a workspace
 * 
 * @example
 * const { data: chats, isLoading } = useChats(workspaceId);
 */
export function useChats(workspaceId: string | null | undefined) {
  return useQuery({
    queryKey: chatKeys.list(workspaceId!),
    queryFn: async (): Promise<Chat[]> => {
      if (!workspaceId) return [];
      
      const chatsData = await chatApi.list(workspaceId);
      
      // Transform and sort by updated time (most recent first)
      return chatsData
        .map(transformApiChatLite)
        .sort((a, b) => b.updatedAt - a.updatedAt);
    },
    enabled: !!workspaceId,
  });
}

// ============================================
// Current Chat (TanStack Query-powered)
// ============================================

interface UseCurrentChatParams {
  workspaceId: string | undefined;
  chatId: string | null;
  enabled: boolean;
}

interface UseCurrentChatReturn {
  chat: Chat | null;
  messages: Chat['messages'];
  todos: Chat['todos'];
  toolCalls: Chat['toolCalls'];
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
  prefetchChat: (id: string) => void;
}

/**
 * Fetch current chat with messages via TanStack Query.
 * Provides instant cached data + background refetching.
 */
export function useCurrentChat(params: UseCurrentChatParams): UseCurrentChatReturn {
  const { workspaceId, chatId, enabled } = params;
  const queryClient = useQueryClient();

  // Query for chat details with messages
  const {
    data: chat,
    isLoading: isLoadingChat,
    isFetching: isFetchingChat,
    error,
  } = useQuery({
    queryKey: chatKeys.detail(chatId!),
    queryFn: async (): Promise<Chat | null> => {
      if (!chatId) return null;
      const chatData = await chatApi.get(chatId);
      return transformApiChat(chatData);
    },
    enabled: enabled && !!chatId,
    staleTime: 5 * 60 * 1000, // 5 minutes - chat data doesn't change often
    gcTime: 10 * 60 * 1000, // Keep in garbage collection for 10 minutes
  });

  // Update localStorage when chat changes
  useEffect(() => {
    if (chatId) {
      setCurrentChatId(chatId);
    }
  }, [chatId]);

  // Prefetch a chat for instant navigation
  const prefetchChat = useCallback(
    (id: string) => {
      if (!id) return;
      queryClient.prefetchQuery({
        queryKey: chatKeys.detail(id),
        queryFn: () => chatApi.get(id),
        staleTime: 5 * 60 * 1000,
      });
    },
    [queryClient]
  );

  return {
    chat: chat ?? null,
    messages: chat?.messages ?? [],
    todos: chat?.todos ?? [],
    toolCalls: chat?.toolCalls ?? [],
    isLoading: isLoadingChat,
    isFetching: isFetchingChat,
    error: error as Error | null,
    prefetchChat,
  };
}

// ============================================
// Navigation
// ============================================

interface UseChatNavigationReturn {
  currentChatId: string | null;
  navigateToChat: (chatId: string) => void;
  navigateToNewChat: () => void;
}

/**
 * Manages which chat is "current" without blocking on data loading.
 * Data loading is handled by useCurrentChat via TanStack Query.
 */
export function useChatNavigation(): UseChatNavigationReturn {
  const queryClient = useQueryClient();
  const [currentChatId, setCurrentChatIdState] = useState<string | null>(null);

  const navigateToChat = useCallback((chatId: string) => {
    // Instant - no waiting for data
    setCurrentChatIdState(chatId);
    setCurrentChatId(chatId);

    // Prefetch for instant feel if not already cached
    queryClient.prefetchQuery({
      queryKey: chatKeys.detail(chatId),
      queryFn: async () => {
        const { chatApi } = await import('@/lib/api');
        return chatApi.get(chatId);
      },
      staleTime: 5 * 60 * 1000,
    });
  }, [queryClient]);

  const navigateToNewChat = useCallback(() => {
    setCurrentChatIdState(null);
    setCurrentChatId(null);
  }, []);

  return {
    currentChatId,
    navigateToChat,
    navigateToNewChat,
  };
}

// ============================================
// Mutations
// ============================================

/**
 * Delete a chat
 */
export function useDeleteChat() {
  const queryClient = useQueryClient();
  
  return useQuery({
    queryKey: ['chatDelete'],
    queryFn: async () => {
      // This is just a trigger for the mutation
      return null;
    },
    enabled: false,
  });
}

/**
 * Delete chat action (imperative)
 */
export function useChatDelete() {
  const queryClient = useQueryClient();
  
  const deleteChat = useCallback(async (chatId: string) => {
    try {
      await chatApi.delete(chatId);
      queryClient.invalidateQueries({ queryKey: ['chats', 'list'] });
      queryClient.removeQueries({ queryKey: chatKeys.detail(chatId) });
      return true;
    } catch (err) {
      console.error('[useChats] Failed to delete chat:', err);
      throw err;
    }
  }, [queryClient]);

  return { deleteChat };
}

// ============================================
// Message Sending Orchestration
// ============================================

interface UseChatSenderParams {
  currentChat: Chat | null;
  workspaceId: string | undefined;
  provider: Provider;
  model: string;
  userId: string | undefined;
  messages: Message[];
  todos?: Todo[];
  toolCalls?: ToolCall[];
  isStreaming: boolean;
  sendStreamMessage: (
    params: {
      content: string;
      chatId: string;
      chatTitle: string;
      provider: Provider;
      model: string;
      workspaceId: string | null;
      userId: string;
      attachments?: Array<{
        filename: string;
        originalName: string;
        mimeType: string;
        size: number;
        storagePath: string;
      }>;
    },
    callbacks?: {
      onTitleUpdate?: (title: string) => void;
    }
  ) => Promise<{ chatId: string; chatTitle: string } | null>;
  setCurrentChat: (chat: Chat | null) => void;
}

interface UseChatSenderReturn {
  sendMessage: (content: string, attachments?: Array<{
    filename: string;
    originalName: string;
    mimeType: string;
    size: number;
    storagePath: string;
  }>) => Promise<void>;
}

/**
 * Handles the logic of sending a message and updating state.
 */
export function useChatSender(params: UseChatSenderParams): UseChatSenderReturn {
  const {
    currentChat,
    workspaceId,
    provider,
    model,
    userId,
    messages,
    todos,
    toolCalls,
    isStreaming,
    sendStreamMessage,
    setCurrentChat,
  } = params;

  const queryClient = useQueryClient();
  const generatedTitleRef = useRef<string | null>(null);

  const sendMessage = useCallback(
    async (
      content: string,
      attachments?: Array<{
        filename: string;
        originalName: string;
        mimeType: string;
        size: number;
        storagePath: string;
      }>
    ) => {
      if (!content.trim() || isStreaming || !userId) return;

      const chatId = currentChat?.id || crypto.randomUUID();
      const chatTitle =
        currentChat?.title ||
        (content.length > 30 ? content.substring(0, 30) + '...' : content);

      const result = await sendStreamMessage(
        {
          content,
          chatId,
          chatTitle,
          provider,
          model,
          workspaceId: workspaceId || null,
          userId,
          attachments,
        },
        {
          onTitleUpdate: (title) => {
            generatedTitleRef.current = title;
          },
        }
      );

      if (result) {
        // Filter out error messages for final state
        const finalMessages: Message[] = messages.filter((m) =>
          m.content ? !m.content.startsWith('[Error:') : true
        );

        const finalTitle = generatedTitleRef.current || result.chatTitle;

        const updatedChat: Chat = {
          id: result.chatId,
          title: finalTitle,
          provider,
          model,
          updatedAt: Date.now(),
          messages: finalMessages,
          todos,
          toolCalls,
        };

        setCurrentChat(updatedChat);
        generatedTitleRef.current = null;

        // Refresh chat list from server
        queryClient.invalidateQueries({ queryKey: ['chats', 'list'] });
      }
    },
    [
      currentChat,
      workspaceId,
      provider,
      model,
      userId,
      messages,
      todos,
      toolCalls,
      isStreaming,
      sendStreamMessage,
      setCurrentChat,
      queryClient,
    ],
  );

  return { sendMessage };
}