/**
 * Composio Error Types
 *
 * Type definitions and utilities for handling Composio API errors.
 */

import type { AgentToolResult } from '@mariozechner/pi-agent-core';

export type ComposioErrorType =
  | 'connection_required'
  | 'connection_expired'
  | 'rate_limited'
  | 'service_unavailable'
  | 'validation_error'
  | 'permission_denied'
  | 'unknown_error';

export interface ComposioToolError {
  type: ComposioErrorType;
  toolkitSlug: string;
  toolkitName: string;
  message: string;
  authUrl?: string;
  retryAfter?: number;
  details?: Record<string, unknown>;
}

/**
 * HTTP status to error type mapping.
 */
export const HTTP_STATUS_ERROR_MAP: Record<number, ComposioErrorType> = {
  401: 'connection_expired',
  403: 'permission_denied',
  429: 'rate_limited',
  500: 'service_unavailable',
  502: 'service_unavailable',
  503: 'service_unavailable',
};

/**
 * Check if an error requires reconnection.
 */
export function isReconnectableError(error: unknown): boolean {
  if (!error) return false;

  const errorType = (error as ComposioToolError)?.type;
  return errorType === 'connection_expired' || errorType === 'connection_required';
}

/**
 * Check if an error is a rate limit error.
 */
export function isRateLimitError(error: unknown): boolean {
  return (error as ComposioToolError)?.type === 'rate_limited';
}

/**
 * Check if an error is retryable.
 */
export function isRetryableError(error: unknown): boolean {
  const errorType = (error as ComposioToolError)?.type;
  return errorType === 'rate_limited' || errorType === 'service_unavailable';
}

/**
 * Create a tool result for an error.
 */
export function createErrorToolResult(
  error: ComposioToolError,
): AgentToolResult<unknown> {
  let errorMessage = error.message;

  // Add specific guidance based on error type
  switch (error.type) {
    case 'connection_expired':
      errorMessage = `Your ${error.toolkitName} connection has expired. Please reconnect to continue.`;
      break;
    case 'connection_required':
      errorMessage = `Please connect your ${error.toolkitName} account to use this feature.`;
      break;
    case 'rate_limited':
      errorMessage = `${error.toolkitName} rate limit reached.${error.retryAfter ? ` Please wait ${error.retryAfter} seconds before retrying.` : ''}`;
      break;
    case 'service_unavailable':
      errorMessage = `${error.toolkitName} is currently unavailable. Please try again later.`;
      break;
    case 'validation_error':
      errorMessage = `Invalid request to ${error.toolkitName}: ${error.message}`;
      break;
    case 'permission_denied':
      errorMessage = `Permission denied for ${error.toolkitName}. You may need to reconnect with additional permissions.`;
      break;
  }

  return {
    content: [
      {
        type: 'text',
        text: errorMessage,
      },
    ],
    details: {
      errorType: error.type,
      toolkitSlug: error.toolkitSlug,
      toolkitName: error.toolkitName,
      authUrl: error.authUrl,
      retryAfter: error.retryAfter,
    },
  };
}

/**
 * Create a connection required error.
 */
export function createConnectionRequiredError(
  toolkitSlug: string,
  toolkitName: string,
  authUrl?: string,
): ComposioToolError {
  return {
    type: 'connection_required',
    toolkitSlug,
    toolkitName,
    message: `${toolkitName} is not connected. Please connect your account.`,
    authUrl,
  };
}

/**
 * Create a connection expired error.
 */
export function createConnectionExpiredError(
  toolkitSlug: string,
  toolkitName: string,
  authUrl?: string,
): ComposioToolError {
  return {
    type: 'connection_expired',
    toolkitSlug,
    toolkitName,
    message: `${toolkitName} connection has expired. Please reconnect.`,
    authUrl,
  };
}