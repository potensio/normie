/**
 * useApiKeys - TanStack Query hook for managing API keys
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authAPI } from '@/lib/api/client';

export interface ApiKeyInfo {
  id: string;
  provider: string;
  keyPreview: string | null;
  isValid: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export const apiKeyKeys = {
  all: ['apiKeys'] as const,
  list: () => [...apiKeyKeys.all, 'list'] as const,
};

/**
 * Hook to list all API keys for the current user
 */
export function useApiKeys() {
  return useQuery({
    queryKey: apiKeyKeys.list(),
    queryFn: async () => {
      const response = await authAPI.fetch('/api/api-keys');
      if (!response.ok) {
        throw new Error('Failed to fetch API keys');
      }
      const data = await response.json();
      return data.keys as ApiKeyInfo[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to save an API key for a provider
 */
export function useSaveApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ provider, apiKey }: { provider: string; apiKey: string | Record<string, any> }) => {
      const response = await authAPI.fetch(`/api/api-keys/${provider}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to save API key' }));
        throw new Error(error.error || 'Failed to save API key');
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate and refetch the keys list
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.list() });
    },
  });
}

/**
 * Hook to delete an API key for a provider
 */
export function useDeleteApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (provider: string) => {
      const response = await authAPI.fetch(`/api/api-keys/${provider}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete API key');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: apiKeyKeys.list() });
    },
  });
}