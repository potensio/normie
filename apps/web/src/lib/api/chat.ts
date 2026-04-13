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
