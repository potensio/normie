// Type definitions for Electron API exposed via contextBridge

export interface ElectronAPI {
  abortCurrentRequest: () => void;
  stopQuery: (chatId: string, provider?: string) => Promise<{ success: boolean; error?: string }>;
  sendMessage: (
    message: string,
    chatId: string,
    provider?: string,
    model?: string | null,
    workspaceId?: string | null,
    userId?: string | null
  ) => Promise<{
    getReader: () => Promise<{
      read: () => Promise<{ done: boolean; value?: string }>;
    }>;
  }>;
  getProviders: () => Promise<{ providers: string[]; default: string }>;
  openExternal: (url: string) => Promise<void>;
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
