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
  
  // Get or create auth config for the toolkit
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const authConfigs = await (composio.authConfigs as any).list({ toolkit: input.toolkitSlug });
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const authConfigId = authConfigs.items?.[0]?.id;
  
  // Create connected account link with workspace-scoped entity
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const connection = await (composio.connectedAccounts as any).create({
    auth_config: { id: authConfigId || '' },
    connection: {
      params: {
        redirect_uri: input.redirectUrl || `${process.env.FRONTEND_URL || 'http://localhost:5173'}/integrations/callback`
      }
    },
    user_id: entityId
  });

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
    redirectUrl: connection.redirect_url || connection.redirect_uri || null,
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