/**
 * Workspace hooks - queries and mutations
 * 
 * All workspace operations grouped in one file.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Workspace } from '@normie/types';
import { authApi } from '@/lib/api';

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
    queryFn: () => authApi.getWorkspaces(),
    initialData: () => authApi.getWorkspaces(),
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
      return await authApi.createWorkspace(name, description);
    },
    onSuccess: (newWorkspace) => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.list() });
      authApi.switchWorkspace(newWorkspace.id);
    },
  });
}