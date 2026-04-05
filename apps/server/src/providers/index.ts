/**
 * Provider Module (Legacy Stub)
 *
 * The legacy provider system has been replaced by Pi Agent.
 * This file provides minimal backward compatibility exports.
 *
 * @deprecated Use Pi Agent instead (see ../pi/index.ts)
 */

import { getEnabledProviders } from '../pi/index.js';

/**
 * Get list of available provider names
 * @deprecated Use getEnabledProviders from '../pi/index.js' instead
 */
export function getAvailableProviders(): string[] {
  return getEnabledProviders();
}

/**
 * Get a provider instance by name
 * @deprecated The legacy provider system has been removed. Use Pi Agent instead.
 * @throws Always throws an error explaining the deprecation
 */
export function getProvider(_providerName: string): never {
  throw new Error(
    'Legacy providers have been removed. Use Pi Agent instead. ' +
    'The /api/chat endpoint should use the new Pi-based implementation.'
  );
}

/**
 * Initialize providers
 * @deprecated No longer needed - Pi Agent initializes on demand
 */
export async function initializeProviders(): Promise<void> {
  // No-op - Pi Agent doesn't require pre-initialization
  console.log('[Providers] Legacy provider initialization skipped (Pi Agent used instead)');
}
