/**
 * Credential Resolution for Pi Agent
 *
 * Provides per-request credential injection WITHOUT mutating process.env.
 * Each request gets its own credentials passed through the Agent's
 * getApiKey callback and stream options.
 */

import { getApiKey, getSystemApiKey } from "../auth/api-keys.js";

/**
 * Provider name aliases (normie -> Pi)
 */
export const PROVIDER_ALIAS: Record<string, string> = {
  bedrock: "amazon-bedrock",
  azure: "azure-openai-responses",
  normie: "amazon-bedrock", // Normie AI - powered by Bedrock
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
  source: "user" | "env" | "none";
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
  "amazon-bedrock": "bedrock",
  "azure-openai-responses": "azure",
};

/**
 * Check if provider uses owner-managed credentials (not user keys)
 */
function isOwnerManagedProvider(normalizedProvider: string): boolean {
  return normalizedProvider === "amazon-bedrock" || normalizedProvider === "normie";
}

/**
 * Resolve credentials for a provider.
 *
 * Priority:
 * 1. Normie AI → system_api_keys (owner-managed)
 * 2. User's stored API key from database (user_api_keys)
 * 3. NO FALLBACK (fail fast if not configured)
 *
 * IMPORTANT: This does NOT mutate process.env
 */
export async function resolveCredentials(
  userId: string,
  provider: string,
): Promise<ResolvedCredentials> {
  const normalizedProvider = normalizeProvider(provider);

  console.log(
    `[Credentials] Lookup: provider=${provider}, normalized=${normalizedProvider}`,
  );

  // Normie AI uses system API keys (owner-managed, not per-user)
  if (provider === "normie") {
    return resolveNormieCredentials();
  }

  // Amazon Bedrock uses user's own env vars (they bring their own AWS account)
  if (normalizedProvider === "amazon-bedrock") {
    return resolveBedrockCredentials(null);
  }

  // Azure OpenAI has special handling
  if (normalizedProvider === "azure-openai-responses") {
    // Get user's stored key
    const dbProvider = REVERSE_ALIAS[normalizedProvider] || provider;
    const userKey = await getApiKey(userId, dbProvider);
    return resolveAzureCredentials(userKey);
  }

  // Get user's stored key for other providers
  const dbProvider = REVERSE_ALIAS[normalizedProvider] || provider;
  const userKey = await getApiKey(userId, dbProvider);

  console.log(
    `[Credentials] User key found: ${!!userKey}`,
  );

  // Simple API key providers - user must have their own key
  if (userKey) {
    return {
      configured: true,
      source: "user",
      apiKey: userKey,
    };
  }

  // No credentials available - NO FALLBACK
  return {
    configured: false,
    source: "none",
    error: `No API key configured for ${provider}. Add your key in Settings > Providers.`,
  };
}

/**
 * Resolve Normie AI credentials.
 *
 * Normie is a built-in provider powered by Bedrock.
 * Credentials are stored in system_api_keys table (owner-managed).
 */
async function resolveNormieCredentials(): Promise<ResolvedCredentials> {
  console.log("[NormieCredentials] Resolving credentials...");

  const systemKey = await getSystemApiKey("normie");

  if (systemKey?.apiKey && systemKey?.baseUrl) {
    console.log("[NormieCredentials] Using system API key from database");
    console.log(
      `[NormieCredentials]   Base URL: ${systemKey.baseUrl}`,
    );

    return {
      configured: true,
      source: "user", // 'user' here means 'stored in DB' not 'per-user'
      apiKey: systemKey.apiKey,
      streamOptions: {
        baseUrl: systemKey.baseUrl,
      },
    };
  }

  console.log("[NormieCredentials] No credentials found in system_api_keys");
  return {
    configured: false,
    source: "none",
    error:
      "Normie AI is not configured. Add API key to system_api_keys table.",
  };
}

/**
 * Resolve AWS Bedrock credentials (user's own Bedrock account).
 *
 * Uses OpenAI-compatible API exclusively.
 * User must provide their own BEDROCK_API_KEY and BEDROCK_BASE_URL.
 * 
 * NO FALLBACK - user must configure their own credentials.
 */
async function resolveBedrockCredentials(
  _storedKey: string | null, // Ignored - Bedrock requires env vars
): Promise<ResolvedCredentials> {
  console.log("[BedrockCredentials] Resolving credentials...");

  // Bedrock requires environment variables (user's own AWS account)
  if (process.env.BEDROCK_API_KEY && process.env.BEDROCK_BASE_URL) {
    console.log("[BedrockCredentials] Using env credentials");
    console.log(
      `[BedrockCredentials]   Base URL: ${process.env.BEDROCK_BASE_URL}`,
    );

    return {
      configured: true,
      source: "env",
    };
  }

  // No credentials configured
  console.log("[BedrockCredentials] No credentials found");
  return {
    configured: false,
    source: "none",
    error:
      "Amazon Bedrock requires BEDROCK_API_KEY and BEDROCK_BASE_URL environment variables.",
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
  storedKey: string | null,
): Promise<ResolvedCredentials> {
  if (storedKey) {
    try {
      const creds = JSON.parse(storedKey);

      // Validate required fields
      if (!creds.apiKey || !creds.resourceName || !creds.deploymentName) {
        return {
          configured: false,
          source: "none",
          error: "Azure requires apiKey, resourceName, and deploymentName",
        };
      }

      return {
        configured: true,
        source: "user",
        apiKey: creds.apiKey,
        streamOptions: {
          azureResourceName: creds.resourceName,
          azureDeploymentName: creds.deploymentName,
          azureApiVersion: creds.apiVersion || "2024-12-01-preview",
        },
      };
    } catch (err) {
      return {
        configured: false,
        source: "none",
        error: "Invalid Azure credentials format",
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
        source: "none",
        error:
          "Azure requires AZURE_OPENAI_RESOURCE_NAME and AZURE_OPENAI_DEPLOYMENT_NAME env vars",
      };
    }

    return {
      configured: true,
      source: "env",
      apiKey: process.env.AZURE_OPENAI_API_KEY,
      streamOptions: {
        azureResourceName: resourceName,
        azureDeploymentName: deploymentName,
        azureApiVersion:
          process.env.AZURE_OPENAI_API_VERSION || "2024-12-01-preview",
      },
    };
  }

  return {
    configured: false,
    source: "none",
    error: "No Azure OpenAI credentials configured",
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
  resolvedProvider: string,
) {
  return async (provider: string): Promise<string | undefined> => {
    // Validate provider matches (future: support multi-provider)
    if (provider !== resolvedProvider) {
      console.warn(
        `[Credentials] Agent requested key for '${provider}' but we resolved for '${resolvedProvider}'. ` +
          `Multi-provider credential switching not yet supported.`,
      );
      return undefined;
    }

    // Return the resolved API key
    return credentials.apiKey;
  };
}
