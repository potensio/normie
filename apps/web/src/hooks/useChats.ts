/**
 * Chat hooks - queries and mutations
 * 
 * All chat operations grouped in one file.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Chat, Provider } from '@normie/types';

// ============================================
// Query Keys
// ============================================

export const chatKeys = {
  all: ['chats'] as const,
  list: (workspaceId: string) => [...chatKeys.all, 'list', workspaceId] as const,
  detail: (chatId: string) => [...chatKeys.all, 'detail', chatId] as const,
};

// ============================================
// Helpers
// ============================================

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
      if (!chatId || !window.authAPI) return null;
      
      const chatData = await window.authAPI.getChat(chatId);
      if (!chatData) return null;
      
      return transformApiChat(chatData as Record<string, unknown>);
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
      if (!window.authAPI) throw new Error('Auth API not available');
      await window.authAPI.deleteChat(chatId);
      return chatId;
    },
    onSuccess: (chatId) => {
      // Invalidate chat lists and remove from cache
      queryClient.invalidateQueries({ queryKey: ['chats', 'list'] });
      queryClient.removeQueries({ queryKey: chatKeys.detail(chatId) });
    },
  });
}