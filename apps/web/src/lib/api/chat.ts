/**
 * Chat API - All chat-related API calls
 * 
 * Uses window.authAPI for chat CRUD and window.electronAPI for streaming.
 */
import type { Chat, Provider } from '@normie/types';

export interface ApiChat {
  id: string | number;
  title?: string;
  provider?: string;
  model?: string;
  sessionId?: string;
  updatedAt?: string | Date;
  messages?: Chat['messages'];
  todos?: Chat['todos'];
  toolCalls?: Chat['toolCalls'];
}

export const chatApi = {
  /**
   * Get all chats for a workspace
   */
  list: async (workspaceId: string): Promise<ApiChat[]> => {
    if (!window.authAPI) throw new Error('Auth API not available');
    return window.authAPI.getChats(workspaceId);
  },

  /**
   * Get a single chat with messages
   */
  get: async (chatId: string): Promise<ApiChat> => {
    if (!window.authAPI) throw new Error('Auth API not available');
    return window.authAPI.getChat(chatId);
  },

  /**
   * Delete a chat
   */
  delete: async (chatId: string): Promise<void> => {
    if (!window.authAPI) throw new Error('Auth API not available');
    await window.authAPI.deleteChat(chatId);
  },

  /**
   * Send a message and get a streaming response
   * Returns an object with a read() method for streaming
   */
  send: async (params: {
    content: string;
    chatId: string;
    provider: Provider;
    model: string;
    workspaceId: string | null;
    userId: string;
    attachments?: Array<{
      filename: string;
      originalName: string;
      mimeType: string;
      size: number;
      storagePath: string;
    }>;
  }): Promise<{ read: () => Promise<{ done: boolean; value?: string }> }> => {
    const { content, chatId, provider, model, workspaceId, userId, attachments } = params;
    
    if (!window.electronAPI) {
      throw new Error('Electron API not available');
    }

    const response = await window.electronAPI.sendMessage(
      content,
      chatId,
      provider,
      model,
      workspaceId,
      userId,
      attachments
    );

    return response.getReader();
  },

  /**
   * Abort an ongoing chat stream
   */
  abort: async (chatId: string, provider: Provider): Promise<void> => {
    window.electronAPI?.abortCurrentRequest();
    await window.electronAPI?.stopQuery(chatId, provider);
  },

  /**
   * Update message metadata (for blocks persistence)
   */
  updateMessageBlocks: async (messageId: string, blocks: unknown[]): Promise<void> => {
    if (!window.authAPI) throw new Error('Auth API not available');
    // Call the backend endpoint
    const response = await fetch(`/api/chats/messages/${messageId}/metadata`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks }),
      credentials: 'include',
    });
    
    if (!response.ok) {
      throw new Error('Failed to update message blocks');
    }
  },
};