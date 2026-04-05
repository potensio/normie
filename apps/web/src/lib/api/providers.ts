/**
 * Providers API Client
 * 
 * Fetches available providers and models from the backend.
 */

import { apiRequest } from './client';
import type { PiProviderInfo } from '@normie/types';

export interface ProvidersResponse {
  providers: PiProviderInfo[];
  default: {
    provider: string;
    model: string;
  };
}

/**
 * Get available providers with their models
 */
export async function getProviders(): Promise<ProvidersResponse> {
  return apiRequest<ProvidersResponse>('/api/providers');
}

export const providersApi = {
  getProviders,
};
