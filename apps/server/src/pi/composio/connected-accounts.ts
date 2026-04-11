/**
 * Composio Connected Accounts Management
 *
 * Connected Accounts link a user's authenticated session with a toolkit.
 * When a user connects their GitHub account, a connected account is created.
 *
 * Flow:
 * 1. User request requires a tool (e.g., "Star this GitHub repo")
 * 2. Check if user has a connected account for GitHub
 * 3. If not, initiate OAuth flow and return auth URL
 * 4. User authenticates, connection is established
 * 5. Tool can now execute with user's credentials
 *
 * @see https://docs.composio.dev/concepts/auth/connected-accounts
 */

import { getComposioClient, isComposioConfigured } from "./client.js";

/**
 * Connection request result
 */
export interface ConnectionRequest {
  /** Connection/Connected Account ID */
  id: string;
  /** URL to redirect user for authentication */
  redirectUrl: string;
  /** Whether this is a new connection or existing */
  isNew: boolean;
}

/**
 * Connected account status
 */
export interface ConnectedAccountStatus {
  /** Whether the account is connected */
  connected: boolean;
  /** Connected account ID if connected */
  connectedAccountId?: string;
  /** Toolkit slug */
  toolkitSlug: string;
  /** Account status */
  status?: string;
}

/**
 * Check if a user has a connected account for a toolkit
 */
export async function checkConnectedAccount(
  userId: string,
  toolkitSlug: string,
): Promise<ConnectedAccountStatus> {
  if (!isComposioConfigured()) {
    return {
      connected: false,
      toolkitSlug,
    };
  }

  const client = getComposioClient();

  try {
    // List connected accounts for this user (using snake_case for API)
    const response = await client.connectedAccounts.list({
      user_ids: [userId],
    } as any);

    // Find account for this toolkit that is active
    const accounts = response.items || [];
    const account = accounts.find(
      (acc: any) => acc.toolkit?.slug === toolkitSlug && acc.status === "ACTIVE"
    );

    if (account) {
      return {
        connected: true,
        connectedAccountId: account.id,
        toolkitSlug,
        status: "ACTIVE",
      };
    }

    return {
      connected: false,
      toolkitSlug,
    };
  } catch (error) {
    console.error(`[Composio] Failed to check connected account for ${toolkitSlug}:`, error);
    return {
      connected: false,
      toolkitSlug,
    };
  }
}

/**
 * Initiate OAuth connection for a toolkit.
 * Returns a URL for the user to authenticate.
 *
 * Uses Composio's managed auth by default.
 *
 * @param userId - Your user's ID
 * @param toolkitSlug - The toolkit to connect (e.g., 'github', 'gmail')
 * @param options - Connection options
 */
export async function initiateConnection(
  userId: string,
  toolkitSlug: string,
  options?: {
    /** Where to redirect after OAuth flow completes */
    callbackUrl?: string;
    /** Auth config ID if using custom OAuth */
    authConfigId?: string;
  },
): Promise<ConnectionRequest> {
  if (!isComposioConfigured()) {
    throw new Error("Composio not configured");
  }

  const client = getComposioClient();

  console.log(`[Composio] Initiating connection for ${toolkitSlug}`);

  // If no authConfigId provided, find the auth config for this toolkit
  let authConfigId = options?.authConfigId;
  if (!authConfigId) {
    const authConfigs = await client.authConfigs.list();
    const authConfig = (authConfigs.items || []).find(
      (ac: any) => ac.toolkit?.slug === toolkitSlug
    );
    if (authConfig) {
      authConfigId = authConfig.id;
      console.log(`[Composio] Found auth config ${authConfigId} for ${toolkitSlug}`);
    } else {
      throw new Error(`No auth config found for toolkit '${toolkitSlug}'. Please configure it in Composio dashboard.`);
    }
  }

  // Create a connected account which initiates the OAuth flow
  const response = await client.connectedAccounts.create({
    auth_config: { id: authConfigId },
    connection: {
      callback_url: options?.callbackUrl,
      user_id: userId,  // user_id goes INSIDE connection object per Composio API
    },
  } as any);

  // Extract the redirect URL from the response (API returns snake_case)
  const redirectUrl = (response as any).redirect_url || 
    (response as any).redirect_uri ||
    (response as any).redirectUrl || 
    (response as any).authUri || 
    (response.connectionData as any)?.redirectUrl || "";

  console.log(`[Composio] Connection initiated, redirect URL:`, redirectUrl);

  return {
    id: response.id,
    redirectUrl,
    isNew: true,
  };
}

/**
 * Wait for a connection to be established.
 * Polls until the user completes OAuth or timeout.
 *
 * @param connectedAccountId - The connected account ID from initiateConnection
 * @param timeoutMs - Timeout in milliseconds (default: 2 minutes)
 */
export async function waitForConnection(
  connectedAccountId: string,
  timeoutMs: number = 120000,
): Promise<{ connected: boolean; connectedAccountId?: string; error?: string }> {
  if (!isComposioConfigured()) {
    return { connected: false, error: "Composio not configured" };
  }

  const client = getComposioClient();
  const startTime = Date.now();
  const pollInterval = 2000; // 2 seconds

  while (Date.now() - startTime < timeoutMs) {
    try {
      const account = await client.connectedAccounts.retrieve(connectedAccountId);
      const status = (account as any).status;

      if (status === "ACTIVE") {
        return {
          connected: true,
          connectedAccountId: account.id,
        };
      }

      if (["FAILED", "EXPIRED"].includes(status)) {
        return {
          connected: false,
          error: `Connection ${status.toLowerCase()}`,
        };
      }

      // Wait before polling again
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    } catch (error: any) {
      console.error(`[Composio] Polling error:`, error);
      // Continue polling on error
    }
  }

  return {
    connected: false,
    error: "Connection polling timed out",
  };
}

/**
 * Disconnect a connected account
 */
export async function disconnectAccount(
  connectedAccountId: string,
): Promise<void> {
  if (!isComposioConfigured()) {
    return;
  }

  const client = getComposioClient();

  try {
    await client.connectedAccounts.delete(connectedAccountId);
    console.log(`[Composio] Disconnected account: ${connectedAccountId}`);
  } catch (error) {
    console.error(`[Composio] Failed to disconnect account:`, error);
    throw error;
  }
}

/**
 * List all connected accounts for a user
 */
export async function listUserConnections(userId: string): Promise<
  Array<{
    id: string;
    toolkitSlug: string;
    toolkitName: string;
    status: string;
    createdAt?: string;
  }>
> {
  if (!isComposioConfigured()) {
    return [];
  }

  const client = getComposioClient();

  try {
    const response = await client.connectedAccounts.list({
      user_ids: [userId],
    } as any);

    return (response.items || []).map((acc: any) => ({
      id: acc.id,
      toolkitSlug: acc.toolkit?.slug || "unknown",
      toolkitName: acc.toolkit?.name || acc.toolkit?.slug || "Unknown",
      status: acc.status || "unknown",
      createdAt: acc.created_at,
    }));
  } catch (error) {
    console.error(`[Composio] Failed to list connections for user ${userId}:`, error);
    return [];
  }
}