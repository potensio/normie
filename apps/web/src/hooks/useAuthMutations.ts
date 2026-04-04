import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';

export interface UseAuthMutationsReturn {
  login: UseMutationResult<void, Error, { email: string; password: string }>;
  register: UseMutationResult<void, Error, { email: string; password: string; displayName?: string }>;
  logout: UseMutationResult<void, Error, void>;
  isLoggingIn: boolean;
  isRegistering: boolean;
  isLoggingOut: boolean;
}

/**
 * Hook for auth mutations with TanStack Query integration.
 * 
 * Calls window.authAPI directly and updates AuthContext state.
 * Provides loading states and automatic cache invalidation.
 * 
 * Use this hook in components that need to perform auth operations
 * (AuthModal, SettingsModal, etc.)
 */
export function useAuthMutations(): UseAuthMutationsReturn {
  const { setUser, setCurrentWorkspace, setWorkspaces, setError } = useAuth();
  const queryClient = useQueryClient();

  const login = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      if (!window.authAPI) throw new Error('Auth API not available');
      await window.authAPI.login(email, password);
    },
    onSuccess: () => {
      // Update AuthContext state from authAPI
      setUser(window.authAPI?.getUser() ?? null);
      setCurrentWorkspace(window.authAPI?.getCurrentWorkspace() ?? null);
      setWorkspaces(window.authAPI?.getUserWorkspaces() ?? []);
      setError(null);
      
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['chats'] });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Login failed';
      setError(message);
    },
  });

  const register = useMutation({
    mutationFn: async ({ email, password, displayName }: { email: string; password: string; displayName?: string }) => {
      if (!window.authAPI) throw new Error('Auth API not available');
      await window.authAPI.register(email, password, displayName);
    },
    onSuccess: () => {
      // Update AuthContext state from authAPI
      setUser(window.authAPI?.getUser() ?? null);
      setCurrentWorkspace(window.authAPI?.getCurrentWorkspace() ?? null);
      setWorkspaces(window.authAPI?.getUserWorkspaces() ?? []);
      setError(null);
      
      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['chats'] });
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Registration failed';
      setError(message);
    },
  });

  const logout = useMutation({
    mutationFn: async () => {
      if (!window.authAPI) throw new Error('Auth API not available');
      await window.authAPI.logout();
    },
    onSuccess: () => {
      // Clear AuthContext state
      setUser(null);
      setCurrentWorkspace(null);
      setWorkspaces([]);
      setError(null);
      
      // Clear all cached queries
      queryClient.clear();
    },
    onError: (error) => {
      console.error('[useAuthMutations] Logout error:', error);
      // Still clear state and cache - user intended to log out
      setUser(null);
      setCurrentWorkspace(null);
      setWorkspaces([]);
      setError(null);
      queryClient.clear();
    },
  });

  return {
    login,
    register,
    logout,
    isLoggingIn: login.isPending,
    isRegistering: register.isPending,
    isLoggingOut: logout.isPending,
  };
}
