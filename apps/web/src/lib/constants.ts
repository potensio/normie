import type { ProviderModels, Provider } from '@normie/types';

// Model configurations per provider - from working reference (3a7ae8b)
export const PROVIDER_MODELS: ProviderModels = {
  claude: [
    { value: 'claude-opus-4-5-20250514', label: 'Opus 4.5', desc: 'Most capable for complex work' },
    { value: 'claude-sonnet-4-5-20250514', label: 'Sonnet 4.5', desc: 'Best for everyday tasks', default: true },
    { value: 'claude-haiku-4-5-20250514', label: 'Haiku 4.5', desc: 'Fastest for quick answers' }
  ],
  opencode: [
    // Opencode Zen (Free)
    { value: 'opencode/big-pickle', label: 'Big Pickle', desc: 'Reasoning model', default: true },
    { value: 'opencode/gpt-5-nano', label: 'GPT-5 Nano', desc: 'OpenAI reasoning' },
    { value: 'opencode/glm-4.7-free', label: 'GLM-4.7', desc: 'Zhipu GLM free' },
    { value: 'opencode/grok-code', label: 'Grok Code Fast', desc: 'xAI coding model' },
    { value: 'opencode/minimax-m2.1-free', label: 'MiniMax M2.1', desc: 'MiniMax free' },
    // Anthropic Claude
    { value: 'anthropic/claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5', desc: 'Best balance' },
    { value: 'anthropic/claude-opus-4-5-20251101', label: 'Claude Opus 4.5', desc: 'Most capable' },
    { value: 'anthropic/claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', desc: 'Fastest' }
  ],
  kimi: [
    { value: 'kimi-for-coding', label: 'Kimi Coding', desc: 'Kimi for coding tasks', default: true }
  ],
  bedrock: [
    { value: 'zai.glm-5', label: 'GLM-5', desc: 'Reasoning model', default: true },
    { value: 'moonshotai.kimi-k2.5', label: 'Kimi K2.5', desc: 'Moonshot AI model' }
  ]
};

export const PROVIDER_LABELS: Record<Provider, string> = {
  claude: 'Claude',
  opencode: 'Opencode',
  kimi: 'Kimi',
  bedrock: 'Bedrock'
};

export const DEFAULT_PROVIDER: Provider = 'claude';

export function getDefaultModel(provider: Provider): string {
  const models = PROVIDER_MODELS[provider];
  const defaultModel = models?.find(m => m.default);
  return defaultModel?.value || models?.[0]?.value || '';
}

export function getModelLabel(provider: Provider, modelValue: string): string {
  const models = PROVIDER_MODELS[provider];
  const model = models?.find(m => m.value === modelValue);
  return model?.label || modelValue;
}

/**
 * Validates that a model exists in the provider's model list.
 * Used to check if a saved model preference is still valid.
 */
export function isValidModel(provider: Provider, model: string): boolean {
  const models = PROVIDER_MODELS[provider];
  return models?.some(m => m.value === model) ?? false;
}
