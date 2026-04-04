/**
 * Auth hooks - login, logout, register
 * 
 * All authentication operations grouped in one file.
 * Uses TanStack Query mutations with automatic cache invalidation.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { authApi } from '@/lib/api';

/**
 * Login mutation hook
 * 
 * @example
 * const { mutate: login, isPending, error } = useLogin();
 * login({ email, password });
 */
export function useLogin() {
  const { setUser, setCurrentWorkspace, setWorkspaces, setError } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      await authApi.login(email, password);
    },
    onSuccess: () => {
      setUser(authApi.getUser());
      setCurrentWorkspace(authApi.getCurrentWorkspace());
      setWorkspaces(authApi.getWorkspaces());
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['chats'] });
    },
    onError: (error: Error) => {
      setError(error.message || 'Login failed');
    },
  });
}

/**
 * Register mutation hook
 * 
 * @example
 * const { mutate: register, isPending } = useRegister();
 * register({ email, password, displayName });
 */
export function useRegister() {
  const { setUser, setCurrentWorkspace, setWorkspaces, setError } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ email, password, displayName }: { email: string; password: string; displayName?: string }) => {
      await authApi.register(email, password, displayName);
    },
    onSuccess: () => {
      setUser(authApi.getUser());
      setCurrentWorkspace(authApi.getCurrentWorkspace());
      setWorkspaces(authApi.getWorkspaces());
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['chats'] });
    },
    onError: (error: Error) => {
      setError(error.message || 'Registration failed');
    },
  });
}

/**
 * Logout mutation hook
 * 
 * @example
 * const { mutate: logout, isPending } = useLogout();
 * logout();
 */
export function useLogout() {
  const { setUser, setCurrentWorkspace, setWorkspaces, setError } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await authApi.logout();
    },
    onSuccess: () => {
      setUser(null);
      setCurrentWorkspace(null);
      setWorkspaces([]);
      setError(null);
      queryClient.clear();
    },
    onError: (error: Error) => {
      console.error('[useLogout] Error:', error);
      // Still clear state - user intended to log out
      setUser(null);
      setCurrentWorkspace(null);
      setWorkspaces([]);
      setError(null);
      queryClient.clear();
    },
  });
}