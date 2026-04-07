/**
 * Integration Service
 * 
 * Business logic for Composio integration operations.
 * All functions receive db client as parameter for testability.
 */

import { eq, and } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Composio } from '@composio/core';
import * as schema from '../db/schema.js';
import { NotFoundError, ValidationError, ForbiddenError } from '../middleware/index.js';
import type { DisconnectOptions, DisconnectResult } from '../types/integration-responses.js';
import type { ActiveSessionTracker } from './active-session-tracker.service.js';
import { handleToolkitDisconnect } from '../pi/session-invalidation.js';

// ============================================
// Types
// ============================================

export type DbClient = NodePgDatabase<typeof schema>;

export interface ToolkitInfo {
  slug: string;
  name: string;
  description?: string;
  logo?: string;
  categories?: string[];
}

export interface ConnectInput {
  toolkitSlug: string;
  redirectUrl?: string;
}

export interface ConnectResult {
  connectedAccountId: string;
  redirectUrl?: string | null;
  status: string;
}

export interface ConnectionStatus {
  connected: boolean;
  status: string;
  connectedAccountId?: string | null;
  toolkitSlug?: string | null;
}

// ============================================
// Composio Client
// ============================================

let composioInstance: Composio | null = null;

/**
 * Get or create Composio client singleton
 */
export function getComposioClient(): Composio {
  if (!composioInstance) {
    composioInstance = new Composio();
  }
  return composioInstance;
}

/**
 * Reset Composio instance (for testing)
 */
export function resetComposioClient(): void {
  composioInstance = null;
}

// ============================================
// Toolkits
// ============================================

/**
 * List available Composio toolkits
 */
export async function listToolkits(): Promise<ToolkitInfo[]> {
  const composio = getComposioClient();
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toolkits = await (composio.toolkits as any).list();
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items = toolkits.items || toolkits || [];
  
  return items.map((t: any) => ({
    slug: t.slug,
    name: t.name,
    description: t.description,
    logo: t.logo,
    categories: t.categories
  }));
}

// ============================================
// Workspace Integrations
// ============================================

/**
 * List integrations for a workspace
 */
export async function listWorkspaceIntegrations(
  db: DbClient,
  workspaceId: string
): Promise<typeof schema.workspaceIntegrations.$inferSelect[]> {
  const integrations = await db.select()
    .from(schema.workspaceIntegrations)
    .where(eq(schema.workspaceIntegrations.workspaceId, workspaceId));

  return integrations;
}

/**
 * Get a specific integration
 */
export async function getWorkspaceIntegration(
  db: DbClient,
  workspaceId: string,
  toolkitSlug: string
): Promise<typeof schema.workspaceIntegrations.$inferSelect | null> {
  const [integration] = await db.select()
    .from(schema.workspaceIntegrations)
    .where(and(
      eq(schema.workspaceIntegrations.workspaceId, workspaceId),
      eq(schema.workspaceIntegrations.toolkitSlug, toolkitSlug)
    ));

  return integration || null;
}

/**
 * Initiate connection to a toolkit
 */
export async function connectToolkit(
  db: DbClient,
  workspaceId: string,
  userId: string,
  input: ConnectInput
): Promise<ConnectResult> {
  if (!input.toolkitSlug) {
    throw new ValidationError('toolkitSlug is required');
  }

  const composio = getComposioClient();
  
  // Create workspace-specific entity ID for isolation
  const entityId = `ws_${workspaceId}_user_${userId}`;
  
  // Use the simpler toolkits.authorize method
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const connection = await (composio.toolkits as any).authorize(
    entityId,
    input.toolkitSlug
  );

  // Store integration in database
  await db.insert(schema.workspaceIntegrations)
    .values({
      workspaceId,
      toolkitSlug: input.toolkitSlug,
      connectedAccountId: connection.id,
      connectionStatus: connection.status || 'PENDING',
      createdBy: userId,
      metadata: {
        entityId,
        connectedAt: new Date().toISOString()
      }
    })
    .onConflictDoUpdate({
      target: [schema.workspaceIntegrations.workspaceId, schema.workspaceIntegrations.toolkitSlug],
      set: {
        connectedAccountId: connection.id,
        connectionStatus: connection.status || 'PENDING',
        updatedAt: new Date()
      }
    });

  return {
    connectedAccountId: connection.id,
    redirectUrl: connection.redirect_url || connection.redirect_uri || connection.url || null,
    status: connection.status
  };
}

/**
 * Get connection status for a toolkit
 */
export async function getConnectionStatus(
  db: DbClient,
  workspaceId: string,
  toolkitSlug: string
): Promise<ConnectionStatus> {
  const integration = await getWorkspaceIntegration(db, workspaceId, toolkitSlug);

  if (!integration) {
    return { connected: false, status: 'NOT_CONNECTED' };
  }

  // Get fresh status from Composio
  const composio = getComposioClient();

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const account = await (composio.connectedAccounts as any).retrieve(integration.connectedAccountId);
    
    // Update status in database if changed
    const newStatus = account.status || 'UNKNOWN';
    if (newStatus !== integration.connectionStatus) {
      await db.update(schema.workspaceIntegrations)
        .set({ 
          connectionStatus: newStatus,
          updatedAt: new Date()
        })
        .where(eq(schema.workspaceIntegrations.id, integration.id));
    }
    
    return {
      connected: account.status === 'ACTIVE',
      status: account.status || 'UNKNOWN',
      connectedAccountId: integration.connectedAccountId,
      toolkitSlug: integration.toolkitSlug
    };
  } catch (retrieveError) {
    console.error('[INTEGRATIONS] Retrieve error:', retrieveError);
    return {
      connected: false,
      status: integration.connectionStatus || 'UNKNOWN',
      connectedAccountId: integration.connectedAccountId
    };
  }
}

/**
 * Disconnect a toolkit
 */
export async function disconnectToolkit(
  db: DbClient,
  workspaceId: string,
  toolkitSlug: string
): Promise<void> {
  const integration = await getWorkspaceIntegration(db, workspaceId, toolkitSlug);

  if (!integration) {
    throw new NotFoundError('Integration');
  }

  // Delete from Composio
  try {
    const composio = getComposioClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (composio.connectedAccounts as any).delete(integration.connectedAccountId);
  } catch (deleteError) {
    console.error('[INTEGRATIONS] Composio delete error:', deleteError);
    // Continue to delete from our DB even if Composio delete fails
  }

  // Delete from database
  await db.delete(schema.workspaceIntegrations)
    .where(eq(schema.workspaceIntegrations.id, integration.id));
}

/**
 * Disconnect a toolkit with session tracking.
 *
 * Enhanced version that:
 * 1. Checks for active sessions
 * 2. Returns warnings if sessions are active
 * 3. Handles Composio and DB cleanup
 */
export async function disconnectToolkitWithTracking(
  db: DbClient,
  options: DisconnectOptions,
  sessionTracker: ActiveSessionTracker
): Promise<DisconnectResult> {
  const { workspaceId, toolkitSlug, force = false } = options;

  const integration = await getWorkspaceIntegration(db, workspaceId, toolkitSlug);

  if (!integration) {
    return {
      dbDeleted: false,
      composioDeleted: false,
      error: 'Integration not found',
    };
  }

  // Check for active sessions
  const activeSessions = sessionTracker.getSessionsUsingToolkit(workspaceId, toolkitSlug);

  const result: DisconnectResult = {
    dbDeleted: false,
    composioDeleted: false,
  };

  // If sessions active and not forcing, return warning
  if (activeSessions.length > 0 && !force) {
    result.warning = {
      activeSessionCount: activeSessions.length,
      sessionIds: activeSessions.map((s) => s.chatId),
    };
    return result;
  }

  // Invalidate toolkit for active sessions
  handleToolkitDisconnect(workspaceId, toolkitSlug, sessionTracker);

  // Delete from Composio
  try {
    const composio = getComposioClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (composio.connectedAccounts as any).delete(integration.connectedAccountId);
    result.composioDeleted = true;
  } catch (deleteError) {
    console.error('[INTEGRATIONS] Composio delete error:', deleteError);
    // Continue to delete from our DB even if Composio delete fails
  }

  // Delete from database
  try {
    await db.delete(schema.workspaceIntegrations)
      .where(eq(schema.workspaceIntegrations.id, integration.id));
    result.dbDeleted = true;
  } catch (dbError) {
    console.error('[INTEGRATIONS] DB delete error:', dbError);
    result.error = 'Failed to delete from database';
  }

  console.log(
    `[INTEGRATIONS] Disconnected ${toolkitSlug} from workspace ${workspaceId}`,
    `- Composio: ${result.composioDeleted ? 'deleted' : 'failed'}`,
    `- DB: ${result.dbDeleted ? 'deleted' : 'failed'}`
  );

  return result;
}

// ============================================
// Authorization Helpers
// ============================================

/**
 * Check if user can modify integrations
 */
export function canModifyIntegration(role: 'owner' | 'admin' | 'member' | 'viewer' | null): boolean {
  return role === 'owner' || role === 'admin';
}

/**
 * Verify user can modify integrations
 */
export function verifyIntegrationModifyAccess(role: 'owner' | 'admin' | 'member' | 'viewer' | null): void {
  if (!canModifyIntegration(role)) {
    throw new ForbiddenError('Viewers cannot modify integrations');
  }
}