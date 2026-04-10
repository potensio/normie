/**
 * Chat hooks - queries and mutations
 *
 * Handles fetching chat lists and CRUD operations.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { Chat } from "@normie/types";
import { transformApiChatLite } from "@normie/utils";
import { chatApi } from "@/lib/api";

// ============================================
// Query Keys
// ============================================

export const chatKeys = {
  all: ["chats"] as const,
  list: (workspaceId: string) =>
    [...chatKeys.all, "list", workspaceId] as const,
  detail: (chatId: string) => [...chatKeys.all, "detail", chatId] as const,
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
// Mutations
// ============================================

/**
 * Delete chat action
 */
export function useChatDelete() {
  const queryClient = useQueryClient();

  const deleteChat = useCallback(
    async (chatId: string) => {
      try {
        await chatApi.delete(chatId);
        queryClient.invalidateQueries({ queryKey: ["chats", "list"] });
        queryClient.removeQueries({ queryKey: chatKeys.detail(chatId) });
        return true;
      } catch (err) {
        console.error("[useChats] Failed to delete chat:", err);
        throw err;
      }
    },
    [queryClient],
  );

  return { deleteChat };
}
