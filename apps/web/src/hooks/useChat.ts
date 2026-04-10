/**
 * useChat - TanStack Mutation for sending messages with optimistic updates
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { chatApi } from "@/lib/api";
import { chatKeys } from "./useCurrentChat";
import type { Provider, Message } from "@normie/types";
import { generateId } from "@normie/utils";

interface SendMessageParams {
  content: string;
  chatId: string;
  provider: Provider;
  model: string;
  workspaceId: string | null;
  userId: string;
  attachments?: Array<{
    id: string;
    filename: string;
    originalName: string;
    mimeType: string;
    size: number;
    storagePath: string;
  }>;
}

export function useChat() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: SendMessageParams) => {
      // Convert attachments to paths for API
      const attachmentPaths = params.attachments?.map((a) => ({
        path: a.storagePath,
      }));

      return await chatApi.sendMessage({
        ...params,
        attachments: attachmentPaths,
      });
    },
    onMutate: async (variables) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({
        queryKey: chatKeys.detail(variables.chatId),
      });

      // Snapshot previous value
      const previousChat = queryClient.getQueryData(
        chatKeys.detail(variables.chatId),
      );

      // Generate stable IDs that will be used by both client and server
      const userMessageId = generateId();
      const assistantMessageId = generateId();

      // Create optimistic user message
      const userMessage: Message = {
        id: userMessageId,
        role: "user",
        blocks: [{ type: "text", content: variables.content.trim() }],
        attachments: variables.attachments,
      };

      // Create optimistic assistant message (loading state)
      const assistantMessage: Message = {
        id: assistantMessageId,
        role: "assistant",
        blocks: [{ type: "text", content: "" }],
      };

      // Optimistically update or create chat data
      queryClient.setQueryData(
        chatKeys.detail(variables.chatId),
        (old: any) => {
          // If chat doesn't exist yet, create it optimistically
          if (!old) {
            return {
              id: variables.chatId,
              title: "New Chat",
              provider: variables.provider,
              model: variables.model,
              workspaceId: variables.workspaceId,
              userId: variables.userId,
              messages: [userMessage, assistantMessage],
              todos: [],
              toolCalls: [],
              updatedAt: Date.now(),
            };
          }

          // If chat exists, append messages
          return {
            ...old,
            messages: [...(old.messages || []), userMessage, assistantMessage],
          };
        },
      );

      return { previousChat, userMessageId, assistantMessageId };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousChat) {
        queryClient.setQueryData(
          chatKeys.detail(variables.chatId),
          context.previousChat,
        );
      } else {
        // If there was no previous chat, remove the optimistic one
        queryClient.removeQueries({
          queryKey: chatKeys.detail(variables.chatId),
        });
      }
    },
    onSuccess: (data, variables, context) => {
      // Update the assistant message with the real response
      queryClient.setQueryData(
        chatKeys.detail(variables.chatId),
        (old: any) => {
          if (!old) return old;

          // Find the last assistant message (the optimistic one) and update it
          const messages = [...(old.messages || [])];

          // Find last assistant message by iterating backwards
          for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === "assistant") {
              messages[i] = {
                ...messages[i],
                blocks: [{ type: "text", content: data.response }],
              };
              break;
            }
          }

          return {
            ...old,
            title: data.title || old.title,
            messages,
          };
        },
      );

      // Invalidate chat list to show new/updated chat
      queryClient.invalidateQueries({
        queryKey: ["chats", "list"],
      });
    },
  });
}
