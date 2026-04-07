/**
 * Composio Tools Builder
 *
 * Builds AgentTools from Composio actions for workspace integrations.
 * Integrates status checking and error handling.
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
 * Configuration for building Composio tools for a workspace
 */
export interface ComposioToolConfig {
  workspaceId: string;
  userId: string;
  composioClient?: Composio;
  /** Database client for status checks */
  db?: unknown;
}

/**
 * Build Composio tools for a specific workspace.
 * Uses the new Composio SDK approach with tools.get() API.
 *
 * Loads tools for ALL available toolkits so AI knows what's possible.
 * Tools will return auth errors at execution time if not connected.
 */
export async function buildComposioTools(
  config: ComposioToolConfig,
): Promise<AgentTool[]> {
  const { workspaceId, userId, composioClient } = config;

  if (!composioClient) {
    console.log("[ComposioTools] No Composio client provided, skipping tools");
    return [];
  }

  // Create workspace-specific entity ID for isolation
  const entityId = `ws_${workspaceId}_user_${userId}`;

  // Load tools for ALL available toolkits (not just connected ones)
  // This makes the AI aware of all 1000+ integrations
  const allToolkits = [
    // Email & Communication
    "GMAIL",
    "OUTLOOK",
    "SLACK",
    "DISCORD",
    "TELEGRAM",
    "TEAMS",
    "ZOOM",
    // Development & Code
    "GITHUB",
    "GITLAB",
    "BITBUCKET",
    "CIRCLECI",
    "JENKINS",
    // Calendar & Scheduling
    "GOOGLECALENDAR",
    "OUTLOOKCALENDAR",
    "CALENDLY",
    // Project Management
    "JIRA",
    "LINEAR",
    "ASANA",
    "TRELLO",
    "MONDAY",
    "CLICKUP",
    "BASECAMP",
    // Documentation & Knowledge
    "NOTION",
    "CONFLUENCE",
    "CODA",
    "AIRTABLE",
    // CRM & Sales
    "HUBSPOT",
    "SALESFORCE",
    "ZENDESK",
    "PIPEDRIVE",
    "INTERCOM",
    // Storage & Files
    "GOOGLEDRIVE",
    "DROPBOX",
    "ONEDRIVE",
    "BOX",
    // Social Media
    "TWITTER",
    "LINKEDIN",
    "FACEBOOK",
    "INSTAGRAM",
    // Finance & Payments
    "STRIPE",
    "PAYPAL",
    "QUICKBOOKS",
    // Analytics & Monitoring
    "GOOGLEANALYTICS",
    "MIXPANEL",
    "AMPLITUDE",
    "DATADOG",
    // Marketing
    "MAILCHIMP",
    "SENDGRID",
    "TWILIO",
    // HR & Recruiting
    "GREENHOUSE",
    "LEVER",
    "BAMBOOHR",
    // Design & Creative
    "FIGMA",
    "CANVA",
    // Productivity
    "TODOIST",
    "EVERNOTE",
    "ZAPIER",
  ];

  console.log(
    `[ComposioTools] Loading tools for ${allToolkits.length} toolkits (AI will be aware of all capabilities)`,
  );

  try {
    // Use the new Composio SDK API to get tools for ALL toolkits
    // Set important: false to get ALL tools, not just "important" ones
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const composioTools = await (composioClient as any).tools.get(entityId, {
      toolkits: allToolkits,
      important: false, // Get ALL tools, not just important ones
    });

    console.log(
      `[ComposioTools] Retrieved ${composioTools.length} tools from Composio`,
    );

    // Get workspace integrations to check connection status
    const integrations = await getWorkspaceIntegrations(workspaceId);

    // Convert Composio tools to Pi Agent format
    const piTools: AgentTool[] = composioTools.map((tool: any) => {
      const toolName = tool.function?.name || tool.name;

      // Find which toolkit this tool belongs to
      const toolkitSlug = findToolkitForTool(
        toolName,
        allToolkits.map((t) => ({ toolkitSlug: t.toLowerCase() })),
      );
      const integration = integrations.find(
        (i) => i.toolkitSlug.toLowerCase() === toolkitSlug?.toLowerCase(),
      );

      return createComposioToolFromSDK(
        tool,
        entityId,
        integration?.connectedAccountId || "",
        toolkitSlug || "unknown",
        composioClient,
        integration?.connectionStatus === "ACTIVE",
      );
    });

    console.log(
      `[ComposioTools] Built ${piTools.length} tools for workspace ${workspaceId}`,
    );

    return piTools;
  } catch (error) {
    console.error(`[ComposioTools] Error building tools:`, error);
    return [];
  }
}

/**
 * Convert a Composio SDK tool to Pi AgentTool format
 */
function createComposioToolFromSDK(
  tool: any,
  entityId: string,
  connectedAccountId: string,
  toolkitSlug: string,
  composioClient: Composio,
  isConnected: boolean = false,
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
 * Find which toolkit a tool belongs to based on tool name prefix
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
