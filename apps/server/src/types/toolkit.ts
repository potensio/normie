/**
 * Toolkit Types
 *
 * Type definitions for toolkit-related data structures.
 */

import type { ToolkitKeywordMapping } from '../services/toolkit-keywords.js';

export type ConnectionStatus =
  | 'ACTIVE'
  | 'EXPIRED'
  | 'FAILED'
  | 'PENDING'
  | 'NOT_CONNECTED';

export interface ToolkitInfo {
  slug: string;
  name: string;
  description?: string;
  logo?: string;
  categories?: string[];
  isConnected?: boolean;
  connectionStatus?: ConnectionStatus;
}

export interface ToolkitWithConnection extends ToolkitInfo {
  connectedAccountId?: string;
  connectedAt?: Date;
  connectedBy?: string;
}

export interface IntentContext {
  message: string;
  workspaceId: string;
  connectedToolkits: string[];
  suggestedToolkit?: string;
}

export interface ConnectionResult {
  success: boolean;
  toolkitSlug: string;
  toolkitName: string;
  authUrl: string | null;
  connectedAccountId: string | null;
  status: ConnectionStatus;
  message: string;
  suggestedActions?: string[];
}

export type ConnectionActionType =
  | 'connection_required'
  | 'connection_expired'
  | 'connection_initiated';

export interface ConnectionToolResult {
  type: ConnectionActionType;
  toolkitSlug: string;
  toolkitName: string;
  authUrl: string;
  connectedAccountId: string;
  status?: ConnectionStatus;
  message: string;
  suggestedActions?: string[];
}