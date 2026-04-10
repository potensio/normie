/**
 * Chat API - All chat-related API calls
 */
import type { Chat, Provider } from "@normie/types";

export interface ApiChat {
  id: string | number;
  title?: string;
  provider?: string;
  model?: string;
  sessionId?: string;
  updatedAt?: string | Date;
  messages?: Chat["messages"];
  todos?: Chat["todos"];
  toolCalls?: Chat["toolCalls"];
}

export const chatApi = {
  /**
   * Get all chats for a workspace
   */
  list: async (workspaceId: string): Promise<ApiChat[]> => {
    if (!window.authAPI) throw new Error("Auth API not available");
    return window.authAPI.getChats(workspaceId);
  },

  /**
   * Get a single chat with messages
   */
  get: async (chatId: string): Promise<ApiChat> => {
    if (!window.authAPI) throw new Error("Auth API not available");
    return window.authAPI.getChat(chatId);
  },

  /**
   * Delete a chat
   */
  delete: async (chatId: string): Promise<void> => {
    if (!window.authAPI) throw new Error("Auth API not available");
    await window.authAPI.deleteChat(chatId);
  },

  /**
   * Send a message and get a response
   */
  sendMessage: async (params: {
    content: string;
    chatId: string;
    provider: Provider;
    model: string;
    workspaceId: string | null;
    userId: string;
    attachments?: Array<{ path: string }>;
  }): Promise<{ chatId: string; title?: string; response: string }> => {
    if (!window.authAPI) throw new Error("Auth API not available");

    const response = await fetch(
      `http://localhost:3001/api/chats/${params.chatId}/send`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          message: params.content,
          provider: params.provider,
          model: params.model,
          workspaceId: params.workspaceId,
          attachments: params.attachments,
        }),
      },
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Failed to send message");
    }

    return response.json();
  },

  /**
   * Update message metadata (for blocks persistence)
   */
  updateMessageBlocks: async (
    messageId: string,
    blocks: unknown[],
  ): Promise<void> => {
    if (!window.authAPI) throw new Error("Auth API not available");
    // Call the backend endpoint
    const response = await fetch(`/api/chats/messages/${messageId}/metadata`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks }),
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Failed to update message blocks");
    }
  },
};
