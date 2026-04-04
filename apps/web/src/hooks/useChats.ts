/**
 * Chat hooks - queries and mutations
 * 
 * All chat operations grouped in one file.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Chat } from '@normie/types';
import { transformApiChatLite } from '@normie/utils';
import { chatApi } from '@/lib/api';

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

/**
 * Fetch a single chat with messages
 * Note: This is named useChatDetail to avoid collision with useChat() from ChatContext
 * 
 * @example
 * const { data: chat } = useChatDetail(chatId);
 */
export function useChatDetail(chatId: string | null | undefined) {
  return useQuery({
    queryKey: chatKeys.detail(chatId!),
    queryFn: async (): Promise<Chat | null> => {
      if (!chatId) return null;
      
      const chatData = await chatApi.get(chatId);
      return transformApiChatLite(chatData);
    },
    enabled: !!chatId,
  });
}

// ============================================
// Mutations
// ============================================

/**
 * Delete a chat
 * 
 * @example
 * const { mutate: deleteChat } = useDeleteChat();
 * deleteChat(chatId);
 */
export function useDeleteChat() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (chatId: string) => {
      await chatApi.delete(chatId);
      return chatId;
    },
    onSuccess: (chatId) => {
      // Invalidate chat lists and remove from cache
      queryClient.invalidateQueries({ queryKey: ['chats', 'list'] });
      queryClient.removeQueries({ queryKey: chatKeys.detail(chatId) });
    },
  });
}