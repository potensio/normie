/**
 * Composio Tool Wrapper
 *
 * Wraps Composio tools with pre-execution status checks and error handling.
 */

import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';
import { Composio } from '@composio/core';
import type { DbClient } from '../../services/integration.service.js';
import type { ConnectionStatusManager } from '../../services/connection-status.service.js';
import { classifyComposioError } from './composio-errors.js';
import { createConnectionExpiredError, createConnectionRequiredError } from '../../types/composio-errors.js';
import { getToolkitMapping } from '../../services/toolkit-keywords.js';
import type { ConnectionToolResult } from '../../types/toolkit.js';

export interface WrappedToolOptions {
  /** The base Composio action tool to wrap */
  baseTool: AgentTool;
  /** Workspace ID */
  workspaceId: string;
  /** Toolkit slug (e.g., 'gmail', 'slack') */
  toolkitSlug: string;
  /** Connected account ID from Composio */
  connectedAccountId: string;
  /** Database client */
  db: DbClient;
  /** Connection status manager */
  statusManager: ConnectionStatusManager;
  /** Composio client */
  composioClient: Composio;
  /** Entity ID for execution isolation */
  entityId: string;
}

/**
 * Generate a fresh OAuth URL for reconnection.
 */
async function generateReconnectUrl(
  composioClient: Composio,
  toolkitSlug: string,
  entityId: string,
  workspaceId: string,
  userId: string,
  db: DbClient,
): Promise<string | null> {
  try {
    const redirectUrl = process.env.FRONTEND_URL
      ? `${process.env.FRONTEND_URL}/integrations/callback`
      : 'http://localhost:5173/integrations/callback';

    // Get auth config
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const authConfigs = await (composioClient.authConfigs as any).list({
      toolkit: toolkitSlug,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const authConfigId = authConfigs.items?.[0]?.id;

    // Create new connection
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const connection = await (composioClient.connectedAccounts as any).create({
      auth_config: { id: authConfigId || '' },
      connection: {
        params: {
          redirect_uri: redirectUrl,
        },
      },
      user_id: entityId,
    });

    const newConnectedAccountId = connection.id;
    const authUrl = connection.redirect_url || connection.redirect_uri || null;

    // Update DB with new connection
    if (newConnectedAccountId && authUrl) {
      const { eq } = await import('drizzle-orm');
      const schema = await import('../../db/schema.js');

      await db
        .update(schema.workspaceIntegrations)
        .set({
          connectedAccountId: newConnectedAccountId,
          connectionStatus: 'PENDING',
          updatedAt: new Date(),
        })
        .where(eq(schema.workspaceIntegrations.workspaceId, workspaceId));
    }

    return authUrl;
  } catch (error) {
    console.error('[ToolWrapper] Failed to generate reconnect URL:', error);
    return null;
  }
}

/**
 * Wrap a Composio tool with pre-execution status check.
 *
 * This ensures:
 * 1. Connection is ACTIVE before execution
 * 2. Errors are properly classified
 * 3. Expired connections are marked and reconnection URLs generated
 */
export function wrapToolWithStatusCheck(options: WrappedToolOptions): AgentTool {
  const {
    baseTool,
    workspaceId,
    toolkitSlug,
    connectedAccountId,
    db,
    statusManager,
    composioClient,
    entityId,
  } = options;

  const toolkitMapping = getToolkitMapping(toolkitSlug);
  const toolkitName = toolkitMapping?.toolkitName || toolkitSlug;

  return {
    ...baseTool,
    // Override the execute function
    execute: async (
      toolCallId: string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      params: any,
      signal?: AbortSignal,
      onUpdate?: (partial: AgentToolResult<unknown>) => void,
    ): Promise<AgentToolResult<unknown>> => {
      const startTime = Date.now();

      // 1. Check connection status before execution
      const statusCheck = await statusManager.checkStatus(db, workspaceId, toolkitSlug);

      // 2. If not ACTIVE, return appropriate error
      if (statusCheck.status !== 'ACTIVE') {
        console.log(
          `[ToolWrapper] ${toolkitName} connection not ACTIVE: ${statusCheck.status}`,
        );

        // Generate reconnect URL
        const authUrl = await generateReconnectUrl(
          composioClient,
          toolkitSlug,
          entityId,
          workspaceId,
          entityId.split('_').pop() || '',
          db,
        );

        const error =
          statusCheck.status === 'EXPIRED'
            ? createConnectionExpiredError(toolkitSlug, toolkitName, authUrl || undefined)
            : createConnectionRequiredError(toolkitSlug, toolkitName, authUrl || undefined);

        return {
          content: [
            {
              type: 'text',
              text: authUrl
                ? `Your ${toolkitName} connection is ${statusCheck.status.toLowerCase()}. [Click here to reconnect](${authUrl})`
                : `Your ${toolkitName} connection is ${statusCheck.status.toLowerCase()}. Please reconnect in Settings.`,
            },
          ],
          details: {
            type: statusCheck.status === 'EXPIRED' ? 'connection_expired' : 'connection_required',
            toolkitSlug,
            toolkitName,
            authUrl,
            connectedAccountId,
          } as ConnectionToolResult,
        };
      }

      // 3. Execute the original tool
      try {
        const result = await baseTool.execute(toolCallId, params, signal, onUpdate);
        return result;
      } catch (executionError) {
        // 4. Classify and handle execution errors
        const classified = classifyComposioError(executionError, toolkitSlug);
        const executionTime = (Date.now() - startTime) / 1000;

        console.error(
          `[ToolWrapper] ${baseTool.name} execution failed:`,
          classified.type,
          classified.message,
        );

        // 5. If auth error, mark integration as expired
        if (classified.type === 'connection_expired' || classified.type === 'permission_denied') {
          await statusManager.markExpired(
            db,
            workspaceId,
            toolkitSlug,
            classified.message,
          );

          // Generate reconnect URL
          const authUrl = await generateReconnectUrl(
            composioClient,
            toolkitSlug,
            entityId,
            workspaceId,
            entityId.split('_').pop() || '',
            db,
          );

          classified.authUrl = authUrl || undefined;
        }

        // 6. Return error result
        return {
          content: [
            {
              type: 'text',
              text: classified.authUrl
                ? `${classified.message}\n\n[Click here to reconnect](${classified.authUrl})`
                : classified.message,
            },
          ],
          details: {
            ...classified,
            executionTime,
            connectedAccountId,
            isError: true,
          },
        };
      }
    },
  };
}

/**
 * Check if a tool result indicates a connection issue.
 */
export function isConnectionError(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const details = (result as any).details;
  if (!details) return false;

  const type = details.type || details.errorType;
  return (
    type === 'connection_required' ||
    type === 'connection_expired' ||
    type === 'permission_denied'
  );
}