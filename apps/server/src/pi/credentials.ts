/**
 * Credential Resolution for Pi Agent
 * 
 * Provides per-request credential injection WITHOUT mutating process.env.
 * Each request gets its own credentials passed through the Agent's
 * getApiKey callback and stream options.
 */

import { getApiKey } from '../auth/api-keys.js';

/**
 * Provider name aliases (normie -> Pi)
 */
export const PROVIDER_ALIAS: Record<string, string> = {
  bedrock: 'amazon-bedrock',
  azure: 'azure-openai-responses',
};

/**
 * Environment variable mapping for fallback
 */
const ENV_KEY_MAP: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GEMINI_API_KEY',
  groq: 'GROQ_API_KEY',
  xai: 'XAI_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  cerebras: 'CEREBRAS_API_KEY',
  'kimi-coding': 'KIMI_API_KEY',
  opencode: 'OPENCODE_API_KEY',
  minimax: 'MINIMAX_API_KEY',
  zai: 'ZAI_API_KEY',
  'azure-openai-responses': 'AZURE_OPENAI_API_KEY',
  'amazon-bedrock': 'AWS_ACCESS_KEY_ID', // Primary key for Bedrock check
};

/**
 * Normalize provider name to Pi format
 */
export function normalizeProvider(provider: string): string {
  return PROVIDER_ALIAS[provider] || provider;
}

/**
 * Resolved credentials for a provider
 */
export interface ResolvedCredentials {
  /** Whether credentials are available */
  configured: boolean;
  /** Source of credentials */
  source: 'user' | 'env' | 'none';
  /** API key for simple providers */
  apiKey?: string;
  /** Provider-specific stream options */
  streamOptions?: Record<string, unknown>;
  /** Error message if not configured */
  error?: string;
}

/**
 * Reverse alias map - Pi provider ID to normie provider ID
 */
const REVERSE_ALIAS: Record<string, string> = {
  'amazon-bedrock': 'bedrock',
  'azure-openai-responses': 'azure',
};

/**
 * Resolve credentials for a provider.
 * 
 * Priority:
 * 1. User's stored API key from database
 * 2. Environment variable fallback
 * 
 * IMPORTANT: This does NOT mutate process.env
 */
export async function resolveCredentials(
  userId: string,
  provider: string
): Promise<ResolvedCredentials> {
  const normalizedProvider = normalizeProvider(provider);
  
  // Get user's stored key
  // The database uses short names (bedrock, azure), but Pi uses full names (amazon-bedrock, azure-openai-responses)
  const dbProvider = REVERSE_ALIAS[normalizedProvider] || provider;
  const userKey = await getApiKey(userId, dbProvider);
  
  console.log(`[Credentials] Lookup: provider=${provider}, normalized=${normalizedProvider}, dbProvider=${dbProvider}, found=${!!userKey}`);
  
  // Handle complex providers differently
  if (normalizedProvider === 'amazon-bedrock') {
    return resolveBedrockCredentials(userKey);
  }
  
  if (normalizedProvider === 'azure-openai-responses') {
    return resolveAzureCredentials(userKey);
  }
  
  // Simple API key providers
  if (userKey) {
    return {
      configured: true,
      source: 'user',
      apiKey: userKey,
    };
  }
  
  // Fall back to environment variable
  const envKey = ENV_KEY_MAP[normalizedProvider];
  if (envKey && process.env[envKey]) {
    return {
      configured: true,
      source: 'env',
      apiKey: process.env[envKey],
    };
  }
  
  // No credentials available
  return {
    configured: false,
    source: 'none',
    error: `No API key configured for ${provider}. Add your key in Settings > Providers.`,
  };
}

/**
 * AWS Bedrock credential data for runtime injection.
 * Used when the stored credentials contain access keys.
 */
export interface BedrockCredentialData {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  sessionToken?: string;
}

/**
 * Extended resolved credentials with Bedrock-specific data.
 */
export interface BedrockResolvedCredentials extends ResolvedCredentials {
  /** Bedrock-specific credential data for runtime injection */
  bedrockCredentials?: BedrockCredentialData;
}

/**
 * Resolve AWS Bedrock credentials.
 * 
 * Supports two auth modes:
 * 1. Profile - AWS profile name
 * 2. Credentials - Access Key + Secret Key + Region
 * 
 * For access key auth, we return the credentials in `bedrockCredentials`
 * which will be injected into the AWS SDK client at runtime.
 */
async function resolveBedrockCredentials(
  storedKey: string | null
): Promise<BedrockResolvedCredentials> {
  console.log('[BedrockCredentials] Resolving, hasStoredKey:', !!storedKey);
  
  // If user has stored credentials
  if (storedKey) {
    try {
      const creds = JSON.parse(storedKey);
      console.log('[BedrockCredentials] Parsed credentials:', {
        authMode: creds.authMode,
        hasAccessKey: !!creds.accessKey,
        hasSecretKey: !!creds.secretKey,
        profile: creds.profile,
        region: creds.region,
      });
      
      if (creds.authMode === 'profile') {
        // Profile-based auth - pass through to Bedrock
        console.log('[BedrockCredentials] Using profile-based auth:', creds.profile || 'default');
        return {
          configured: true,
          source: 'user',
          streamOptions: {
            profile: creds.profile || 'default',
          },
        };
      } else {
        // Access key auth - validate required fields
        if (!creds.accessKey || !creds.secretKey) {
          console.log('[BedrockCredentials] Missing access key or secret key');
          return {
            configured: false,
            source: 'none',
            error: 'AWS credentials require both Access Key and Secret Key',
          };
        }
        
        console.log('[BedrockCredentials] Using access key auth for region:', creds.region || 'us-east-1');
        
        // Return credentials for runtime injection
        // The bedrockCredentials will be used to configure the AWS SDK client
        return {
          configured: true,
          source: 'user',
          streamOptions: {
            region: creds.region || 'us-east-1',
          },
          bedrockCredentials: {
            accessKeyId: creds.accessKey,
            secretAccessKey: creds.secretKey,
            region: creds.region || 'us-east-1',
            sessionToken: creds.sessionToken,
          },
        };
      }
    } catch (err) {
      return {
        configured: false,
        source: 'none',
        error: 'Invalid Bedrock credentials format',
      };
    }
  }
  
  // Check for environment credentials (AWS SDK default chain)
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    return {
      configured: true,
      source: 'env',
      streamOptions: {
        region: process.env.AWS_REGION || 'us-east-1',
      },
    };
  }
  
  // Check for AWS profile
  if (process.env.AWS_PROFILE) {
    return {
      configured: true,
      source: 'env',
      streamOptions: {
        profile: process.env.AWS_PROFILE,
      },
    };
  }
  
  return {
    configured: false,
    source: 'none',
    error: 'No AWS Bedrock credentials configured. Add your credentials in Settings > Providers.',
  };
}

/**
 * Resolve Azure OpenAI credentials.
 * 
 * Azure requires:
 * - apiKey
 * - azureResourceName (or azureBaseUrl)
 * - azureDeploymentName
 * - azureApiVersion (optional, has default)
 */
async function resolveAzureCredentials(
  storedKey: string | null
): Promise<ResolvedCredentials> {
  if (storedKey) {
    try {
      const creds = JSON.parse(storedKey);
      
      // Validate required fields
      if (!creds.apiKey || !creds.resourceName || !creds.deploymentName) {
        return {
          configured: false,
          source: 'none',
          error: 'Azure requires apiKey, resourceName, and deploymentName',
        };
      }
      
      return {
        configured: true,
        source: 'user',
        apiKey: creds.apiKey,
        streamOptions: {
          azureResourceName: creds.resourceName,
          azureDeploymentName: creds.deploymentName,
          azureApiVersion: creds.apiVersion || '2024-12-01-preview',
        },
      };
    } catch (err) {
      return {
        configured: false,
        source: 'none',
        error: 'Invalid Azure credentials format',
      };
    }
  }
  
  // Fall back to environment
  if (process.env.AZURE_OPENAI_API_KEY) {
    const resourceName = process.env.AZURE_OPENAI_RESOURCE_NAME;
    const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
    
    // Validate all required Azure fields are present
    if (!resourceName || !deploymentName) {
      return {
        configured: false,
        source: 'none',
        error: 'Azure requires AZURE_OPENAI_RESOURCE_NAME and AZURE_OPENAI_DEPLOYMENT_NAME env vars',
      };
    }
    
    return {
      configured: true,
      source: 'env',
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      streamOptions: {
        azureResourceName: resourceName,
        azureDeploymentName: deploymentName,
        azureApiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-12-01-preview',
      },
    };
  }
  
  return {
    configured: false,
    source: 'none',
    error: 'No Azure OpenAI credentials configured',
  };
}

/**
 * Create a getApiKey callback for the Agent.
 * 
 * This callback is used by the Agent to dynamically resolve
 * API keys for each LLM call, allowing per-request credential
 * injection without environment mutation.
 */
/**
 * Create a getApiKey callback for Pi Agent.
 * 
 * This callback pattern allows Pi Agent to fetch credentials
 * on-demand during streaming. The provider parameter enables
 * future multi-provider scenarios where an agent might switch
 * between providers.
 * 
 * For now, we return credentials for the originally resolved provider.
 * Multi-provider support would require storing a map of provider->credentials.
 */
export function createGetApiKeyCallback(
  credentials: ResolvedCredentials,
  resolvedProvider: string
) {
  return async (provider: string): Promise<string | undefined> => {
    // Validate provider matches (future: support multi-provider)
    if (provider !== resolvedProvider) {
      console.warn(
        `[Credentials] Agent requested key for '${provider}' but we resolved for '${resolvedProvider}'. ` +
        `Multi-provider credential switching not yet supported.`
      );
      return undefined;
    }
    
    // Return the resolved API key
    // This callback may be called multiple times during a long-running
    // agent run, allowing for credential refresh if needed
    return credentials.apiKey;
  };
}

/**
 * Build stream options for the Agent.
 * 
 * Combines the resolved credentials with any provider-specific options
 * that should be passed to the stream function.
 */
export function buildStreamOptions(credentials: ResolvedCredentials): Record<string, unknown> {
  const options: Record<string, unknown> = {};
  
  // Add API key if present (for simple providers)
  if (credentials.apiKey) {
    options.apiKey = credentials.apiKey;
  }
  
  // Merge provider-specific options
  if (credentials.streamOptions) {
    Object.assign(options, credentials.streamOptions);
  }
  
  return options;
}