/**
 * Composio Meta-Tools Implementation
 *
 * Implements Composio's meta-tools pattern for AI awareness of 1000+ integrations.
 * Instead of loading all tools upfront, provides meta-tools that:
 * 1. Search for relevant tools based on user intent
 * 2. Manage authentication (OAuth, API keys)
 * 3. Execute discovered tools
 *
 * This keeps token usage minimal while giving AI access to all integrations.
 */

import { Composio } from "@composio/core";
import { Type } from "@sinclair/typebox";
import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import * as schema from "../../db/schema.js";
import { getToolkitMapping } from "../../services/toolkit-keywords.js";
import { classifyComposioError } from "./composio-errors.js";

/**
 * Configuration for building Composio meta-tools for a workspace
 */
export interface ComposioToolConfig {
  workspaceId: string;
  userId: string;
  composioClient?: Composio;
  /** Database client for status checks */
  db?: unknown;
}

/**
 * Build Composio meta-tools for a workspace.
 *
 * Instead of loading 1000+ tools upfront, provides 3 meta-tools:
 * 1. composio_search_tools - Discover relevant tools based on user intent
 * 2. composio_manage_connections - Handle OAuth authentication
 * 3. composio_execute_tool - Execute discovered tools
 *
 * This keeps token usage minimal (~3 tools) while giving AI access to all integrations.
 */
export async function buildComposioTools(
  config: ComposioToolConfig,
): Promise<AgentTool[]> {
  const { workspaceId, userId, composioClient } = config;

  if (!composioClient) {
    console.log(
      "[ComposioMetaTools] No Composio client provided, skipping meta-tools",
    );
    return [];
  }

  // Create workspace-specific entity ID for isolation
  const entityId = `ws_${workspaceId}_user_${userId}`;

  console.log(
    `[ComposioMetaTools] Building meta-tools for workspace ${workspaceId}`,
  );

  const metaTools: AgentTool[] = [
    createSearchToolsMetaTool(composioClient, entityId, workspaceId),
    createManageConnectionsMetaTool(composioClient, entityId, workspaceId),
    createExecuteToolMetaTool(composioClient, entityId, workspaceId),
  ];

  console.log(
    `[ComposioMetaTools] Built ${metaTools.length} meta-tools for workspace ${workspaceId}`,
  );

  return metaTools;
}

/**
 * META-TOOL 1: Search for relevant tools based on user intent
 *
 * This is the discovery mechanism. The AI uses natural language queries
 * to find relevant tools across 1000+ integrations.
 */
function createSearchToolsMetaTool(
  composioClient: Composio,
  entityId: string,
  workspaceId: string,
): AgentTool {
  return {
    name: "composio_search_tools",
    label: "Search for integration tools",
    description: `Search for relevant tools across 1000+ integrations (GitHub, Gmail, Slack, Notion, Jira, Linear, Google Calendar, etc.).

Use this when the user wants to:
- Interact with external services (send email, create issue, schedule meeting, etc.)
- Access data from connected apps
- Automate workflows across multiple services

Provide a natural language query describing what you want to do.
Returns 5-10 most relevant tools with their schemas and connection status.`,
    parameters: Type.Object({
      queries: Type.Array(Type.String(), {
        description:
          "List of search queries in natural language (e.g., 'create github issue', 'send email via gmail', 'schedule google calendar event')",
      }),
    }),
    execute: async (
      _toolCallId: string,
      params: { queries: string[] },
    ): Promise<AgentToolResult<unknown>> => {
      try {
        console.log(
          `[ComposioMetaTools:Search] Searching for tools:`,
          params.queries,
        );

        // Use Composio SDK to search for tools
        // This is a simplified version - in production, you'd use Composio's actual search API
        const results: any[] = [];

        for (const query of params.queries) {
          // Parse query to extract toolkit and action
          const toolkit = extractToolkitFromQuery(query);

          if (toolkit) {
            try {
              // Get tools for this toolkit
              const tools = await (composioClient as any).tools.get(entityId, {
                toolkits: [toolkit.toUpperCase()],
                important: false,
              });

              // Get connection status
              const integrations = await getWorkspaceIntegrations(workspaceId);
              const integration = integrations.find(
                (i) => i.toolkitSlug.toLowerCase() === toolkit.toLowerCase(),
              );

              const isConnected = integration?.connectionStatus === "ACTIVE";

              results.push({
                query,
                toolkit: toolkit.toUpperCase(),
                tools: tools.slice(0, 5).map((t: any) => ({
                  name: t.function?.name || t.name,
                  description: t.function?.description || t.description,
                  parameters: t.function?.parameters || t.parameters,
                })),
                connected: isConnected,
                connectionRequired: !isConnected,
              });
            } catch (error) {
              console.error(
                `[ComposioMetaTools:Search] Error searching ${toolkit}:`,
                error,
              );
            }
          }
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(results, null, 2),
            },
          ],
          details: {
            action: "composio_search_tools",
            entityId,
            queriesCount: params.queries.length,
            resultsCount: results.length,
          },
        };
      } catch (error) {
        console.error(`[ComposioMetaTools:Search] Error:`, error);
        return {
          content: [
            {
              type: "text",
              text: `Error searching for tools: ${(error as Error).message}`,
            },
          ],
          details: {
            action: "composio_search_tools",
            entityId,
            error: (error as Error).message,
          },
        };
      }
    },
  };
}

/**
 * META-TOOL 2: Manage connections (OAuth, API keys)
 *
 * Handles authentication for integrations. When a tool requires auth,
 * the AI uses this to generate OAuth links or check connection status.
 */
function createManageConnectionsMetaTool(
  composioClient: Composio,
  entityId: string,
  workspaceId: string,
): AgentTool {
  return {
    name: "composio_manage_connections",
    label: "Manage integration connections",
    description: `Manage authentication for integrations. Use this to:
- Check if an integration is connected
- Generate OAuth connection links for users
- Get connection status for multiple toolkits

When a tool execution fails due to missing authentication, use this to provide the user with a connection link.`,
    parameters: Type.Object({
      toolkits: Type.Array(Type.String(), {
        description:
          "List of toolkit names to check/connect (e.g., ['github', 'gmail', 'slack'])",
      }),
      action: Type.Optional(
        Type.Union(
          [Type.Literal("check_status"), Type.Literal("get_connection_url")],
          {
            description:
              "Action to perform: 'check_status' or 'get_connection_url'",
            default: "check_status",
          },
        ),
      ),
    }),
    execute: async (
      _toolCallId: string,
      params: {
        toolkits: string[];
        action?: "check_status" | "get_connection_url";
      },
    ): Promise<AgentToolResult<unknown>> => {
      try {
        const action = params.action || "check_status";
        console.log(
          `[ComposioMetaTools:Connections] ${action} for:`,
          params.toolkits,
        );

        const integrations = await getWorkspaceIntegrations(workspaceId);
        const results: any[] = [];

        for (const toolkit of params.toolkits) {
          const integration = integrations.find(
            (i) => i.toolkitSlug.toLowerCase() === toolkit.toLowerCase(),
          );

          const isConnected = integration?.connectionStatus === "ACTIVE";

          if (action === "get_connection_url" && !isConnected) {
            // Generate OAuth URL
            // In production, use Composio's actual OAuth URL generation
            const oauthUrl = `${process.env.APP_URL || "http://localhost:3000"}/integrations/connect/${toolkit.toLowerCase()}?workspace=${workspaceId}`;

            results.push({
              toolkit: toolkit.toUpperCase(),
              connected: false,
              connectionUrl: oauthUrl,
              message: `To use ${toolkit.toUpperCase()}, please connect your account at: ${oauthUrl}`,
            });
          } else {
            results.push({
              toolkit: toolkit.toUpperCase(),
              connected: isConnected,
              connectedAccountId: integration?.connectedAccountId,
              status: integration?.connectionStatus || "NOT_CONNECTED",
            });
          }
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(results, null, 2),
            },
          ],
          details: {
            action: "composio_manage_connections",
            entityId,
            toolkitsCount: params.toolkits.length,
          },
        };
      } catch (error) {
        console.error(`[ComposioMetaTools:Connections] Error:`, error);
        return {
          content: [
            {
              type: "text",
              text: `Error managing connections: ${(error as Error).message}`,
            },
          ],
          details: {
            action: "composio_manage_connections",
            entityId,
            error: (error as Error).message,
          },
        };
      }
    },
  };
}

/**
 * META-TOOL 3: Execute discovered tools
 *
 * Executes tools that were discovered via composio_search_tools.
 * Handles authentication errors and provides helpful feedback.
 */
function createExecuteToolMetaTool(
  composioClient: Composio,
  entityId: string,
  workspaceId: string,
): AgentTool {
  return {
    name: "composio_execute_tool",
    label: "Execute integration tool",
    description: `Execute a tool discovered via composio_search_tools.

Use this after you've searched for and found the right tool.
Provide the exact tool name and parameters from the search results.

If execution fails due to missing authentication, use composio_manage_connections to get a connection link.`,
    parameters: Type.Object({
      tool: Type.String({
        description:
          "Exact tool name from search results (e.g., 'GITHUB_CREATE_ISSUE', 'GMAIL_SEND_EMAIL')",
      }),
      parameters: Type.Any({
        description: "Tool parameters as specified in the tool schema",
      }),
    }),
    execute: async (
      _toolCallId: string,
      params: { tool: string; parameters: any },
      signal?: AbortSignal,
    ): Promise<AgentToolResult<unknown>> => {
      const startTime = Date.now();

      try {
        if (signal?.aborted) {
          return {
            content: [
              {
                type: "text",
                text: `Tool execution aborted before starting`,
              },
            ],
            details: {
              action: "composio_execute_tool",
              tool: params.tool,
              entityId,
              aborted: true,
            },
          };
        }

        console.log(
          `[ComposioMetaTools:Execute] Executing ${params.tool} with params:`,
          params.parameters,
        );

        // Execute via Composio SDK
        const result = await (composioClient as any).tools.execute(
          params.tool,
          params.parameters,
          {
            entityId,
          },
        );

        const executionTime = Date.now() - startTime;

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
          details: {
            action: "composio_execute_tool",
            tool: params.tool,
            entityId,
            executionTime,
            success: true,
          },
        };
      } catch (error) {
        const executionTime = Date.now() - startTime;
        console.error(
          `[ComposioMetaTools:Execute] Error executing ${params.tool}:`,
          error,
        );

        // Extract toolkit from tool name (e.g., GITHUB_CREATE_ISSUE -> github)
        const toolkit = params.tool.split("_")[0].toLowerCase();
        const classified = classifyComposioError(error, toolkit);

        // If it's an auth error, provide helpful guidance
        if (classified.type === "authentication") {
          return {
            content: [
              {
                type: "text",
                text: `${classified.message}\n\nTo fix this, use composio_manage_connections with toolkit: "${toolkit}" and action: "get_connection_url" to get a connection link for the user.`,
              },
            ],
            details: {
              action: "composio_execute_tool",
              tool: params.tool,
              entityId,
              executionTime,
              success: false,
              error: classified.message,
              errorType: classified.type,
              toolkit,
              needsConnection: true,
            },
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `${classified.message}\n\nTool: ${params.tool}\nToolkit: ${toolkit}`,
            },
          ],
          details: {
            action: "composio_execute_tool",
            tool: params.tool,
            entityId,
            executionTime,
            success: false,
            error: classified.message,
            errorType: classified.type,
            toolkit,
          },
        };
      }
    },
  };
}

/**
 * Extract toolkit name from natural language query
 */
function extractToolkitFromQuery(query: string): string | null {
  const lowerQuery = query.toLowerCase();

  // Common toolkit mappings
  const toolkitMappings: Record<string, string> = {
    github: "github",
    gitlab: "gitlab",
    bitbucket: "bitbucket",
    gmail: "gmail",
    email: "gmail",
    mail: "gmail",
    outlook: "outlook",
    slack: "slack",
    discord: "discord",
    telegram: "telegram",
    teams: "teams",
    zoom: "zoom",
    calendar: "googlecalendar",
    "google calendar": "googlecalendar",
    "outlook calendar": "outlookcalendar",
    jira: "jira",
    linear: "linear",
    asana: "asana",
    trello: "trello",
    monday: "monday",
    clickup: "clickup",
    notion: "notion",
    confluence: "confluence",
    coda: "coda",
    airtable: "airtable",
    hubspot: "hubspot",
    salesforce: "salesforce",
    zendesk: "zendesk",
    pipedrive: "pipedrive",
    "google drive": "googledrive",
    drive: "googledrive",
    dropbox: "dropbox",
    onedrive: "onedrive",
    twitter: "twitter",
    linkedin: "linkedin",
    stripe: "stripe",
    figma: "figma",
  };

  for (const [keyword, toolkit] of Object.entries(toolkitMappings)) {
    if (lowerQuery.includes(keyword)) {
      return toolkit;
    }
  }

  return null;
}

/**
 * Convert a Composio SDK tool to Pi AgentTool format (DEPRECATED - kept for reference)
 *
 * This function is no longer used with the meta-tools pattern,
 * but kept for backward compatibility if needed.
 */
function createComposioToolFromSDK(
  tool: any,
  entityId: string,
  connectedAccountId: string,
  toolkitSlug: string,
  composioClient: Composio,
): AgentTool {
  const toolName = tool.function?.name || tool.name;
  const parameters = tool.function?.parameters || tool.parameters || {};

  // Convert Composio schema to TypeBox
  const typeBoxParams = convertComposioSchemaToTypeBox(parameters);

  const toolkitMapping = getToolkitMapping(toolkitSlug);
  const toolkitName = toolkitMapping?.toolkitName || toolkitSlug;

  return {
    name: toolName,
    label: tool.function?.description || tool.description || toolName,
    description:
      tool.function?.description || tool.description || `Execute ${toolName}`,
    parameters: typeBoxParams,
    execute: async (
      _toolCallId: string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      params: any,
      signal?: AbortSignal,
      onUpdate?: (partial: AgentToolResult<unknown>) => void,
    ): Promise<AgentToolResult<unknown>> => {
      const startTime = Date.now();

      try {
        // Check for abort before execution
        if (signal?.aborted) {
          return {
            content: [
              {
                type: "text",
                text: `Tool execution aborted before starting`,
              },
            ],
            details: {
              action: toolName,
              entityId,
              aborted: true,
            },
          };
        }

        // Execute via Composio SDK
        console.log(
          `[ComposioTools] Executing ${toolName} with params:`,
          params,
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (composioClient as any).tools.execute(
          toolName,
          params,
          {
            entityId,
            connectedAccountId,
          },
        );

        const executionTime = Date.now() - startTime;

        const toolResult: AgentToolResult<unknown> = {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
          details: {
            action: toolName,
            entityId,
            connectedAccountId,
            executionTime,
            success: true,
          },
        };

        // Report progress if callback provided
        onUpdate?.(toolResult);

        return toolResult;
      } catch (error) {
        const executionTime = Date.now() - startTime;

        console.error(`[ComposioTools] Error executing ${toolName}:`, error);

        // Classify the error
        const classified = classifyComposioError(error, toolkitSlug);

        // Return error as tool result (LLM can see and handle)
        return {
          content: [
            {
              type: "text",
              text: `${classified.message}\n\nAction: ${toolName}\nToolkit: ${toolkitName}`,
            },
          ],
          details: {
            action: toolName,
            entityId,
            connectedAccountId,
            executionTime,
            success: false,
            error: classified.message,
            errorType: classified.type,
            toolkitSlug,
            toolkitName,
            isError: true,
          },
        };
      }
    },
  };
}

/**
 * Find which toolkit a tool belongs to based on tool name prefix (DEPRECATED)
 */
function findToolkitForTool(
  toolName: string,
  integrations: Array<{ toolkitSlug: string }>,
): string | undefined {
  // Tool names typically follow pattern: TOOLKIT_ACTION_NAME
  // e.g., GITHUB_CREATE_ISSUE, GMAIL_SEND_EMAIL
  const prefix = toolName.split("_")[0];
  return integrations.find(
    (i) => i.toolkitSlug.toUpperCase() === prefix.toUpperCase(),
  )?.toolkitSlug;
}

/**
 * Convert Composio JSON Schema to TypeBox schema
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertComposioSchemaToTypeBox(composioSchema: any): any {
  if (!composioSchema || !composioSchema.properties) {
    return Type.Object({});
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typeBoxProps: Record<string, any> = {};

  for (const [key, prop] of Object.entries(composioSchema.properties)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const propSchema = prop as any;

    switch (propSchema.type) {
      case "string":
        typeBoxProps[key] = Type.String({
          description: propSchema.description,
        });
        break;
      case "number":
      case "integer":
        typeBoxProps[key] = Type.Number({
          description: propSchema.description,
        });
        break;
      case "boolean":
        typeBoxProps[key] = Type.Boolean({
          description: propSchema.description,
        });
        break;
      case "array":
        typeBoxProps[key] = Type.Array(Type.Any(), {
          description: propSchema.description,
        });
        break;
      case "object":
        typeBoxProps[key] = Type.Object(
          {},
          {
            description: propSchema.description,
          },
        );
        break;
      default:
        typeBoxProps[key] = Type.String({
          description: propSchema.description,
        });
    }
  }

  return Type.Object(typeBoxProps);
}

/**
 * Get workspace integrations from database
 */
async function getWorkspaceIntegrations(workspaceId: string) {
  const db = getDb();
  return await db
    .select()
    .from(schema.workspaceIntegrations)
    .where(eq(schema.workspaceIntegrations.workspaceId, workspaceId));
}

/**
 * Create a singleton Composio client
 */
let composioClientInstance: Composio | null = null;

export function getComposioClient(): Composio {
  if (!composioClientInstance) {
    const apiKey = process.env.COMPOSIO_API_KEY;
    if (!apiKey) {
      console.warn(
        "[ComposioClient] COMPOSIO_API_KEY not found in environment",
      );
    } else {
      console.log(
        "[ComposioClient] Initializing with API key:",
        apiKey.substring(0, 10) + "...",
      );
    }
    composioClientInstance = new Composio({ apiKey });
  }
  return composioClientInstance;
}

/**
 * Reset the Composio client singleton (for testing)
 */
export function resetComposioClient(): void {
  composioClientInstance = null;
}
