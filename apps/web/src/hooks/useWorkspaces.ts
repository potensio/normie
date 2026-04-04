import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Workspace } from '@normie/types';

export const workspaceKeys = {
  all: ['workspaces'] as const,
  lists: () => [...workspaceKeys.all, 'list'] as const,
  list: () => [...workspaceKeys.all, 'list'] as const,
};

/**
 * Hook to fetch user's workspaces
 */
export function useWorkspaces() {
  return useQuery({
    queryKey: workspaceKeys.list(),
    queryFn: async (): Promise<Workspace[]> => {
      if (!window.authAPI) return [];
      
      // Workspaces are already loaded in authAPI after login
      // This query serves as a cache and refresh mechanism
      const response = await fetch(`${getServerUrl()}/api/workspaces`, {
        credentials: 'include',
      });
      
      if (!response.ok) throw new Error('Failed to fetch workspaces');
      
      const data = await response.json();
      return data.workspaces;
    },
    initialData: () => {
      // Use authAPI's cached workspaces as initial data
      return window.authAPI?.getUserWorkspaces() || [];
    },
  });
}

/**
 * Hook to create a new workspace
 */
export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ name, description }: { name: string; description?: string }) => {
      if (!window.authAPI) throw new Error('Auth API not available');
      return await window.authAPI.createWorkspace(name, description);
    },
    onSuccess: (newWorkspace) => {
      // Invalidate and refetch workspaces
      queryClient.invalidateQueries({ queryKey: workspaceKeys.list() });
      // Update authAPI's local cache
      const workspaces = window.authAPI?.getUserWorkspaces() || [];
      window.authAPI?.switchWorkspace(newWorkspace.id);
    },
  });
}

// Helper to get server URL (duplicated from preload, but needed for direct fetch)
function getServerUrl(): string {
  return 'http://localhost:3001';
}