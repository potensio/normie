import { contextBridge } from 'electron';

const SERVER_URL = 'http://localhost:3001';

// ============================================
// TYPES
// ============================================

interface User {
  id: string;
  email: string;
  displayName: string;
}

interface Workspace {
  id: string;
  name: string;
  description?: string;
  isDefault?: boolean;
}

interface Chat {
  id: string;
  title: string;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
}

interface StreamReader {
  read: () => Promise<{ done: boolean; value?: string }>;
}

interface StreamResponse {
  getReader: () => Promise<StreamReader>;
}

interface ProvidersResponse {
  providers: string[];
  default: string;
}

interface FetchOptions extends RequestInit {
  headers?: Record<string, string>;
}

// Store the current abort controller for cancelling requests
let currentAbortController: AbortController | null = null;

// Auth state (cached in memory)
let currentUser: User | null = null;
let currentWorkspace: Workspace | null = null;
let userWorkspaces: Workspace[] = [];

// ============================================
// FETCH WITH AUTH HELPER (auto-refresh token)
// ============================================

async function fetchWithAuth(url: string, options: FetchOptions = {}): Promise<Response> {
  // Ensure credentials are included for httpOnly cookies
  const fetchOptions: RequestInit = {
    ...options,
    credentials: 'include',
    headers: {
      ...options.headers,
    }
  };

  let response = await fetch(url, fetchOptions);

  // If unauthorized, try to refresh the token
  if (response.status === 401) {
    const errorData = await response.json().catch(() => ({}));
    
    // Try to refresh if we have a session
    if (errorData.code === 'TOKEN_EXPIRED' || errorData.code === 'TOKEN_REQUIRED') {
      try {
        const refreshResponse = await fetch(`${SERVER_URL}/api/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' }
        });

        if (refreshResponse.ok) {
          const refreshData = await refreshResponse.json();
          
          // Update user if returned
          if (refreshData.user) {
            currentUser = {
              id: refreshData.user.id,
              email: refreshData.user.email,
              displayName: refreshData.user.displayName
            };
          }
          
          // Retry the original request
          response = await fetch(url, fetchOptions);
          return response;
        }
        
        // Refresh failed - session expired
        currentUser = null;
        currentWorkspace = null;
        userWorkspaces = [];
        
      } catch (refreshError) {
        console.error('[AUTH] Refresh failed:', refreshError);
      }
    }
    
    // Clear auth state on session expired
    if (errorData.code === 'SESSION_EXPIRED' || errorData.code === 'NO_SESSION') {
      currentUser = null;
      currentWorkspace = null;
      userWorkspaces = [];
    }
  }

  return response;
}

// ============================================
// AUTH API
// ============================================

contextBridge.exposeInMainWorld('authAPI', {
  // Initialize auth - check if we have a valid session
  initAuth: async (): Promise<boolean> => {
    try {
      // Try refresh first (will return user info if session valid)
      const response = await fetch(`${SERVER_URL}/api/auth/refresh`, {
        method: 'POST',
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.user) {
          currentUser = {
            id: data.user.id,
            email: data.user.email,
            displayName: data.user.displayName
          };
        }
        
        // Get workspaces
        const meResponse = await fetch(`${SERVER_URL}/api/auth/me`, {
          credentials: 'include'
        });
        
        if (meResponse.ok) {
          const meData = await meResponse.json();
          userWorkspaces = meData.workspaces || [];
          currentWorkspace = userWorkspaces.find(w => w.isDefault) || userWorkspaces[0] || null;
        }
        
        return true;
      }
      
      // Check auth status without refresh
      const statusResponse = await fetch(`${SERVER_URL}/api/auth/status`, {
        credentials: 'include'
      });
      
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        
        if (statusData.authenticated) {
          // Try to get user info
          const meResponse = await fetch(`${SERVER_URL}/api/auth/me`, {
            credentials: 'include'
          });
          
          if (meResponse.ok) {
            const meData = await meResponse.json();
            currentUser = {
              id: meData.id,
              email: meData.email,
              displayName: meData.displayName
            };
            userWorkspaces = meData.workspaces || [];
            currentWorkspace = userWorkspaces.find(w => w.isDefault) || userWorkspaces[0] || null;
            return true;
          }
        }
      }
      
      return false;
    } catch (error) {
      console.error('[AUTH] Init error:', error);
      currentUser = null;
      currentWorkspace = null;
      userWorkspaces = [];
      return false;
    }
  },

  // Login
  login: async (email: string, password: string): Promise<void> => {
    const response = await fetch(`${SERVER_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Login failed' }));
      throw new Error(error.error || 'Login failed');
    }

    const data = await response.json();
    currentUser = data.user;
    
    // Get workspaces
    const meResponse = await fetch(`${SERVER_URL}/api/auth/me`, {
      credentials: 'include'
    });
    
    if (meResponse.ok) {
      const meData = await meResponse.json();
      userWorkspaces = meData.workspaces || [];
      currentWorkspace = userWorkspaces.find(w => w.isDefault) || userWorkspaces[0] || null;
    }
  },

  // Register
  register: async (email: string, password: string, displayName: string): Promise<void> => {
    const response = await fetch(`${SERVER_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password, displayName })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Registration failed' }));
      throw new Error(error.error || 'Registration failed');
    }

    const data = await response.json();
    currentUser = data.user;
    
    // Get workspaces
    const meResponse = await fetch(`${SERVER_URL}/api/auth/me`, {
      credentials: 'include'
    });
    
    if (meResponse.ok) {
      const meData = await meResponse.json();
      userWorkspaces = meData.workspaces || [];
      currentWorkspace = userWorkspaces.find(w => w.isDefault) || userWorkspaces[0] || null;
    }
  },

  // Logout
  logout: async (): Promise<void> => {
    try {
      await fetch(`${SERVER_URL}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });
    } catch (e) {
      // Ignore errors
    }
    currentUser = null;
    currentWorkspace = null;
    userWorkspaces = [];
  },

  // Get current user
  getUser: (): User | null => currentUser,

  // Get current workspace
  getCurrentWorkspace: (): Workspace | null => currentWorkspace,

  // Get user workspaces
  getUserWorkspaces: (): Workspace[] => userWorkspaces,

  // Check if logged in
  isLoggedIn: (): boolean => !!currentUser,

  // Create workspace
  createWorkspace: async (name: string, description: string): Promise<Workspace> => {
    const response = await fetchWithAuth(`${SERVER_URL}/api/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to create workspace' }));
      throw new Error(error.error || 'Failed to create workspace');
    }

    const workspace = await response.json();
    userWorkspaces.push(workspace);
    return workspace;
  },

  // Switch workspace
  switchWorkspace: (workspaceId: string): void => {
    const workspace = userWorkspaces.find(w => w.id === workspaceId);
    if (workspace) {
      currentWorkspace = workspace;
    }
  },

  // Get chats for workspace
  getChats: async (workspaceId: string): Promise<Chat[]> => {
    const response = await fetchWithAuth(`${SERVER_URL}/api/chats/workspace/${workspaceId}`);

    if (!response.ok) {
      const error = await response.text();
      throw new Error('Failed to load chats: ' + error);
    }

    const data = await response.json();
    return data.chats || [];
  },

  // Get single chat
  getChat: async (chatId: string): Promise<Chat | null> => {
    const response = await fetchWithAuth(`${SERVER_URL}/api/chats/${chatId}`);

    if (!response.ok) {
      return null;
    }

    return await response.json();
  },

  // Delete chat
  deleteChat: async (chatId: string): Promise<void> => {
    const response = await fetchWithAuth(`${SERVER_URL}/api/chats/${chatId}`, {
      method: 'DELETE'
    });

    if (!response.ok) {
      throw new Error('Failed to delete chat');
    }
  }
});

// ============================================
// ELECTRON API (Chat functionality)
// ============================================

contextBridge.exposeInMainWorld('electronAPI', {
  // Abort the current ongoing request (client-side)
  abortCurrentRequest: () => {
    if (currentAbortController) {
      console.log('[PRELOAD] Aborting current request');
      currentAbortController.abort();
      currentAbortController = null;
    }
  },

  // Stop the backend query execution
  stopQuery: async (chatId: string, provider: string = 'claude'): Promise<{ success: boolean; error?: string }> => {
    console.log('[PRELOAD] Stopping query for chatId:', chatId, 'provider:', provider);
    try {
      const response = await fetchWithAuth(`${SERVER_URL}/api/abort`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ chatId, provider })
      });
      const result = await response.json();
      console.log('[PRELOAD] Stop query result:', result);
      return result;
    } catch (error) {
      console.error('[PRELOAD] Error stopping query:', error);
      return { success: false, error: (error as Error).message };
    }
  },

  // Send a chat message to the backend
  sendMessage: async (
    message: string,
    chatId: string,
    provider: string = 'claude',
    model: string | null = null,
    workspaceId: string | null = null,
    userId: string | null = null
  ): Promise<StreamResponse> => {
    // Abort any previous request
    if (currentAbortController) {
      currentAbortController.abort();
    }

    // Create new abort controller for this request
    currentAbortController = new AbortController();
    const signal = currentAbortController.signal;

    return new Promise((resolve, reject) => {
      console.log('[PRELOAD] Sending message to backend:', message);

      fetch(`${SERVER_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ message, chatId, provider, model, workspaceId, userId }),
        signal
      })
        .then(response => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`);
          }

          console.log('[PRELOAD] Connected to backend successfully');

          // Return a custom object with methods to read the stream
          resolve({
            getReader: async function() {
              const reader = response.body!.getReader();
              const decoder = new TextDecoder();
              return {
                read: async () => {
                  try {
                    const { done, value } = await reader.read();
                    if (done) {
                      console.log('[PRELOAD] Stream ended');
                    }
                    return {
                      done,
                      value: done ? undefined : decoder.decode(value, { stream: true })
                    };
                  } catch (readError) {
                    console.error('[PRELOAD] Read error:', readError);
                    throw readError;
                  }
                }
              };
            }
          });
        })
        .catch(error => {
          console.error('[PRELOAD] Connection error:', error);
          reject(new Error(`Failed to connect to backend: ${error.message}`));
        });
    });
  },

  // Get available providers from backend
  getProviders: async (): Promise<ProvidersResponse> => {
    try {
      const response = await fetch(`${SERVER_URL}/api/providers`, {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('[PRELOAD] Error fetching providers:', error);
      return { providers: ['claude'], default: 'claude' };
    }
  }
});