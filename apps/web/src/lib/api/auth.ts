/**
 * Auth API - All authentication-related API calls
 * 
 * Uses window.authAPI (Electron preload) for session management.
 */
import type { User, Workspace } from '@normie/types';

export const authApi = {
  /**
   * Initialize auth state from stored session
   */
  init: async (): Promise<boolean> => {
    if (!window.authAPI) {
      console.warn('[authApi] Auth API not available');
      return false;
    }
    return window.authAPI.initAuth();
  },

  /**
   * Login with email and password
   */
  login: async (email: string, password: string): Promise<void> => {
    if (!window.authAPI) throw new Error('Auth API not available');
    await window.authAPI.login(email, password);
  },

  /**
   * Register a new account
   */
  register: async (
    email: string,
    password: string,
    displayName?: string
  ): Promise<void> => {
    if (!window.authAPI) throw new Error('Auth API not available');
    await window.authAPI.register(email, password, displayName);
  },

  /**
   * Logout and clear session
   */
  logout: async (): Promise<void> => {
    if (!window.authAPI) throw new Error('Auth API not available');
    await window.authAPI.logout();
  },

  /**
   * Get current user
   */
  getUser: (): User | null => {
    return window.authAPI?.getUser() ?? null;
  },

  /**
   * Get current workspace
   */
  getCurrentWorkspace: (): Workspace | null => {
    return window.authAPI?.getCurrentWorkspace() ?? null;
  },

  /**
   * Get all user workspaces
   */
  getWorkspaces: (): Workspace[] => {
    return window.authAPI?.getUserWorkspaces() ?? [];
  },

  /**
   * Switch to a different workspace
   */
  switchWorkspace: (workspaceId: string): void => {
    window.authAPI?.switchWorkspace(workspaceId);
  },

  /**
   * Create a new workspace
   */
  createWorkspace: async (
    name: string,
    description?: string
  ): Promise<Workspace> => {
    if (!window.authAPI) throw new Error('Auth API not available');
    return window.authAPI.createWorkspace(name, description);
  },
};