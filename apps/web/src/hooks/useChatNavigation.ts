/**
 * useChatNavigation - Navigation without data loading
 *
 * Manages which chat is "current" without blocking on data loading.
 * Data loading is handled separately by useCurrentChat via TanStack Query.
 */
import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { chatKeys } from './useChats';
import { setCurrentChatId } from '@/lib/storage';

interface UseChatNavigationReturn {
  currentChatId: string | null;
  navigateToChat: (chatId: string) => void;
  navigateToNewChat: () => void;
}

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
