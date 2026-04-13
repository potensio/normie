/**
 * Session Invalidation
 *
 * Handles invalidating tool sessions when connections are disconnected.
 */

import type { NormieSessionManager } from './session-manager.js';
import type { ActiveSessionTracker } from '../services/active-session-tracker.service.js';

/**
 * Track invalidated toolkits per workspace.
 * Maps workspaceId -> Set of invalidated toolkit slugs
 */
const invalidatedToolkits = new Map<string, Set<string>>();

/**
 * Invalidate all tools for a toolkit in a workspace.
 *
 * Called when a toolkit is disconnected, so active sessions
 * should not attempt to use those tools anymore.
 */
export function invalidateToolkitTools(
  workspaceId: string,
  toolkitSlug: string
): void {
  if (!invalidatedToolkits.has(workspaceId)) {
    invalidatedToolkits.set(workspaceId, new Set());
  }
  invalidatedToolkits.get(workspaceId)!.add(toolkitSlug);

  console.log(
    `[SessionInvalidation] Invalidated toolkit ${toolkitSlug} for workspace ${workspaceId}`
  );
}

/**
 * Check if a toolkit has been invalidated for a workspace.
 */
export function isToolkitInvalidated(
  workspaceId: string,
  toolkitSlug: string
): boolean {
  const workspaceInvalidations = invalidatedToolkits.get(workspaceId);
  if (!workspaceInvalidations) return false;

  return workspaceInvalidations.has(toolkitSlug);
}

/**
 * Clear invalidation for a toolkit (e.g., after reconnection).
 */
export function clearToolkitInvalidation(
  workspaceId: string,
  toolkitSlug: string
): void {
  const workspaceInvalidations = invalidatedToolkits.get(workspaceId);
  if (workspaceInvalidations) {
    workspaceInvalidations.delete(toolkitSlug);
    if (workspaceInvalidations.size === 0) {
      invalidatedToolkits.delete(workspaceId);
    }
  }

  console.log(
    `[SessionInvalidation] Cleared invalidation for toolkit ${toolkitSlug} in workspace ${workspaceId}`
  );
}

/**
 * Get all invalidated toolkits for a workspace.
 */
export function getInvalidatedToolkits(workspaceId: string): string[] {
  const workspaceInvalidations = invalidatedToolkits.get(workspaceId);
  if (!workspaceInvalidations) return [];
  return Array.from(workspaceInvalidations);
}

/**
 * Clear all invalidations for a workspace.
 */
export function clearWorkspaceInvalidations(workspaceId: string): void {
  invalidatedToolkits.delete(workspaceId);
  console.log(
    `[SessionInvalidation] Cleared all invalidations for workspace ${workspaceId}`
  );
}

/**
 * Handle toolkit disconnection.
 *
 * Marks the toolkit as invalidated and notifies active sessions.
 */
export function handleToolkitDisconnect(
  workspaceId: string,
  toolkitSlug: string,
  sessionTracker: ActiveSessionTracker,
  sessionManager?: NormieSessionManager
): {
  activeSessionCount: number;
  sessionIds: string[];
} {
  // Mark as invalidated
  invalidateToolkitTools(workspaceId, toolkitSlug);

  // Get active sessions using this toolkit
  const activeSessions = sessionTracker.getSessionsUsingToolkit(
    workspaceId,
    toolkitSlug
  );

  const result = {
    activeSessionCount: activeSessions.length,
    sessionIds: activeSessions.map((s) => s.chatId),
  };

  if (activeSessions.length > 0) {
    console.log(
      `[SessionInvalidation] ${activeSessions.length} active sessions affected by disconnect of ${toolkitSlug}`
    );

    // If session manager provided, we could push events to sessions
    // For now, tool execution will detect invalidation and fail gracefully
  }

  return result;
}