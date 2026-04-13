/**
 * Constants - Default values and fallbacks
 * 
 * Provider model lists are now fetched dynamically from the API.
 * This file only contains fallback defaults for when the API is unavailable.
 */

import type { Provider, PiProviderInfo } from '@normie/types';

// Default provider/model for initial state (before API load)
export const DEFAULT_PROVIDER: Provider = 'anthropic';
export const DEFAULT_MODEL = 'claude-opus-4-5';

// Fallback provider list for when API is unavailable
export const FALLBACK_PROVIDERS: Provider[] = [
  'anthropic',
  'openai',
  'google',
  'groq',
];

// Fallback models for offline/error states
// These are only used if the API fails to load
export const FALLBACK_MODELS: Record<string, Array<{ value: string; label: string; desc?: string }>> = {
  anthropic: [
    { value: 'claude-opus-4-5', label: 'Opus 4.5', desc: 'Most capable' },
    { value: 'claude-sonnet-4-5', label: 'Sonnet 4.5', desc: 'Best for everyday tasks' },
    { value: 'claude-haiku-4-5', label: 'Haiku 4.5', desc: 'Fastest' },
  ],
  openai: [
    { value: 'gpt-5', label: 'GPT-5', desc: 'Most capable' },
    { value: 'gpt-4.1', label: 'GPT-4.1', desc: 'Highly capable' },
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini', desc: 'Fast' },
  ],
  google: [
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', desc: 'Most capable' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', desc: 'Fast' },
  ],
  groq: [
    { value: 'llama-4-maverick', label: 'Llama 4 Maverick', desc: 'Fast open model' },
    { value: 'llama-4-scout', label: 'Llama 4 Scout', desc: 'Balanced' },
  ],
};

// Provider display names
export const PROVIDER_LABELS: Record<string, string> = {
  // Simple API key providers
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google AI',
  groq: 'Groq',
  xai: 'xAI',
  mistral: 'Mistral',
  openrouter: 'OpenRouter',
  cerebras: 'Cerebras',
  'kimi-coding': 'Kimi Coding',
  zai: 'ZAI',
  minimax: 'MiniMax',
  opencode: 'OpenCode Zen',
  'opencode-go': 'OpenCode Go',
  
  // OAuth/subscription providers
  'github-copilot': 'GitHub Copilot',
  'google-gemini-cli': 'Google Gemini CLI',
  'google-antigravity': 'Google Antigravity',
  'openai-codex': 'OpenAI Codex',
  
  // Local providers
  ollama: 'Ollama',
  
  // Cloud providers
  'amazon-bedrock': 'Amazon Bedrock',
  'azure-openai-responses': 'Azure OpenAI',
  
  // Alias mappings (for backward compatibility)
  bedrock: 'Amazon Bedrock',
  azure: 'Azure OpenAI',
  kimi: 'Kimi Coding',
};

// Legacy PROVIDER_MODELS for backward compatibility
// Deprecated: Use models from /api/providers instead
export const PROVIDER_MODELS = FALLBACK_MODELS;

/**
 * Get the default model for a provider (uses fallback data)
 */
export function getDefaultModel(provider: Provider): string {
  const models = FALLBACK_MODELS[provider];
  return models?.[0]?.value || '';
}

/**
 * Validates that a model exists in the provider's fallback list.
 * Note: This only checks fallback data, not the dynamic catalog.
 */
export function isValidModel(provider: Provider, model: string): boolean {
  const models = FALLBACK_MODELS[provider];
  return models?.some(m => m.value === model) ?? false;
}

/**
 * Get provider display name
 */
export function getProviderLabel(provider: Provider): string {
  return PROVIDER_LABELS[provider] || provider;
}

/**
 * Get models as options for a provider from Pi catalog
 * Used when the dynamic catalog from /api/providers is available
 */
export function getModelsFromCatalog(
  catalog: PiProviderInfo[] | undefined,
  providerId: string
): Array<{ value: string; label: string; desc?: string }> {
  if (!catalog) return FALLBACK_MODELS[providerId] || [];
  
  const providerInfo = catalog.find(p => p.id === providerId);
  if (!providerInfo) return FALLBACK_MODELS[providerId] || [];
  
  return providerInfo.models.map(m => ({
    value: m.id,
    label: m.name,
    desc: m.reasoning ? 'Reasoning model' : undefined
  }));
}

/**
 * Get all provider IDs from catalog
 */
export function getProvidersFromCatalog(
  catalog: PiProviderInfo[] | undefined
): Provider[] {
  if (!catalog) return Object.keys(PROVIDER_LABELS);
  return catalog.map(p => p.id);
}

/**
 * Get model display label
 */
export function getModelLabel(provider: Provider, modelValue: string): string {
  const models = FALLBACK_MODELS[provider];
  const model = models?.find(m => m.value === modelValue);
  return model?.label || modelValue;
}
