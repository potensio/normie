/**
 * useChatSender - Send message orchestration
 * 
 * Extracted from ChatContext to keep context stateless.
 * Handles the logic of sending a message and updating state.
 */
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Chat, Message, Provider, Todo, ToolCall } from '@normie/types';
import { chatKeys } from './useChats';

interface UseChatSenderParams {
  currentChat: Chat | null;
  workspaceId: string | undefined;
  provider: Provider;
  model: string;
  userId: string | undefined;
  messages: Message[];
  todos: Todo[];
  toolCalls: ToolCall[];
  isStreaming: boolean;
  sendStreamMessage: (params: {
    content: string;
    chatId: string;
    chatTitle: string;
    provider: Provider;
    model: string;
    workspaceId: string | null;
    userId: string;
  }) => Promise<{ chatId: string; chatTitle: string } | null>;
  setCurrentChat: (chat: Chat | null) => void;
}

interface UseChatSenderReturn {
  sendMessage: (content: string) => Promise<void>;
}

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

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isStreaming || !userId) return;

      const chatId = currentChat?.id || crypto.randomUUID();
      const chatTitle =
        currentChat?.title ||
        (content.length > 30 ? content.substring(0, 30) + '...' : content);

      const result = await sendStreamMessage({
        content,
        chatId,
        chatTitle,
        provider,
        model,
        workspaceId: workspaceId || null,
        userId,
      });

      if (result) {
        // Filter out error messages for final state
        const finalMessages: Message[] = messages.filter((m) =>
          !m.content.startsWith('[Error:')
        );

        const updatedChat: Chat = {
          id: result.chatId,
          title: result.chatTitle,
          provider,
          model,
          updatedAt: Date.now(),
          messages: finalMessages,
          todos,
          toolCalls,
        };

        setCurrentChat(updatedChat);

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