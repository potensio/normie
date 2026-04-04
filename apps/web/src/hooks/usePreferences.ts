/**
 * Preferences hook - provider and model selection
 * 
 * Manages user's preferred provider/model with localStorage persistence.
 */
import { useState, useCallback } from 'react';
import type { Provider } from '@normie/types';
import { getDefaultModel, isValidModel } from '@/lib/constants';
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
 * @example
 * const { provider, model, setProvider, setModel } = usePreferences();
 */
export function usePreferences(): UsePreferencesReturn {
  const [provider, setProviderState] = useState<Provider>(getPreferredProvider);
  const [model, setModelState] = useState<string>(() => getStoredModelSafe());

  function getStoredModelSafe(): string {
    try {
      return getPreferredModel(getPreferredProvider());
    } catch {
      return getDefaultModel(getPreferredProvider());
    }
  }

  const setProvider = useCallback((newProvider: Provider) => {
    setPreferredProvider(newProvider);
    const defaultModel = getDefaultModel(newProvider);
    setPreferredModel(defaultModel);
    setProviderState(newProvider);
    setModelState(defaultModel);
  }, []);

  const setModel = useCallback((newModel: string) => {
    if (isValidModel(provider, newModel)) {
      setPreferredModel(newModel);
      setModelState(newModel);
    }
  }, [provider]);

  return { provider, model, setProvider, setModel };
}