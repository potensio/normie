/**
 * Provider configuration for the settings UI
 * 
 * Defines all supported AI providers with their authentication types,
 * help links, and display information.
 */

export type AuthType = 'simple' | 'oauth' | 'bedrock' | 'azure' | 'local';

export interface ProviderConfig {
  id: string;
  name: string;
  description: string;
  authType: AuthType;
  getKeyUrl?: string;
  docsUrl?: string;
  icon: string;
  oauthProvider?: 'github' | 'google' | 'anthropic' | 'openai';
}

/**
 * Simple API key providers - single key input
 */
export const SIMPLE_KEY_PROVIDERS: ProviderConfig[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    description: 'Access Claude models for AI assistance.',
    authType: 'simple',
    getKeyUrl: 'https://console.anthropic.com/settings/keys',
    docsUrl: 'https://docs.anthropic.com',
    icon: 'anthropic',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'Access GPT-4, GPT-4 Turbo, and other OpenAI models.',
    authType: 'simple',
    getKeyUrl: 'https://platform.openai.com/api-keys',
    docsUrl: 'https://platform.openai.com/docs',
    icon: 'openai',
  },
  {
    id: 'google',
    name: 'Google AI',
    description: 'Access Gemini models from Google.',
    authType: 'simple',
    getKeyUrl: 'https://aistudio.google.com/app/apikey',
    docsUrl: 'https://ai.google.dev/docs',
    icon: 'google',
  },
  {
    id: 'groq',
    name: 'Groq',
    description: 'Fast inference with Llama, Mixtral, and more.',
    authType: 'simple',
    getKeyUrl: 'https://console.groq.com/keys',
    docsUrl: 'https://console.groq.com/docs',
    icon: 'groq',
  },
  {
    id: 'mistral',
    name: 'Mistral',
    description: 'Access Mistral and Codestral models.',
    authType: 'simple',
    getKeyUrl: 'https://console.mistral.ai/api-keys/',
    docsUrl: 'https://docs.mistral.ai/',
    icon: 'mistral',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Access multiple AI providers through one API.',
    authType: 'simple',
    getKeyUrl: 'https://openrouter.ai/keys',
    docsUrl: 'https://openrouter.ai/docs',
    icon: 'openrouter',
  },
  {
    id: 'xai',
    name: 'xAI',
    description: 'Access Grok and other xAI models.',
    authType: 'simple',
    getKeyUrl: 'https://console.x.ai/',
    docsUrl: 'https://docs.x.ai/',
    icon: 'xai',
  },
  {
    id: 'kimi-coding',
    name: 'Kimi Coding',
    description: 'Access Kimi coding models from Moonshot AI.',
    authType: 'simple',
    getKeyUrl: 'https://platform.moonshot.cn/',
    docsUrl: 'https://platform.moonshot.cn/docs',
    icon: 'kimi',
  },
  {
    id: 'zai',
    name: 'ZAI',
    description: 'Access GLM models from Zhipu AI.',
    authType: 'simple',
    getKeyUrl: 'https://open.bigmodel.cn/',
    docsUrl: 'https://open.bigmodel.cn/dev/api',
    icon: 'zai',
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    description: 'Ultra-fast inference with Llama models.',
    authType: 'simple',
    getKeyUrl: 'https://cloud.cerebras.ai/',
    docsUrl: 'https://inference-docs.cerebras.ai/',
    icon: 'cerebras',
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    description: 'Access MiniMax AI models.',
    authType: 'simple',
    getKeyUrl: 'https://www.minimaxi.com/',
    docsUrl: 'https://www.minimaxi.com/document/',
    icon: 'minimax',
  },
  {
    id: 'opencode',
    name: 'OpenCode Zen',
    description: 'Open source coding assistant models (OpenCode Zen).',
    authType: 'simple',
    docsUrl: 'https://github.com/opencode-ai/opencode',
    icon: 'opencode',
  },
  {
    id: 'opencode-go',
    name: 'OpenCode Go',
    description: 'OpenCode Go models.',
    authType: 'simple',
    docsUrl: 'https://github.com/opencode-ai/opencode',
    icon: 'opencode',
  },
];

/**
 * OAuth providers - require OAuth login flow
 */
export const OAUTH_PROVIDERS: ProviderConfig[] = [
  {
    id: 'github-copilot',
    name: 'GitHub Copilot',
    description: 'Access GitHub Copilot AI models via your GitHub account.',
    authType: 'oauth',
    oauthProvider: 'github',
    docsUrl: 'https://docs.github.com/en/copilot',
    icon: 'github',
  },
  {
    id: 'google-gemini-cli',
    name: 'Google Gemini CLI',
    description: 'Access Gemini models via Google Cloud Code Assist (free with any Google account).',
    authType: 'oauth',
    oauthProvider: 'google',
    docsUrl: 'https://cloud.google.com/code/docs',
    icon: 'google',
  },
  {
    id: 'google-antigravity',
    name: 'Google Antigravity',
    description: 'Sandbox with Gemini 3, Claude, and GPT-OSS models (free with any Google account).',
    authType: 'oauth',
    oauthProvider: 'google',
    docsUrl: 'https://cloud.google.com/code/docs',
    icon: 'google',
  },
  {
    id: 'openai-codex',
    name: 'OpenAI Codex',
    description: 'Access Codex models via ChatGPT Plus/Pro subscription.',
    authType: 'oauth',
    oauthProvider: 'openai',
    docsUrl: 'https://platform.openai.com/docs',
    icon: 'openai',
  },
];

/**
 * Cloud providers - complex authentication (AWS, Azure)
 */
export const CLOUD_PROVIDERS: ProviderConfig[] = [
  {
    id: 'bedrock',
    name: 'Amazon Bedrock',
    description: 'Access AWS Bedrock foundation models using AWS credentials.',
    authType: 'bedrock',
    docsUrl: 'https://docs.aws.amazon.com/bedrock/',
    icon: 'aws',
  },
  {
    id: 'azure',
    name: 'Azure OpenAI',
    description: 'Access OpenAI models through Azure AI Services.',
    authType: 'azure',
    getKeyUrl: 'https://portal.azure.com/',
    docsUrl: 'https://learn.microsoft.com/azure/ai-services/openai/',
    icon: 'azure',
  },
];

/**
 * Local providers - no authentication required
 */
export const LOCAL_PROVIDERS: ProviderConfig[] = [
  {
    id: 'ollama',
    name: 'Ollama',
    description: 'Run models locally. No API key required.',
    authType: 'local',
    docsUrl: 'https://ollama.ai/',
    icon: 'ollama',
  },
];

/**
 * All providers combined
 */
export const ALL_PROVIDERS = [
  ...SIMPLE_KEY_PROVIDERS,
  ...OAUTH_PROVIDERS,
  ...CLOUD_PROVIDERS,
  ...LOCAL_PROVIDERS,
];

/**
 * Get provider config by ID
 */
export function getProviderConfig(providerId: string): ProviderConfig | undefined {
  return ALL_PROVIDERS.find(p => p.id === providerId);
}