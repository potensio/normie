import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User, Workspace } from '@normie/types';

interface AuthContextType {
  user: User | null;
  currentWorkspace: Workspace | null;
  workspaces: Workspace[];
  isLoggedIn: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  createWorkspace: (name: string, description?: string) => Promise<Workspace>;
  switchWorkspace: (workspaceId: string) => void;
  refreshWorkspaces: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize auth on mount
  useEffect(() => {
    const init = async () => {
      if (window.authAPI) {
        try {
          const loggedIn = await window.authAPI.initAuth();
          if (loggedIn) {
            setUser(window.authAPI.getUser());
            setCurrentWorkspace(window.authAPI.getCurrentWorkspace());
            setWorkspaces(window.authAPI.getUserWorkspaces() || []);
          }
        } catch (err) {
          console.error('[AuthContext] Init error:', err);
          // Session expired or invalid - stay logged out
        }
      }
      setIsLoading(false);
    };
    init();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    if (!window.authAPI) throw new Error('Auth API not available');
    
    try {
      await window.authAPI.login(email, password);
      setUser(window.authAPI.getUser());
      setCurrentWorkspace(window.authAPI.getCurrentWorkspace());
      setWorkspaces(window.authAPI.getUserWorkspaces() || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
      throw err;
    }
  }, []);

  const register = useCallback(async (email: string, password: string, displayName?: string) => {
    setError(null);
    if (!window.authAPI) throw new Error('Auth API not available');
    
    try {
      await window.authAPI.register(email, password, displayName);
      setUser(window.authAPI.getUser());
      setCurrentWorkspace(window.authAPI.getCurrentWorkspace());
      setWorkspaces(window.authAPI.getUserWorkspaces() || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      setError(message);
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    if (!window.authAPI) return;
    
    try {
      await window.authAPI.logout();
    } catch (err) {
      console.error('[AuthContext] Logout error:', err);
    } finally {
      setUser(null);
      setCurrentWorkspace(null);
      setWorkspaces([]);
      setError(null);
    }
  }, []);

  const createWorkspace = useCallback(async (name: string, description?: string) => {
    if (!window.authAPI) throw new Error('Auth API not available');
    
    try {
      const workspace = await window.authAPI.createWorkspace(name, description);
      setWorkspaces(prev => [...prev, workspace]);
      return workspace;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create workspace';
      setError(message);
      throw err;
    }
  }, []);

  const switchWorkspace = useCallback((workspaceId: string) => {
    if (!window.authAPI) return;
    window.authAPI.switchWorkspace(workspaceId);
    setCurrentWorkspace(window.authAPI.getCurrentWorkspace());
  }, []);

  const refreshWorkspaces = useCallback(async () => {
    // Workspaces are stored in authAPI, just refresh from there
    if (window.authAPI) {
      setWorkspaces(window.authAPI.getUserWorkspaces() || []);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value: AuthContextType = {
    user,
    currentWorkspace,
    workspaces,
    isLoggedIn: !!user,
    isLoading,
    error,
    login,
    register,
    logout,
    createWorkspace,
    switchWorkspace,
    refreshWorkspaces,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
