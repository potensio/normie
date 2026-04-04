/**
 * Workspace hooks - queries and mutations
 * 
 * All workspace operations grouped in one file.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Workspace } from '@normie/types';

// ============================================
// Query Keys
// ============================================

export const workspaceKeys = {
  all: ['workspaces'] as const,
  list: () => [...workspaceKeys.all, 'list'] as const,
};

// ============================================
// Queries
// ============================================

/**
 * Fetch user's workspaces
 * 
 * @example
 * const { data: workspaces, isLoading } = useWorkspaces();
 */
export function useWorkspaces() {
  return useQuery({
    queryKey: workspaceKeys.list(),
    queryFn: async (): Promise<Workspace[]> => {
      if (!window.authAPI) return [];
      
      const response = await fetch('http://localhost:3001/api/workspaces', {
        credentials: 'include',
      });
      
      if (!response.ok) throw new Error('Failed to fetch workspaces');
      
      const data = await response.json();
      return data.workspaces;
    },
    initialData: () => window.authAPI?.getUserWorkspaces() || [],
  });
}

// ============================================
// Mutations
// ============================================

/**
 * Create a new workspace
 * 
 * @example
 * const { mutate: createWorkspace, isPending } = useCreateWorkspace();
 * createWorkspace({ name: 'My Workspace' });
 */
export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ name, description }: { name: string; description?: string }) => {
      if (!window.authAPI) throw new Error('Auth API not available');
      return await window.authAPI.createWorkspace(name, description);
    },
    onSuccess: (newWorkspace) => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.list() });
      window.authAPI?.switchWorkspace(newWorkspace.id);
    },
  });
}