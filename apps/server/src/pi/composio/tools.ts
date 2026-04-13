/**
 * Composio Autonomous Tool Discovery & Execution
 *
 * This module enables the AI agent to autonomously:
 * 1. Search for relevant tools based on user intent
 * 2. Check if the user has connected the required account
 * 3. Offer OAuth URL if connection is missing
 * 4. Execute the tool once connected
 *
 * Flow:
 * User: "Star the repo composiohq/composio on GitHub"
 *   ↓
 * AI calls: search_composio_tools("star a github repo")
 *   ↓
 * Returns: GITHUB_STAR_REPOSITORY
 *   ↓
 * AI calls: composio_GITHUB_STAR_REPOSITORY with args
 *   ↓
 * If no connection: Returns auth URL for user to connect
 *   ↓
 * User connects → AI retries execution
 */

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";
import { getComposioClient, isComposioConfigured } from "./client.js";
import { checkConnectedAccount, initiateConnection } from "./connected-accounts.js";

/**
 * Cache for tool searches (TTL: 5 minutes)
 */
const toolCache = new Map<string, { tools: any[]; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Cache for user connections (TTL: 2 minutes)
 */
const connectionCache = new Map<string, { status: { connected: boolean; connectedAccountId?: string }; expires: number }>();
const CONNECTION_CACHE_TTL = 2 * 60 * 1000;

/**
 * Search for Composio tools using natural language.
 *
 * This is the primary entry point for autonomous tool discovery.
 * The AI calls this when it needs to find tools for a task.
 */
export async function searchComposioTools(
  query: string,
  options: { limit?: number } = {},
): Promise<Array<{
  slug: string;
  name: string;
  description: string;
  toolkitSlug: string;
  toolkitName: string;
  noAuth: boolean;
  inputSchema: any;
}>> {
  if (!isComposioConfigured()) {
    console.log("[Composio] Not configured, returning empty search results");
    return [];
  }

  const client = getComposioClient();
  const { limit = 10 } = options;

  // Check cache
  const cacheKey = `search:${query}:${limit}`;
  const cached = toolCache.get(cacheKey);
  if (cached && Date.now() < cached.expires) {
    console.log(`[Composio] Cache hit for search: ${query}`);
    return cached.tools;
  }

  try {
    console.log(`[Composio] Searching tools for: "${query}"`);

    // Use the search parameter for semantic search
    const response = await client.tools.list({
      search: query,
      limit,
    });

    const tools = (response.items || []).map((tool: any) => ({
      slug: tool.slug,
      name: tool.name,
      description: tool.description,
      toolkitSlug: tool.toolkit?.slug || "unknown",
      toolkitName: tool.toolkit?.name || "Unknown",
      noAuth: tool.no_auth || false,
      inputSchema: tool.input_parameters || {},
    }));

    console.log("[Composio] Search results:", tools.slice(0, 5).map((t: any) => ({ slug: t.slug, name: t.name })));

    // Cache the results
    toolCache.set(cacheKey, { tools, expires: Date.now() + CACHE_TTL });

    console.log(`[Composio] Found ${tools.length} tools for: "${query}"`);
    return tools;
  } catch (error) {
    console.error(`[Composio] Failed to search tools:`, error);
    return [];
  }
}

/**
 * Get cached connection status for a user + toolkit.
 */
async function getCachedConnectionStatus(
  userId: string,
  toolkitSlug: string,
): Promise<{ connected: boolean; connectedAccountId?: string }> {
  const cacheKey = `${userId}:${toolkitSlug}`;
  const cached = connectionCache.get(cacheKey);

  if (cached && Date.now() < cached.expires) {
    return cached.status;
  }

  // Fetch fresh status
  const status = await checkConnectedAccount(userId, toolkitSlug);
  connectionCache.set(cacheKey, {
    status: { connected: status.connected, connectedAccountId: status.connectedAccountId },
    expires: Date.now() + CONNECTION_CACHE_TTL,
  });

  return { connected: status.connected, connectedAccountId: status.connectedAccountId };
}

/**
 * Invalidate connection cache for a workspace + toolkit.
 * Call this when a connection is established or removed.
 * 
 * @param workspaceId - The workspace ID, or "all" to clear entire cache
 * @param toolkitSlug - Optional specific toolkit to invalidate
 */
export function invalidateConnectionCache(workspaceId: string, toolkitSlug?: string): void {
  if (workspaceId === "all") {
    // Clear entire cache
    connectionCache.clear();
    console.log(`[Composio] All connection cache cleared`);
    return;
  }
  
  if (toolkitSlug) {
    // Invalidate specific toolkit
    const cacheKey = `${workspaceId}:${toolkitSlug}`;
    connectionCache.delete(cacheKey);
    console.log(`[Composio] Cache invalidated for ${toolkitSlug}`);
  } else {
    // Invalidate all toolkits for this workspace
    for (const key of connectionCache.keys()) {
      if (key.startsWith(`${workspaceId}:`)) {
        connectionCache.delete(key);
      }
    }
    console.log(`[Composio] Cache invalidated for workspace ${workspaceId}`);
  }
}

/**
 * Execute a Composio tool with intelligent auth handling.
 *
 * If the user hasn't connected their account, returns an auth URL
 * instead of failing.
 */
export async function executeComposioTool(
  toolSlug: string,
  args: Record<string, any>,
  userId: string,
): Promise<{
  success: boolean;
  data?: any;
  error?: string;
  authRequired?: {
    toolkitSlug: string;
    toolkitName: string;
    authUrl: string;
    connectedAccountId: string;
    message: string;
  };
}> {
  if (!isComposioConfigured()) {
    return {
      success: false,
      error: "Composio not configured. Set COMPOSIO_API_KEY environment variable.",
    };
  }

  const client = getComposioClient();

  try {
    console.log(`[Composio] Executing tool: ${toolSlug}`, args);

    // Get tool info to determine toolkit
    const toolInfo = await client.tools.retrieve(toolSlug);
    const toolkitSlug = toolInfo.toolkit?.slug || toolSlug.split("_")[0];

    // Check if user has connected this toolkit (unless tool requires no auth)
    if (!toolInfo.no_auth) {
      const connectionStatus = await getCachedConnectionStatus(userId, toolkitSlug);

      if (!connectionStatus.connected) {
        // User needs to connect - initiate OAuth and return auth URL
        console.log(`[Composio] User ${userId} not connected to ${toolkitSlug}, initiating OAuth`);

        try {
          const connection = await initiateConnection(userId, toolkitSlug, {
            callbackUrl: `${process.env.BACKEND_URL || "http://localhost:3001"}/api/composio/callback`,
          });

          return {
            success: false,
            authRequired: {
              toolkitSlug,
              toolkitName: toolInfo.toolkit?.name || toolkitSlug,
              authUrl: connection.redirectUrl,
              connectedAccountId: connection.id,
              message: `You need to connect your ${toolInfo.toolkit?.name || toolkitSlug} account. Please visit: ${connection.redirectUrl}`,
            },
          };
        } catch (authError: any) {
          console.error(`[Composio] Failed to initiate OAuth for ${toolkitSlug}:`, authError);
          return {
            success: false,
            error: `Failed to initiate connection for ${toolkitSlug}: ${authError.message}`,
          };
        }
      }

      // User is connected - execute with their connected account
      const result = await client.tools.execute(toolSlug, {
        arguments: args,
        connected_account_id: connectionStatus.connectedAccountId,
        user_id: userId,  // Required by Composio to identify the connected account
      });

      console.log(`[Composio] Tool ${toolSlug} executed successfully`);

      return {
        success: result.successful,
        data: result.data,
        error: result.error || undefined,
      };
    }

    // Tool requires no auth - execute directly
    const result = await client.tools.execute(toolSlug, {
      arguments: args,
    });

    return {
      success: result.successful,
      data: result.data,
      error: result.error || undefined,
    };
  } catch (error: any) {
    console.error(`[Composio] Tool ${toolSlug} failed:`, error);

    // Check if error is due to missing connection
    const errorMessage = error.message || "";
    const isAuthError = error.code === "NO_CONNECTED_ACCOUNT" ||
      errorMessage.includes("not connected") ||
      errorMessage.includes("No connected account");

    if (isAuthError) {
      const toolkitSlug = toolSlug.split("_")[0];

      try {
        const connection = await initiateConnection(userId, toolkitSlug, {
          callbackUrl: `${process.env.BACKEND_URL || "http://localhost:3001"}/api/composio/callback`,
        });

        return {
          success: false,
          authRequired: {
            toolkitSlug,
            toolkitName: toolkitSlug,
            authUrl: connection.redirectUrl,
            connectedAccountId: connection.id,
            message: `You need to connect your ${toolkitSlug} account. Please visit: ${connection.redirectUrl}`,
          },
        };
      } catch (authError: any) {
        return {
          success: false,
          error: `Failed to initiate connection: ${authError.message}`,
        };
      }
    }

    return {
      success: false,
      error: errorMessage || "Tool execution failed",
    };
  }
}

/**
 * Create Pi Agent tools for Composio tool search.
 *
 * This returns tools that the AI can call to discover and execute
 * Composio tools autonomously.
 *
 * @param workspaceId - The workspace ID (used as Composio user ID for connection scoping)
 */
export function getComposioMetaTools(workspaceId: string): AgentTool[] {
  return [
    {
      name: "composio_search_tools",
      description: `Search for tools in Composio's registry using natural language.

Use this when you need to find tools to accomplish a task for the user.
For example, if the user asks to "star a GitHub repo", search for "star github repository".

Returns a list of available tools with their descriptions and input schemas.
Also shows which toolkits are connected or need authorization.
After finding a tool, call composio_execute_tool to perform the action.`,
      label: "Search Composio Tools",
      parameters: Type.Object({
        query: Type.String({
          description: "Natural language description of what you want to do (e.g., 'send a slack message', 'star a github repo')",
        }),
        limit: Type.Optional(Type.Number({
          description: "Maximum number of tools to return (default: 10)",
        })),
      }),
      execute: async (_toolCallId: string, args: { query: string; limit?: number }) => {
        const tools = await searchComposioTools(args.query, { limit: args.limit });
        
        if (tools.length === 0) {
          return {
            content: [{ type: "text", text: "No tools found for that query." }],
            details: { success: true, tools: [] },
          };
        }

        // Get unique toolkits from results
        const toolkits = [...new Set(tools.map(t => t.toolkitSlug))];
        
        // Check connection status for each toolkit
        const connectionStatuses = new Map<string, boolean>();
        await Promise.all(
          toolkits.map(async (toolkitSlug) => {
            const status = await getCachedConnectionStatus(workspaceId, toolkitSlug);
            connectionStatuses.set(toolkitSlug, status.connected);
          })
        );

        // Format tool list with connection status
        const toolList = tools.map(t => {
          const connected = connectionStatuses.get(t.toolkitSlug);
          const statusIcon = t.noAuth ? "🔓" : (connected ? "✅" : "⚠️");
          return `- **${t.slug}** ${statusIcon}: ${t.name} - ${t.description.slice(0, 80)}...`;
        }).join("\n");
        
        // Build connection status summary
        const connectedToolkits: string[] = [];
        const notConnectedToolkits: string[] = [];
        for (const [slug, connected] of connectionStatuses) {
          if (connected) {
            connectedToolkits.push(slug);
          } else {
            notConnectedToolkits.push(slug);
          }
        }

        let statusSummary = "";
        if (notConnectedToolkits.length > 0) {
          statusSummary = `\n\n⚠️ **Authorization needed for:** ${notConnectedToolkits.join(", ")}`;
          statusSummary += `\nWhen you execute a tool, you'll receive an authorization link to connect your account.`;
        }
        if (connectedToolkits.length > 0) {
          statusSummary += `\n\n✅ **Already connected:** ${connectedToolkits.join(", ")}`;
        }

        return {
          content: [{ 
            type: "text", 
            text: `Found ${tools.length} tools:\n\n${toolList}${statusSummary}\n\nUse composio_execute_tool with the exact slug to execute.` 
          }],
          details: {
            success: true,
            tools,
            connections: Object.fromEntries(connectionStatuses),
          },
        };
      },
    },
    {
      name: "composio_execute_tool",
      description: `Execute a Composio tool with the provided arguments.

IMPORTANT: If the user hasn't connected their account for this tool,
this will return an authUrl that the user must visit to authenticate.
Tell the user about this URL and wait for them to connect before trying again.

After the user connects, you can retry this same tool call.`,
      label: "Execute Composio Tool",
      parameters: Type.Object({
        toolSlug: Type.String({
          description: "The slug of the tool to execute (e.g., 'GITHUB_STAR_A_REPOSITORY')",
        }),
        arguments: Type.Record(Type.String(), Type.Any(), {
          description: "The arguments to pass to the tool",
        }),
      }),
      execute: async (_toolCallId: string, args: { toolSlug: string; arguments: Record<string, any> }) => {
        const result = await executeComposioTool(args.toolSlug, args.arguments || {}, workspaceId);

        if (result.authRequired) {
          // Return clear auth instructions with the URL prominently displayed
          return {
            content: [{ 
              type: "text", 
              text: `⚠️ **ACCOUNT CONNECTION REQUIRED**

To use ${result.authRequired.toolkitName}, you need to connect your account.

**Click here to connect:** ${result.authRequired.authUrl}

After connecting, let me know and I'll retry the operation.`
            }],
            details: {
              success: false,
              authRequired: result.authRequired,
            },
          };
        }

        return {
          content: [{
            type: "text",
            text: result.success
              ? JSON.stringify(result.data, null, 2)
              : `Error: ${result.error}`,
          }],
          details: result,
        };
      },
    },
  ] as AgentTool[];
}

/**
 * Get all available toolkits.
 */
export async function listAvailableToolkits(): Promise<
  Array<{ slug: string; name: string; description: string }>
> {
  if (!isComposioConfigured()) {
    return [];
  }

  const client = getComposioClient();

  try {
    const response = await client.toolkits.list();

    return (response.items || []).map((t: any) => ({
      slug: t.slug,
      name: t.name,
      description: t.description || "",
    }));
  } catch (error) {
    console.error("[Composio] Failed to list toolkits:", error);
    return [];
  }
}