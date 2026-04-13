/**
 * useProviders hook - Fetches and manages providers from the API
 * 
 * Provides real-time provider/model lists from the Pi Agent backend.
 * Falls back to static defaults if the API fails.
 */

import { useQuery } from '@tanstack/react-query';
import { providersApi } from '@/lib/api';
import { FALLBACK_PROVIDERS, FALLBACK_MODELS, DEFAULT_PROVIDER, DEFAULT_MODEL } from '@/lib/constants';
import type { PiProviderInfo, PiModel } from '@normie/types';

export interface ModelOption {
  value: string;
  label: string;
  desc?: string;
}

// Query keys for providers
export const providerKeys = {
  all: ['providers'] as const,
  list: () => [...providerKeys.all, 'list'] as const,
};

export interface UseProvidersReturn {
  /** List of available providers */
  providers: PiProviderInfo[];
  /** Whether providers are being loaded */
  isLoading: boolean;
  /** Whether an error occurred loading providers */
  isError: boolean;
  /** Error message if any */
  error: string | null;
  /** Default provider from server config */
  defaultProvider: string;
  /** Default model from server config */
  defaultModel: string;
  /** Get models for a specific provider */
  getModelsForProvider: (providerId: string) => ModelOption[];
  /** Get provider info by ID */
  getProvider: (providerId: string) => PiProviderInfo | undefined;
  /** Check if a model is valid for a provider */
  isValidModel: (providerId: string, modelId: string) => boolean;
  /** Refetch providers from API */
  refetch: () => void;
}

/**
 * Hook to fetch and manage providers from the API
 * 
 * @example
 * const { providers, getModelsForProvider, isLoading } = useProviders();
 */
export function useProviders(): UseProvidersReturn {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: providerKeys.list(),
    queryFn: providersApi.getProviders,
    staleTime: 5 * 60 * 1000, // 5 minutes - providers don't change often
    gcTime: 30 * 60 * 1000, // 30 minutes
  });

  const providers = data?.providers ?? [];
  const defaultProvider = data?.default?.provider ?? DEFAULT_PROVIDER;
  const defaultModel = data?.default?.model ?? DEFAULT_MODEL;

  const getModelsForProvider = (providerId: string): ModelOption[] => {
    // If we have API data, use it
    if (providers.length > 0) {
      const provider = providers.find(p => p.id === providerId);
      if (provider) {
        return provider.models.map(m => ({
          value: m.id,
          label: m.name,
          desc: m.reasoning ? 'Supports reasoning' : undefined,
        }));
      }
    }
    
    // Fallback to static models
    return FALLBACK_MODELS[providerId] ?? [];
  };

  const getProvider = (providerId: string): PiProviderInfo | undefined => {
    return providers.find(p => p.id === providerId);
  };

  const isValidModel = (providerId: string, modelId: string): boolean => {
    // If we have API data, check against it
    if (providers.length > 0) {
      const provider = providers.find(p => p.id === providerId);
      return provider?.models.some(m => m.id === modelId) ?? false;
    }
    
    // Fallback: check against fallback models
    const models = FALLBACK_MODELS[providerId];
    return models?.some(m => m.value === modelId) ?? false;
  };

  return {
    providers,
    isLoading,
    isError,
    error: error?.message ?? null,
    defaultProvider,
    defaultModel,
    getModelsForProvider,
    getProvider,
    isValidModel,
    refetch,
  };
}
