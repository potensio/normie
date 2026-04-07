// Type definitions for Electron API exposed via contextBridge

import type { Attachment } from '@normie/types';

export interface ElectronAPI {
  abortCurrentRequest: () => void;
  stopQuery: (chatId: string, provider?: string) => Promise<{ success: boolean; error?: string }>;
  sendMessage: (
    message: string,
    chatId: string,
    provider?: string,
    model?: string | null,
    workspaceId?: string | null,
    userId?: string | null,
    attachments?: Array<{
      filename: string;
      originalName: string;
      mimeType: string;
      size: number;
      storagePath: string;
    }>
  ) => Promise<{
    getReader: () => Promise<{
      read: () => Promise<{ done: boolean; value?: string }>;
    }>;
  }>;
  getProviders: () => Promise<{ providers: string[]; default: string }>;
  openExternal: (url: string) => Promise<void>;
  
  // File attachment APIs
  selectFiles: () => Promise<SelectFilesResult>;
  readFileAsDataUrl: (filePath: string) => Promise<string>;
  saveAttachments: (chatId: string, files: Array<{ data: string; name: string; type: string; size: number }>) => Promise<SaveAttachmentsResult>;
  readAttachment: (storagePath: string) => Promise<{ data: string; mimeType: string }>;
  openAttachment: (storagePath: string) => Promise<void>;
  deleteChatAttachments: (chatId: string) => Promise<void>;
}

// Result from file selection dialog
export interface SelectFilesResult {
  success: boolean;
  files?: Array<{
    path: string;
    name: string;
    size: number;
    type: string;
  }>;
  error?: string;
}

// Result from saving attachments
export interface SaveAttachmentsResult {
  success: boolean;
  attachments?: Array<{
    filename: string;
    originalName: string;
    mimeType: string;
    size: number;
    storagePath: string;
  }>;
  error?: string;
}

export interface AuthAPI {
  initAuth: () => Promise<boolean>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  getUser: () => User | null;
  getCurrentWorkspace: () => Workspace | null;
  getUserWorkspaces: () => Workspace[];
  isLoggedIn: () => boolean;
  createWorkspace: (name: string, description?: string) => Promise<Workspace>;
  switchWorkspace: (workspaceId: string) => void;
  getChats: (workspaceId: string) => Promise<Chat[]>;
  getChat: (chatId: string) => Promise<Chat | null>;
  deleteChat: (chatId: string) => Promise<void>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    authAPI: AuthAPI;
  }
}

export {};
