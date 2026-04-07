/**
 * Integration Response Types
 *
 * Types for integration management API responses.
 */

import type { ConnectionStatus } from './connection.js';

/**
 * Toolkit metadata for display purposes.
 */
export interface ToolkitInfo {
  slug: string;
  name: string;
  description?: string;
  logo?: string;
  category?: string;
  actions?: string[];
}

/**
 * Detail about a connected integration.
 */
export interface IntegrationDetail {
  /** Toolkit slug (e.g., 'gmail') */
  toolkitSlug: string;
  /** Toolkit display name */
  toolkitName: string;
  /** Toolkit info for display */
  toolkitInfo?: ToolkitInfo;
  /** Connected account ID from Composio */
  connectedAccountId: string;
  /** Current connection status */
  status: ConnectionStatus;
  /** When the connection was created */
  connectedAt: Date;
  /** When the connection was last used */
  lastUsedAt?: Date;
  /** User who connected it */
  connectedBy?: {
    id: string;
    name?: string;
    email?: string;
  };
  /** Whether current user can disconnect */
  canDisconnect: boolean;
  /** Whether this toolkit is in active chat sessions */
  isActiveInSessions: boolean;
  /** Number of active sessions using this toolkit */
  activeSessionCount?: number;
}

/**
 * Request to disconnect a toolkit.
 */
export interface DisconnectRequest {
  /** Force disconnect even if active sessions exist */
  force?: boolean;
}

/**
 * Response from disconnect operation.
 */
export interface DisconnectResponse {
  /** Whether disconnect succeeded */
  success: boolean;
  /** Toolkit that was disconnected */
  toolkitSlug: string;
  /** Warning message if sessions were active */
  warning?: {
    activeSessionCount: number;
    sessionIds: string[];
  };
  /** Error message if failed */
  error?: string;
}

/**
 * Response for listing integrations.
 */
export interface IntegrationListResponse {
  workspaceId: string;
  integrations: IntegrationDetail[];
}

/**
 * Options for disconnect operation.
 */
export interface DisconnectOptions {
  /** Workspace ID */
  workspaceId: string;
  /** Toolkit to disconnect */
  toolkitSlug: string;
  /** User performing the disconnect */
  userId: string;
  /** Force disconnect even if active sessions */
  force?: boolean;
}

/**
 * Result of disconnect operation.
 */
export interface DisconnectResult {
  /** Whether the DB record was deleted */
  dbDeleted: boolean;
  /** Whether Composio connection was deleted */
  composioDeleted: boolean;
  /** Any warning to return to user */
  warning?: {
    activeSessionCount: number;
    sessionIds: string[];
  };
  /** Error if disconnect failed */
  error?: string;
}