/**
 * useCurrentChat - TanStack Query-powered chat loading
 *
 * Replaces the manual loading in useChatActions with TanStack Query.
 * Provides instant cached data + background refetching.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import type { Chat } from '@normie/types';
import { transformApiChat } from '@normie/utils';
import { chatApi } from '@/lib/api';
import { chatKeys } from './useChats';
import { setCurrentChatId } from '@/lib/storage';

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
