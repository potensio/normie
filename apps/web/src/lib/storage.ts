/**
 * LocalStorage helper utilities with validation.
 * Centralizes all localStorage access for the frontend.
 */
import type { Provider } from '@normie/types';
import { DEFAULT_PROVIDER, isValidModel, getDefaultModel } from '@/lib/constants';

/**
 * Storage keys as constants for type-safe access.
 */
export const STORAGE_KEYS = {
  PREFERRED_PROVIDER: 'selectedProvider',
  PREFERRED_MODEL: 'selectedModel',
  CURRENT_CHAT_ID: 'currentChatId',
} as const;

/**
 * Valid provider values for validation.
 */
const VALID_PROVIDERS: Provider[] = ['claude', 'opencode', 'kimi', 'bedrock'];

/**
 * Checks if a value is a valid provider.
 */
function isValidProvider(value: string | null): value is Provider {
  return value !== null && VALID_PROVIDERS.includes(value as Provider);
}

/**
 * Gets the preferred provider from localStorage.
 * Returns 'claude' as default. Clears invalid values.
 */
export function getPreferredProvider(): Provider {
  const stored = localStorage.getItem(STORAGE_KEYS.PREFERRED_PROVIDER);
  
  if (!isValidProvider(stored)) {
    // Clear invalid value
    if (stored !== null) {
      localStorage.removeItem(STORAGE_KEYS.PREFERRED_PROVIDER);
    }
    return DEFAULT_PROVIDER;
  }
  
  return stored;
}

/**
 * Sets the preferred provider in localStorage.
 */
export function setPreferredProvider(provider: Provider): void {
  localStorage.setItem(STORAGE_KEYS.PREFERRED_PROVIDER, provider);
}

/**
 * Gets the preferred model for a provider from localStorage.
 * Returns the default model for the provider if invalid or missing.
 * Clears invalid values.
 */
export function getPreferredModel(provider: Provider): string {
  const stored = localStorage.getItem(STORAGE_KEYS.PREFERRED_MODEL);
  
  // Validate that stored model exists for the given provider
  if (stored && isValidModel(provider, stored)) {
    return stored;
  }
  
  // Clear invalid value
  if (stored !== null) {
    localStorage.removeItem(STORAGE_KEYS.PREFERRED_MODEL);
  }
  
  return getDefaultModel(provider);
}

/**
 * Sets the preferred model in localStorage.
 */
export function setPreferredModel(model: string): void {
  localStorage.setItem(STORAGE_KEYS.PREFERRED_MODEL, model);
}

/**
 * Gets the current chat ID from localStorage.
 * Returns null if not set.
 */
export function getCurrentChatId(): string | null {
  return localStorage.getItem(STORAGE_KEYS.CURRENT_CHAT_ID);
}

/**
 * Sets the current chat ID in localStorage.
 * Pass null to clear.
 */
export function setCurrentChatId(chatId: string | null): void {
  if (chatId === null) {
    localStorage.removeItem(STORAGE_KEYS.CURRENT_CHAT_ID);
  } else {
    localStorage.setItem(STORAGE_KEYS.CURRENT_CHAT_ID, chatId);
  }
}
