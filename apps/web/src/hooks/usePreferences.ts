/**
 * Preferences hook - provider and model selection
 * 
 * Manages user's preferred provider/model with localStorage persistence.
 * Validation is now handled by useProviders hook.
 */

import { useState, useCallback } from 'react';
import type { Provider } from '@normie/types';
import { DEFAULT_PROVIDER, DEFAULT_MODEL } from '@/lib/constants';
import {
  getPreferredProvider,
  setPreferredProvider,
  getPreferredModel,
  setPreferredModel,
} from '@/lib/storage';

interface UsePreferencesReturn {
  provider: Provider;
  model: string;
  setProvider: (provider: Provider) => void;
  setModel: (model: string) => void;
}

/**
 * Manage provider/model preferences with localStorage persistence
 * 
 * Note: Validation that model exists for provider should be done
 * by the component using useProviders hook alongside this.
 * 
 * @example
 * const { provider, model, setProvider, setModel } = usePreferences();
 */
export function usePreferences(): UsePreferencesReturn {
  const [provider, setProviderState] = useState<Provider>(getPreferredProvider);
  const [model, setModelState] = useState<string>(getPreferredModel);

  const setProvider = useCallback((newProvider: Provider) => {
    setPreferredProvider(newProvider);
    setProviderState(newProvider);
    // Note: Model is NOT automatically changed - let caller decide
    // Usually they'll also call setModel with a valid model for the new provider
  }, []);

  const setModel = useCallback((newModel: string) => {
    setPreferredModel(newModel);
    setModelState(newModel);
  }, []);

  return { provider, model, setProvider, setModel };
}
