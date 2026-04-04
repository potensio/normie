/**
 * Workspace API - All workspace-related API calls
 */
import type { Workspace } from '@normie/types';
import { apiRequest } from './client';

export interface WorkspacesResponse {
  workspaces: Workspace[];
}

export const workspaceApi = {
  /**
   * Get all workspaces for the current user
   */
  list: async (): Promise<Workspace[]> => {
    // Use authAPI if available (Electron), otherwise fetch directly
    if (window.authAPI) {
      return window.authAPI.getUserWorkspaces();
    }

    const response = await apiRequest<WorkspacesResponse>('/api/workspaces');
    return response.workspaces;
  },
};