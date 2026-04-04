/**
 * AuthContext - Holds auth state only
 * 
 * This context is a state container. All mutations are in hooks/useAuth.ts.
 */
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { User, Workspace } from '@normie/types';
import { authApi } from '@/lib/api';

interface AuthContextType {
  // State
  user: User | null;
  currentWorkspace: Workspace | null;
  workspaces: Workspace[];
  isLoggedIn: boolean;
  isLoading: boolean;
  error: string | null;
  
  // State setters (for useAuthMutations hook)
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  setCurrentWorkspace: React.Dispatch<React.SetStateAction<Workspace | null>>;
  setWorkspaces: React.Dispatch<React.SetStateAction<Workspace[]>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
  
  // Non-mutation methods (still in context)
  createWorkspace: (name: string, description?: string) => Promise<Workspace>;
  switchWorkspace: (workspaceId: string) => void;
  refreshWorkspaces: () => Promise<void>;
  clearError: () => void;
  
  // For internal use (session expiry, etc.)
  clearAuthState: () => void;
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
      try {
        const loggedIn = await authApi.init();
        if (loggedIn) {
          setUser(authApi.getUser());
          setCurrentWorkspace(authApi.getCurrentWorkspace());
          setWorkspaces(authApi.getWorkspaces());
        }
      } catch (err) {
        console.error('[AuthContext] Init error:', err);
        // Session expired or invalid - stay logged out
      }
      setIsLoading(false);
    };
    init();
  }, []);

  const createWorkspace = useCallback(async (name: string, description?: string) => {
    const workspace = await authApi.createWorkspace(name, description);
    setWorkspaces(prev => [...prev, workspace]);
    return workspace;
  }, []);

  const switchWorkspace = useCallback((workspaceId: string) => {
    authApi.switchWorkspace(workspaceId);
    setCurrentWorkspace(authApi.getCurrentWorkspace());
  }, []);

  const refreshWorkspaces = useCallback(async () => {
    setWorkspaces(authApi.getWorkspaces());
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Clear all auth state (for session expiry, logout, etc.)
   * Used internally by useAuthMutations and for session error handling.
   */
  const clearAuthState = useCallback(() => {
    setUser(null);
    setCurrentWorkspace(null);
    setWorkspaces([]);
    setError(null);
  }, []);

  const value: AuthContextType = {
    // State
    user,
    currentWorkspace,
    workspaces,
    isLoggedIn: !!user,
    isLoading,
    error,
    
    // State setters
    setUser,
    setCurrentWorkspace,
    setWorkspaces,
    setError,
    
    // Non-mutation methods
    createWorkspace,
    switchWorkspace,
    refreshWorkspaces,
    clearError,
    
    // For session expiry handling
    clearAuthState,
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