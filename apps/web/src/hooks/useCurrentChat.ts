/**
 * useCurrentChat - TanStack Query hook for current chat
 */
import { useQuery } from "@tanstack/react-query";
import { chatApi } from "@/lib/api";
import type { Chat } from "@normie/types";
import { transformApiChat } from "@normie/utils";

export const chatKeys = {
  all: ["chats"] as const,
  list: (workspaceId: string) =>
    [...chatKeys.all, "list", workspaceId] as const,
  detail: (chatId: string) => [...chatKeys.all, "detail", chatId] as const,
};

/**
 * Fetch a single chat with messages
 */
export function useCurrentChat(chatId: string | null) {
  return useQuery({
    queryKey: chatKeys.detail(chatId!),
    queryFn: async (): Promise<Chat> => {
      const data = await chatApi.get(chatId!);
      return transformApiChat(data);
    },
    enabled: !!chatId,
    staleTime: 0, // Always consider stale so invalidation triggers refetch
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    // Fetch on mount only if we don't have data yet (existing chats)
    refetchOnMount: (query) => !query.state.data,
    refetchOnWindowFocus: false,
    // Don't retry 404s - they're expected for new chats
    retry: false,
  });
}
