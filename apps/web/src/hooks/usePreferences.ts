import { useState, useCallback } from 'react';
import type { Provider } from '@normie/types';
import { getDefaultModel, isValidModel } from '@/lib/constants';
import {
  getPreferredProvider as getStoredProvider,
  setPreferredProvider as setStoredProvider,
  getPreferredModel as getStoredModel,
  setPreferredModel as setStoredModel,
} from '@/lib/storage';

// ============================================================================
// Hook Types
// ============================================================================

export interface UsePreferencesReturn {
  /** Current provider preference */
  provider: Provider;
  /** Current model preference */
  model: string;
  /** Update provider preference and set default model for new provider */
  setProvider: (provider: Provider) => void;
  /** Update model preference (validates model is valid for current provider) */
  setModel: (model: string) => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for managing provider/model preferences that persist to localStorage.
 *
 * This hook provides reactive state for the user's preferred provider and model.
 * Preferences are saved to localStorage on change and restored on mount.
 *
 * Used by:
 * - ModelDropdown component
 * - ProviderDropdown component
 * - ChatContext (for initial values)
 *
 * @example
 * ```tsx
 * const { provider, model, setProvider, setModel } = usePreferences();
 *
 * // Update provider (also updates model to provider's default)
 * setProvider('opencode');
 *
 * // Update model
 * setModel('opencode/gpt-5-nano');
 * ```
 */
export function usePreferences(): UsePreferencesReturn {
  // Initialize state from localStorage via storage helpers
  const [provider, setProviderState] = useState<Provider>(getStoredProvider);
  const [model, setModelState] = useState<string>(() => getStoredModel(getStoredProvider()));

  /**
   * Update provider preference
   * Also updates the model to the default for the new provider
   */
  const setProvider = useCallback((newProvider: Provider) => {
    // Update localStorage
    setStoredProvider(newProvider);

    // Get default model for new provider
    const defaultModel = getDefaultModel(newProvider);
    setStoredModel(defaultModel);

    // Update state
    setProviderState(newProvider);
    setModelState(defaultModel);
  }, []);

  /**
   * Update model preference
   * Validates that the model is valid for the current provider
   */
  const setModel = useCallback(
    (newModel: string) => {
      // Only update if model is valid for current provider
      if (isValidModel(provider, newModel)) {
        setStoredModel(newModel);
        setModelState(newModel);
      } else {
        console.warn(
          `[usePreferences] Model "${newModel}" is not valid for provider "${provider}". Skipping update.`
        );
      }
    },
    [provider]
  );

  return {
    provider,
    model,
    setProvider,
    setModel,
  };
}
