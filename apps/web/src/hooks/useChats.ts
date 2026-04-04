import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Chat, Provider } from '@normie/types';

// Query keys - centralized for easy invalidation
export const chatKeys = {
  all: ['chats'] as const,
  lists: () => [...chatKeys.all, 'list'] as const,
  list: (workspaceId: string) => [...chatKeys.lists(), workspaceId] as const,
  details: () => [...chatKeys.all, 'detail'] as const,
  detail: (chatId: string) => [...chatKeys.details(), chatId] as const,
};

// Transform API chat response to local Chat type
function transformApiChat(chat: Record<string, unknown>): Chat {
  return {
    id: String(chat.id),
    title: String(chat.title || 'New chat'),
    provider: String(chat.provider || 'claude') as Provider,
    model: String(chat.model || ''),
    sessionId: chat.sessionId ? String(chat.sessionId) : undefined,
    updatedAt: chat.updatedAt
      ? new Date(chat.updatedAt as string).getTime()
      : Date.now(),
    messages: (chat.messages as Chat['messages']) || [],
    todos: chat.todos as Chat['todos'],
    toolCalls: chat.toolCalls as Chat['toolCalls'],
  };
}

/**
 * Hook to fetch chats for a workspace
 */
export function useChats(workspaceId: string | null | undefined) {
  return useQuery({
    queryKey: chatKeys.list(workspaceId!),
    queryFn: async (): Promise<Chat[]> => {
      if (!workspaceId || !window.authAPI) return [];
      
      const chatsData = await window.authAPI.getChats(workspaceId);
      
      const transformedChats = chatsData.map((chat: Record<string, unknown>) => ({
        id: String(chat.id),
        title: String(chat.title || 'New chat'),
        provider: String(chat.provider || 'claude') as Provider,
        model: String(chat.model || ''),
        sessionId: chat.sessionId ? String(chat.sessionId) : undefined,
        updatedAt: chat.updatedAt
          ? new Date(chat.updatedAt as string).getTime()
          : Date.now(),
        messages: [], // Messages loaded separately
      }));
      
      // Sort by updated time (most recent first)
      return transformedChats.sort((a, b) => b.updatedAt - a.updatedAt);
    },
    enabled: !!workspaceId,
  });
}

/**
 * Hook to fetch a single chat with messages
 */
export function useChat(chatId: string | null | undefined) {
  return useQuery({
    queryKey: chatKeys.detail(chatId!),
    queryFn: async (): Promise<Chat | null> => {
      if (!chatId || !window.authAPI) return null;
      
      const chatData = await window.authAPI.getChat(chatId);
      if (!chatData) return null;
      
      return transformApiChat(chatData as Record<string, unknown>);
    },
    enabled: !!chatId,
  });
}

/**
 * Hook to delete a chat
 */
export function useDeleteChat() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (chatId: string) => {
      if (!window.authAPI) throw new Error('Auth API not available');
      await window.authAPI.deleteChat(chatId);
      return chatId;
    },
    onSuccess: (chatId, _variables, context) => {
      // Invalidate all chat lists to refetch
      queryClient.invalidateQueries({ queryKey: chatKeys.lists() });
      // Remove the specific chat from cache
      queryClient.removeQueries({ queryKey: chatKeys.detail(chatId) });
    },
  });
}