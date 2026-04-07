/**
 * Connection Status Service
 *
 * Manages connection status checking, caching, and synchronization
 * between the local database and Composio's actual connection state.
 */

import { eq, and } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Composio } from '@composio/core';
import * as schema from '../db/schema.js';
import type { ConnectionStatus, ConnectionStatusCheck } from '../types/connection.js';

export type DbClient = NodePgDatabase<typeof schema>;

/**
 * Create a connection status manager.
 */
export function createConnectionStatusManager(composioClient: Composio) {
  // In-memory cache for fast lookups
  const statusCache = new Map<string, { status: ConnectionStatus; lastChecked: Date }>();
  const CACHE_TTL_MS = 60 * 1000; // 1 minute cache TTL

  /**
   * Get cache key for a workspace + toolkit combination.
   */
  function getCacheKey(workspaceId: string, toolkitSlug: string): string {
    return `${workspaceId}:${toolkitSlug}`;
  }

  /**
   * Check if cached status is still valid.
   */
  function isCacheValid(cachedAt: Date): boolean {
    return Date.now() - cachedAt.getTime() < CACHE_TTL_MS;
  }

  /**
   * Get connection status, checking Composio API.
   * Updates DB if status has changed.
   */
  async function checkStatus(
    db: DbClient,
    workspaceId: string,
    toolkitSlug: string,
  ): Promise<ConnectionStatusCheck> {
    const cacheKey = getCacheKey(workspaceId, toolkitSlug);

    // Get integration from DB
    const [integration] = await db
      .select()
      .from(schema.workspaceIntegrations)
      .where(
        and(
          eq(schema.workspaceIntegrations.workspaceId, workspaceId),
          eq(schema.workspaceIntegrations.toolkitSlug, toolkitSlug),
        ),
      );

    if (!integration) {
      return {
        isConnected: false,
        status: 'NOT_CONNECTED',
        connectedAccountId: null,
        toolkitSlug,
        lastChecked: new Date(),
      };
    }

    // Check cached status first
    const cached = statusCache.get(cacheKey);
    if (cached && isCacheValid(cached.lastChecked)) {
      return {
        isConnected: cached.status === 'ACTIVE',
        status: cached.status,
        connectedAccountId: integration.connectedAccountId,
        toolkitSlug,
        lastChecked: cached.lastChecked,
      };
    }

    // Query Composio for current status with timeout
    let composioStatus: ConnectionStatus = integration.connectionStatus as ConnectionStatus;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const account = await (composioClient.connectedAccounts as any).retrieve(
        integration.connectedAccountId,
        { signal: controller.signal },
      );

      clearTimeout(timeoutId);

      composioStatus = (account?.status as ConnectionStatus) || 'UNKNOWN';

      // Update DB if status changed
      if (composioStatus !== integration.connectionStatus) {
        await db
          .update(schema.workspaceIntegrations)
          .set({
            connectionStatus: composioStatus,
            updatedAt: new Date(),
          })
          .where(eq(schema.workspaceIntegrations.id, integration.id));

        console.log(
          `[ConnectionStatus] Updated ${toolkitSlug} status: ${integration.connectionStatus} → ${composioStatus}`,
        );
      }
    } catch (error) {
      // On timeout or error, use DB status
      console.warn(
        `[ConnectionStatus] Failed to check status for ${toolkitSlug}:`,
        error instanceof Error ? error.message : 'Unknown error',
      );
      // Keep using the DB status
    }

    // Update cache
    const now = new Date();
    statusCache.set(cacheKey, { status: composioStatus, lastChecked: now });

    return {
      isConnected: composioStatus === 'ACTIVE',
      status: composioStatus,
      connectedAccountId: integration.connectedAccountId,
      toolkitSlug,
      lastChecked: now,
    };
  }

  /**
   * Batch check statuses for multiple integrations.
   */
  async function checkStatuses(
    db: DbClient,
    workspaceId: string,
    toolkitSlugs: string[],
  ): Promise<Map<string, ConnectionStatusCheck>> {
    const results = new Map<string, ConnectionStatusCheck>();

    // Run checks in parallel with Promise.all
    const checks = toolkitSlugs.map(async (slug) => {
      const status = await checkStatus(db, workspaceId, slug);
      return { slug, status };
    });

    const responses = await Promise.all(checks);
    for (const { slug, status } of responses) {
      results.set(slug, status);
    }

    return results;
  }

  /**
   * Mark integration as expired.
   */
  async function markExpired(
    db: DbClient,
    workspaceId: string,
    toolkitSlug: string,
    reason?: string,
  ): Promise<void> {
    const cacheKey = getCacheKey(workspaceId, toolkitSlug);

    // Update DB
    await db
      .update(schema.workspaceIntegrations)
      .set({
        connectionStatus: 'EXPIRED',
        metadata: {
          lastError: reason || 'Authentication failed',
          lastErrorAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.workspaceIntegrations.workspaceId, workspaceId),
          eq(schema.workspaceIntegrations.toolkitSlug, toolkitSlug),
        ),
      );

    // Update cache
    statusCache.set(cacheKey, { status: 'EXPIRED', lastChecked: new Date() });

    console.log(`[ConnectionStatus] Marked ${toolkitSlug} as EXPIRED: ${reason || 'Unknown reason'}`);
  }

  /**
   * Get cached status without API call.
   */
  async function getCachedStatus(
    db: DbClient,
    workspaceId: string,
    toolkitSlug: string,
  ): Promise<ConnectionStatusCheck | null> {
    const cacheKey = getCacheKey(workspaceId, toolkitSlug);
    const cached = statusCache.get(cacheKey);

    if (cached && isCacheValid(cached.lastChecked)) {
      // Get connectedAccountId from DB
      const [integration] = await db
        .select({ connectedAccountId: schema.workspaceIntegrations.connectedAccountId })
        .from(schema.workspaceIntegrations)
        .where(
          and(
            eq(schema.workspaceIntegrations.workspaceId, workspaceId),
            eq(schema.workspaceIntegrations.toolkitSlug, toolkitSlug),
          ),
        );

      return {
        isConnected: cached.status === 'ACTIVE',
        status: cached.status,
        connectedAccountId: integration?.connectedAccountId || null,
        toolkitSlug,
        lastChecked: cached.lastChecked,
      };
    }

    return null;
  }

  /**
   * Invalidate cache for a specific integration.
   */
  function invalidateCache(workspaceId: string, toolkitSlug: string): void {
    const cacheKey = getCacheKey(workspaceId, toolkitSlug);
    statusCache.delete(cacheKey);
  }

  /**
   * Clear all cached statuses.
   */
  function clearCache(): void {
    statusCache.clear();
  }

  return {
    checkStatus,
    checkStatuses,
    markExpired,
    getCachedStatus,
    invalidateCache,
    clearCache,
  };
}

export type ConnectionStatusManager = ReturnType<typeof createConnectionStatusManager>;