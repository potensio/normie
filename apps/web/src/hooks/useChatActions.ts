/**
 * useChatActions - Chat CRUD actions
 * 
 * Handles creating, loading, and deleting chats.
 */
import { useState, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Chat, Message, Todo, ToolCall } from '@normie/types';
import { transformApiChat } from '@normie/utils';
import { chatKeys } from './useChats';
import { setCurrentChatId, getCurrentChatId } from '@/lib/storage';

interface UseChatActionsParams {
  workspaceId: string | undefined;
  isLoggedIn: boolean;
  chats: Chat[];
  isStreaming: boolean;
  abortStreaming: () => void;
  clearAuthState: () => void;
  onChatLoaded: (chat: Chat) => void;
  reset: () => void;
}

interface UseChatActionsReturn {
  currentChat: Chat | null;
  isLoading: boolean;
  createNewChat: () => void;
  loadChat: (chatId: string) => Promise<void>;
  deleteChat: (chatId: string) => Promise<void>;
  setCurrentChat: (chat: Chat | null) => void;
}

export function useChatActions(params: UseChatActionsParams): UseChatActionsReturn {
  const {
    workspaceId,
    isLoggedIn,
    chats,
    isStreaming,
    abortStreaming,
    clearAuthState,
    onChatLoaded,
    reset,
  } = params;

  const queryClient = useQueryClient();
  const [currentChat, setCurrentChat] = useState<Chat | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Workspace change - clear current chat
  useEffect(() => {
    if (workspaceId) {
      setCurrentChat(null);
      reset();
      setCurrentChatId(null);
    }
  }, [workspaceId, reset]);

  // Restore last open chat on mount
  useEffect(() => {
    const restoreLastChat = async () => {
      if (isLoggedIn && workspaceId && chats.length > 0) {
        const lastChatId = getCurrentChatId();
        if (lastChatId && chats.some((c) => c.id === lastChatId)) {
          await loadChat(lastChatId);
        }
      }
    };
    restoreLastChat();
  }, [isLoggedIn, workspaceId, chats.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const createNewChat = useCallback(() => {
    if (isStreaming) {
      abortStreaming();
    }
    setCurrentChat(null);
    reset();
    setCurrentChatId(null);
  }, [isStreaming, abortStreaming, reset]);

  const loadChat = useCallback(
    async (chatId: string) => {
      if (isStreaming) {
        abortStreaming();
      }

      // First, check if we have a cached version with messages
      const cachedChat = chats.find((c) => c.id === chatId);
      if (cachedChat && cachedChat.messages.length > 0) {
        setCurrentChat(cachedChat);
        onChatLoaded(cachedChat);
        setCurrentChatId(chatId);
        return;
      }

      // If not cached or empty, load from API
      if (!isLoggedIn || !workspaceId) {
        return;
      }

      setIsLoading(true);
      try {
        const chatData = await window.authAPI?.getChat(chatId);
        if (chatData) {
          const chat = transformApiChat(chatData as Record<string, unknown>);
          setCurrentChat(chat);
          onChatLoaded(chat);
          setCurrentChatId(chatId);

          // Update the chats list cache with this chat's metadata
          queryClient.setQueryData(chatKeys.list(workspaceId), (old: Chat[] | undefined) => {
            if (!old) return old;
            const exists = old.find((c) => c.id === chatId);
            if (exists) {
              return old.map((c) => (c.id === chatId ? { ...c, messages: [] } : c));
            }
            return [{ ...chat, messages: [] }, ...old];
          });
        }
      } catch (err) {
        console.error('[useChatActions] Failed to load chat:', err);
        if (err instanceof Error && err.message.includes('Session expired')) {
          clearAuthState();
          queryClient.clear();
        }
      } finally {
        setIsLoading(false);
      }
    },
    [chats, isLoggedIn, workspaceId, isStreaming, abortStreaming, clearAuthState, queryClient, onChatLoaded],
  );

  const deleteChat = useCallback(
    async (chatId: string) => {
      try {
        if (isLoggedIn) {
          await window.authAPI?.deleteChat(chatId);
        }
        queryClient.invalidateQueries({ queryKey: ['chats', 'list'] });
        queryClient.removeQueries({ queryKey: chatKeys.detail(chatId) });

        if (currentChat?.id === chatId) {
          createNewChat();
        }
      } catch (err) {
        console.error('[useChatActions] Failed to delete chat:', err);
        if (err instanceof Error && err.message.includes('Session expired')) {
          clearAuthState();
          queryClient.clear();
        }
      }
    },
    [currentChat, isLoggedIn, createNewChat, clearAuthState, queryClient],
  );

  return {
    currentChat,
    isLoading,
    createNewChat,
    loadChat,
    deleteChat,
    setCurrentChat,
  };
}