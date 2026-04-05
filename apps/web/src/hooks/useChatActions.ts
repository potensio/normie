/**
 * useChatActions - Chat delete actions
 *
 * Simplified to only handle delete operations.
 * Chat loading is now handled by useCurrentChat (TanStack Query).
 */
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { chatKeys } from './useChats';
import { chatApi } from '@/lib/api';

interface UseChatActionsParams {
  isLoggedIn: boolean;
  onDelete: () => void;
}

interface UseChatActionsReturn {
  deleteChat: (chatId: string) => Promise<void>;
}

export function useChatActions(params: UseChatActionsParams): UseChatActionsReturn {
  const { isLoggedIn, onDelete } = params;
  const queryClient = useQueryClient();

  const deleteChat = useCallback(
    async (chatId: string) => {
      try {
        if (isLoggedIn) {
          await chatApi.delete(chatId);
        }
        queryClient.invalidateQueries({ queryKey: ['chats', 'list'] });
        queryClient.removeQueries({ queryKey: chatKeys.detail(chatId) });
        onDelete();
      } catch (err) {
        console.error('[useChatActions] Failed to delete chat:', err);
        throw err;
      }
    },
    [isLoggedIn, onDelete, queryClient],
  );

  return {
    deleteChat,
  };
}
