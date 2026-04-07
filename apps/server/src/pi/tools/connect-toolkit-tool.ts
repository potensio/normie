/**
 * Connect Toolkit Tool
 *
 * A meta-tool that allows the AI to initiate OAuth connections for toolkits.
 * This tool is ALWAYS available in sessions, enabling proactive connection suggestions.
 */

import { Type } from '@sinclair/typebox';
import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';
import { eq, and } from 'drizzle-orm';
import { getComposioClient } from './composio-tools.js';
import { getToolkitMapping } from '../../services/toolkit-keywords.js';
import type { DbClient } from '../../services/integration.service.js';
import type { ConnectionToolResult } from '../../types/toolkit.js';
import * as schema from '../../db/schema.js';

export interface ConnectToolkitParams {
  toolkitSlug: string;
  reason: string;
}

export interface ConnectToolkitToolDeps {
  workspaceId: string;
  userId: string;
  db: DbClient;
}

/**
 * Check if a toolkit is already connected for a workspace.
 */
async function getExistingIntegration(
  db: DbClient,
  workspaceId: string,
  toolkitSlug: string,
): Promise<typeof schema.workspaceIntegrations.$inferSelect | null> {
  const [integration] = await db
    .select()
    .from(schema.workspaceIntegrations)
    .where(
      and(
        eq(schema.workspaceIntegrations.workspaceId, workspaceId),
        eq(schema.workspaceIntegrations.toolkitSlug, toolkitSlug),
      ),
    );

  return integration || null;
}

/**
 * Initiate a connection for a toolkit.
 * Creates Composio connected account and upserts database record.
 */
async function initiateConnection(
  db: DbClient,
  workspaceId: string,
  userId: string,
  toolkitSlug: string,
): Promise<ConnectionToolResult> {
  const composio = getComposioClient();
  const toolkitMapping = getToolkitMapping(toolkitSlug);
  const toolkitName = toolkitMapping?.toolkitName || toolkitSlug;

  // Create workspace-specific entity ID for isolation
  const entityId = `ws_${workspaceId}_user_${userId}`;

  console.log(
    `[ConnectToolkit] Creating connection for ${toolkitSlug} with entity ${entityId}`,
  );

  try {
    // Use the simpler toolkits.authorize method
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const connection = await (composio.toolkits as any).authorize(
      entityId,
      toolkitSlug,
    );

    const connectedAccountId = connection.id;
    const authUrl =
      connection.redirect_url || connection.redirect_uri || connection.url || null;
    const status = connection.status || 'PENDING';

    console.log(
      `[ConnectToolkit] Created connection ${connectedAccountId} with status ${status}`,
      `Auth URL: ${authUrl ? 'present' : 'missing'}`,
    );

    // Upsert integration in database
    await db
      .insert(schema.workspaceIntegrations)
      .values({
        workspaceId,
        toolkitSlug,
        connectedAccountId,
        connectionStatus: status,
        createdBy: userId,
        metadata: {
          entityId,
          connectedAt: new Date().toISOString(),
        },
      })
      .onConflictDoUpdate({
        target: [
          schema.workspaceIntegrations.workspaceId,
          schema.workspaceIntegrations.toolkitSlug,
        ],
        set: {
          connectedAccountId,
          connectionStatus: status,
          updatedAt: new Date(),
        },
      });

    return {
      type: 'connection_initiated',
      toolkitSlug,
      toolkitName,
      authUrl: authUrl || '',
      connectedAccountId,
      message: `Connection initiated for ${toolkitName}. Click the link to authorize access.`,
      suggestedActions: toolkitMapping?.actions,
    };
  } catch (error) {
    console.error(`[ConnectToolkit] Error creating connection:`, error);

    // Try to provide a more helpful error message
    let errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (errorMessage.includes('auth_config') || errorMessage.includes('authConfig')) {
      errorMessage = `No auth config found for ${toolkitName}. Please ensure the toolkit is configured in Composio dashboard.`;
    }

    return {
      type: 'connection_required',
      toolkitSlug,
      toolkitName,
      authUrl: '',
      connectedAccountId: '',
      message: `Failed to initiate connection for ${toolkitName}: ${errorMessage}`,
      suggestedActions: toolkitMapping?.actions,
    };
  }
}

/**
 * Create the connect_toolkit meta-tool.
 *
 * This tool is ALWAYS available in sessions, allowing the AI to
 * proactively offer connections for unconnected toolkits.
 */
export function createConnectToolkitTool(
  deps: ConnectToolkitToolDeps,
): AgentTool {
  const { workspaceId, userId, db } = deps;

  return {
    name: 'connect_toolkit',
    label: 'Connect Toolkit',
    description: `Initiate OAuth connection for a specific toolkit (e.g., gmail, slack, github).
Use this when the user wants to perform an action that requires a toolkit that isn't connected yet.
Returns a connection link that the user can click to authorize access.`,
    parameters: Type.Object({
      toolkitSlug: Type.String({
        description:
          'The slug of the toolkit to connect (e.g., "gmail", "slack", "github", "google_calendar")',
      }),
      reason: Type.String({
        description:
          'Brief explanation of why the connection is needed (shown to user)',
      }),
    }),
    execute: async (
      _toolCallId: string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      params: any,
      _signal?: AbortSignal,
      _onUpdate?: (partial: AgentToolResult<unknown>) => void,
    ): Promise<AgentToolResult<unknown>> => {
      const { toolkitSlug, reason } = params as ConnectToolkitParams;

      console.log(
        `[ConnectToolkit] Tool invoked for ${toolkitSlug}: ${reason}`,
      );

      // Get toolkit info
      const toolkitMapping = getToolkitMapping(toolkitSlug);
      const toolkitName = toolkitMapping?.toolkitName || toolkitSlug;

      // Check if already connected
      const existing = await getExistingIntegration(db, workspaceId, toolkitSlug);

      if (existing && existing.connectionStatus === 'ACTIVE') {
        console.log(
          `[ConnectToolkit] ${toolkitName} already connected for workspace`,
        );

        return {
          content: [
            {
              type: 'text',
              text: `${toolkitName} is already connected for this workspace. You can proceed with using it.`,
            },
          ],
          details: {
            toolkitSlug,
            toolkitName,
            status: 'already_connected',
            connectedAccountId: existing.connectedAccountId,
          },
        };
      }

      // If pending or expired, we can re-initiate
      if (existing && existing.connectionStatus === 'PENDING') {
        console.log(
          `[ConnectToolkit] ${toolkitName} has pending connection, re-initiating...`,
        );
      }

      // Initiate connection
      const result = await initiateConnection(
        db,
        workspaceId,
        userId,
        toolkitSlug,
      );

      // Build user-facing message
      let userMessage: string;
      if (result.authUrl) {
        userMessage = `To use ${toolkitName}, please connect your account:\n\n**[${toolkitName} Authorization Link](${result.authUrl})**\n\n${reason}`;
      } else {
        userMessage = result.message;
      }

      return {
        content: [
          {
            type: 'text',
            text: userMessage,
          },
        ],
        details: result,
      };
    },
  };
}