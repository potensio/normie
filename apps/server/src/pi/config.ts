/**
 * Pi Agent Configuration Module
 * 
 * Loads configuration from environment variables and provides
 * validated access to Pi AI models and providers.
 */

import { getModel, getProviders } from "@mariozechner/pi-ai";
import type { Model } from "@mariozechner/pi-ai";

export interface PiConfig {
  defaultProvider: string;
  defaultModel: string;
  enabledProviders: string[];
  apiKeys: Record<string, string>;
}

/**
 * Map of provider IDs to their environment variable names
 * Based on official Pi docs: https://github.com/badlogic/pi-mono/blob/main/packages/ai/src/env-api-keys.ts
 */
const PROVIDER_ENV_KEYS: Record<string, string[]> = {
  // Simple API key providers
  anthropic: ["ANTHROPIC_API_KEY"],
  openai: ["OPENAI_API_KEY"],
  google: ["GEMINI_API_KEY", "GOOGLE_API_KEY"],
  groq: ["GROQ_API_KEY"],
  xai: ["XAI_API_KEY"],
  mistral: ["MISTRAL_API_KEY"],
  openrouter: ["OPENROUTER_API_KEY"],
  cerebras: ["CEREBRAS_API_KEY"],
  "kimi-coding": ["KIMI_API_KEY"],
  zai: ["ZAI_API_KEY"],
  minimax: ["MINIMAX_API_KEY"],
  opencode: ["OPENCODE_API_KEY"],
  "opencode-go": ["OPENCODE_API_KEY"],
  
  // OAuth/subscription providers (no env key, use /login)
  "github-copilot": [],
  "google-gemini-cli": [],
  "google-antigravity": [],
  "openai-codex": [],
  
  // Local providers
  ollama: [],
  
  // Cloud providers
  "amazon-bedrock": ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_PROFILE", "AWS_BEARER_TOKEN_BEDROCK"],
  "azure-openai-responses": ["AZURE_OPENAI_API_KEY"],
};

/**
 * Map normie provider names to Pi provider names
 */
export const PROVIDER_ALIAS: Record<string, string> = {
  bedrock: "amazon-bedrock",
  azure: "azure-openai-responses",
};

/**
 * Load Pi Agent configuration from environment
 */
export function loadPiConfig(): PiConfig {
  const rawProvider = process.env.DEFAULT_PROVIDER || "anthropic";
  const defaultProvider = PROVIDER_ALIAS[rawProvider] || rawProvider;
  
  // BYOK model: enable all providers by default, users provide their own keys
  // Get all available providers from Pi AI registry
  const allProviders = getProviders();
  
  const rawEnabledProviders = (
    process.env.ENABLED_PROVIDERS || allProviders.join(",")
  ).split(",").map(p => p.trim());
  
  // Map provider aliases
  const enabledProviders = rawEnabledProviders.map(
    p => PROVIDER_ALIAS[p] || p
  );

  // Load API keys
  const apiKeys: Record<string, string> = {};
  for (const [provider, envKeys] of Object.entries(PROVIDER_ENV_KEYS)) {
    if (envKeys.length === 0) {
      apiKeys[provider] = ""; // Local providers like ollama
    } else if (envKeys.length === 1) {
      apiKeys[provider] = process.env[envKeys[0]] || "";
    } else {
      // Multiple keys needed (e.g., Bedrock needs both access key and secret)
      apiKeys[provider] = envKeys
        .map(k => process.env[k])
        .filter(Boolean)
        .join(":");
    }
  }

  return {
    defaultProvider,
    defaultModel: process.env.DEFAULT_MODEL || "claude-opus-4-5",
    enabledProviders,
    apiKeys,
  };
}

/**
 * Validate configuration on startup
 * Logs warnings for missing API keys but doesn't throw
 */
export function validatePiConfig(config: PiConfig): void {
  const availableProviders = getProviders();

  // Check default provider is available
  if (!availableProviders.includes(config.defaultProvider as any)) {
    console.warn(
      `[PiConfig] Default provider '${config.defaultProvider}' not found in Pi AI registry. ` +
      `Available: ${availableProviders.join(", ")}`
    );
  }

  // Check default provider is enabled
  if (!config.enabledProviders.includes(config.defaultProvider)) {
    console.warn(
      `[PiConfig] Default provider '${config.defaultProvider}' is not in enabled providers list. ` +
      `Enabled: ${config.enabledProviders.join(", ")}`
    );
  }

  // Try to get the default model
  try {
    const model = getModel(config.defaultProvider as any, config.defaultModel as any);
    if (!model) {
      console.warn(
        `[PiConfig] Default model '${config.defaultProvider}/${config.defaultModel}' not found. ` +
        `Model may need to be specified explicitly.`
      );
    }
  } catch (error) {
    console.warn(
      `[PiConfig] Could not validate default model: ${(error as Error).message}`
    );
  }

  // Info about API keys for enabled providers (BYOK model)
  for (const provider of config.enabledProviders) {
    const needsKey = PROVIDER_ENV_KEYS[provider]?.length;
    if (needsKey && !config.apiKeys[provider]) {
      console.info(
        `[PiConfig] Provider '${provider}' enabled but no API key configured. ` +
        `Set ${PROVIDER_ENV_KEYS[provider]?.join(' or ')} to use this provider.`
      );
    }
  }
}

/**
 * Get model with validation
 * Throws if provider is not enabled or model is not found
 */
export function getValidatedModel(provider: string, modelId: string): Model<any> {
  const config = loadPiConfig();
  
  // Map provider alias
  const mappedProvider = PROVIDER_ALIAS[provider] || provider;

  // Check provider is enabled
  if (!config.enabledProviders.includes(mappedProvider)) {
    throw new Error(
      `Provider '${provider}' is not enabled. ` +
      `Enabled providers: ${config.enabledProviders.join(", ")}`
    );
  }

  // Get model
  const model = getModel(mappedProvider as any, modelId as any);
  if (!model) {
    throw new Error(`Model '${provider}/${modelId}' not found`);
  }

  return model;
}

/**
 * Get enabled providers list
 */
export function getEnabledProviders(): string[] {
  const config = loadPiConfig();
  return config.enabledProviders;
}

/**
 * Check if a provider has an API key configured
 */
export function hasApiKey(provider: string): boolean {
  const config = loadPiConfig();
  const mappedProvider = PROVIDER_ALIAS[provider] || provider;
  return !!config.apiKeys[mappedProvider];
}
