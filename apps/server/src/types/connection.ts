/**
 * Connection Types
 *
 * Type definitions for connection status and management.
 */

export type ConnectionStatus =
  | 'ACTIVE'
  | 'EXPIRED'
  | 'FAILED'
  | 'PENDING'
  | 'NOT_CONNECTED';

export interface ConnectionInfo {
  id: string;
  workspaceId: string;
  toolkitSlug: string;
  toolkitName: string;
  status: ConnectionStatus;
  connectedAccountId: string;
  connectedAt: Date;
  connectedBy: string;
  lastError?: string;
  lastErrorAt?: Date;
}

export interface StatusSyncResult {
  toolkitSlug: string;
  previousStatus: ConnectionStatus;
  newStatus: ConnectionStatus;
  changed: boolean;
}

export interface ConnectionStatusCheck {
  isConnected: boolean;
  status: ConnectionStatus;
  connectedAccountId: string | null;
  toolkitSlug: string;
  lastChecked: Date;
}