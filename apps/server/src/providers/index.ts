import { ClaudeProvider } from './claude-provider.js';
import { OpencodeProvider } from './opencode-provider.js';
import { KimiProvider } from './kimi-provider.js';
import { BedrockProvider } from './bedrock-provider.js';
import type { BaseProvider, ProviderConfig } from './base-provider.js';

// Provider registry
const providers: Record<string, new (config: ProviderConfig) => BaseProvider> = {
  claude: ClaudeProvider,
  opencode: OpencodeProvider,
  kimi: KimiProvider,
  bedrock: BedrockProvider
};

// Provider instance cache
const providerInstances: Map<string, BaseProvider> = new Map();

/**
 * Get a provider instance by name
 * Instances are cached and reused
 */
export function getProvider(providerName: string, config: ProviderConfig = {}): BaseProvider {
  const name = providerName?.toLowerCase() || 'claude';

  if (!providers[name]) {
    throw new Error(`Unknown provider: ${name}. Available providers: ${Object.keys(providers).join(', ')}`);
  }

  // Check cache
  const cacheKey = `${name}:${JSON.stringify(config)}`;
  if (providerInstances.has(cacheKey)) {
    return providerInstances.get(cacheKey)!;
  }

  // Create new instance
  const ProviderClass = providers[name];
  const instance = new ProviderClass(config);
  providerInstances.set(cacheKey, instance);

  return instance;
}

/**
 * Get list of available provider names
 */
export function getAvailableProviders(): string[] {
  return Object.keys(providers);
}

/**
 * Register a custom provider
 */
export function registerProvider(name: string, ProviderClass: new (config: ProviderConfig) => BaseProvider): void {
  providers[name.toLowerCase()] = ProviderClass;
}

/**
 * Clear provider instance cache
 */
export async function clearProviderCache(): Promise<void> {
  for (const instance of providerInstances.values()) {
    if (instance.cleanup) {
      await instance.cleanup();
    }
  }
  providerInstances.clear();
}

/**
 * Initialize providers
 */
export async function initializeProviders(): Promise<void> {
  console.log('[Providers] Initializing providers...');
  try {
    // Get and initialize opencode provider
    const opencodeProvider = getProvider('opencode');
    await opencodeProvider.initialize();
    console.log('[Providers] Opencode provider initialized');
  } catch (error) {
    console.error('[Providers] Error initializing providers:', (error as Error).message);
  }
}

// Export classes for direct use
export { ClaudeProvider } from './claude-provider.js';
export { OpencodeProvider } from './opencode-provider.js';
export { KimiProvider } from './kimi-provider.js';
export { BedrockProvider } from './bedrock-provider.js';
export { BaseProvider } from './base-provider.js';
