import { Composio } from '@composio/core';
import { Type } from '@sinclair/typebox';
import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';
import { eq } from 'drizzle-orm';
import { getDb } from '../../db/index.js';
import * as schema from '../../db/schema.js';

/**
 * Configuration for building Composio tools for a workspace
 */
export interface ComposioToolConfig {
  workspaceId: string;
  userId: string;
  composioClient: Composio;
}

/**
 * Composio action representation
 */
interface ComposioAction {
  name: string;
  displayName?: string;
  description?: string;
  parameters?: {
    type: string;
    properties?: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
    }>;
    required?: string[];
  };
  connectedAccountId?: string;
}

/**
 * Build Composio tools for a specific workspace.
 * Maintains workspace isolation via entity IDs: ws_{workspaceId}_user_{userId}
 */
export async function buildComposioTools(
  config: ComposioToolConfig,
): Promise<AgentTool[]> {
  const { workspaceId, userId, composioClient } = config;

  // Create workspace-specific entity ID for isolation
  const entityId = `ws_${workspaceId}_user_${userId}`;

  // Get connected integrations for this workspace
  const integrations = await getWorkspaceIntegrations(workspaceId);

  if (integrations.length === 0) {
    console.log(`[ComposioTools] No integrations for workspace ${workspaceId}`);
    return [];
  }

  const tools: AgentTool[] = [];

  for (const integration of integrations) {
    try {
      // Get available actions for this integration
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const actionsResponse = await (composioClient as any).actions.list({
        apps: [integration.toolkitSlug],
      });

      // Handle different response formats
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const actions = (actionsResponse.items || actionsResponse || []) as any[];

      for (const action of actions) {
        const tool = createComposioTool(
          action,
          entityId,
          integration.connectedAccountId,
          composioClient,
        );
        tools.push(tool);
      }

      console.log(
        `[ComposioTools] Built ${actions.length} tools for ${integration.toolkitSlug} in workspace ${workspaceId}`,
      );
    } catch (error) {
      console.error(
        `[ComposioTools] Error fetching actions for ${integration.toolkitSlug}:`,
        error,
      );
      // Continue to next integration even if one fails
    }
  }

  return tools;
}

/**
 * Convert a Composio action to Pi AgentTool
 */
function createComposioTool(
  action: ComposioAction,
  entityId: string,
  connectedAccountId: string,
  composioClient: Composio,
): AgentTool {
  // Convert Composio schema to TypeBox
  const parameters = convertComposioSchemaToTypeBox(action.parameters);

  return {
    name: action.name,
    label: action.displayName || action.name,
    description: action.description || `Execute ${action.name}`,
    parameters,
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
                type: 'text',
                text: `Tool execution aborted before starting`,
              },
            ],
            details: {
              action: action.name,
              entityId,
              aborted: true,
            },
          };
        }

        // Execute Composio action with workspace entity ID
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result = await (composioClient as any).execute({
          action: action.name,
          params,
          entityId,
          connectedAccountId,
        });

        const executionTime = Date.now() - startTime;

        const toolResult: AgentToolResult<unknown> = {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
          details: {
            action: action.name,
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
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        console.error(
          `[ComposioTools] Error executing ${action.name}:`,
          errorMessage,
        );

        // Return error as tool result (LLM can see and handle)
        return {
          content: [
            {
              type: 'text',
              text: `Error executing ${action.name}: ${errorMessage}\n\nThe action failed. Please check the parameters and try again.`,
            },
          ],
          details: {
            action: action.name,
            entityId,
            connectedAccountId,
            executionTime,
            success: false,
            error: errorMessage,
            errorType: error instanceof Error ? error.constructor.name : 'Unknown',
          },
        };
      }
    },
  };
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
      case 'string':
        if (propSchema.enum && propSchema.enum.length > 0) {
          // Enum field
          typeBoxProps[key] = Type.String({
            description: propSchema.description,
          });
        } else {
          typeBoxProps[key] = Type.String({
            description: propSchema.description,
          });
        }
        break;
      case 'number':
      case 'integer':
        typeBoxProps[key] = Type.Number({
          description: propSchema.description,
        });
        break;
      case 'boolean':
        typeBoxProps[key] = Type.Boolean({
          description: propSchema.description,
        });
        break;
      case 'array':
        typeBoxProps[key] = Type.Array(Type.Any(), {
          description: propSchema.description,
        });
        break;
      case 'object':
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
    composioClientInstance = new Composio();
  }
  return composioClientInstance;
}
