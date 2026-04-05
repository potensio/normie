/**
 * LocalStorage helper utilities.
 * Centralizes all localStorage access for the frontend.
 */
import type { Provider } from '@normie/types';
import { DEFAULT_PROVIDER, DEFAULT_MODEL } from '@/lib/constants';

/**
 * Storage keys as constants for type-safe access.
 */
export const STORAGE_KEYS = {
  PREFERRED_PROVIDER: 'selectedProvider',
  PREFERRED_MODEL: 'selectedModel',
  CURRENT_CHAT_ID: 'currentChatId',
} as const;

/**
 * Checks if a value is a non-empty string.
 */
function isNonEmptyString(value: string | null): value is string {
  return value !== null && value.length > 0;
}

/**
 * Gets the preferred provider from localStorage.
 * Returns DEFAULT_PROVIDER as default.
 */
export function getPreferredProvider(): Provider {
  const stored = localStorage.getItem(STORAGE_KEYS.PREFERRED_PROVIDER);
  
  if (isNonEmptyString(stored)) {
    return stored as Provider;
  }
  
  return DEFAULT_PROVIDER;
}

/**
 * Sets the preferred provider in localStorage.
 */
export function setPreferredProvider(provider: Provider): void {
  localStorage.setItem(STORAGE_KEYS.PREFERRED_PROVIDER, provider);
}

/**
 * Gets the preferred model from localStorage.
 * Returns DEFAULT_MODEL as default.
 */
export function getPreferredModel(): string {
  const stored = localStorage.getItem(STORAGE_KEYS.PREFERRED_MODEL);
  
  if (isNonEmptyString(stored)) {
    return stored;
  }
  
  return DEFAULT_MODEL;
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
