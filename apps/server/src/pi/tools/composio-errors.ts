/**
 * Composio Error Classification
 *
 * Classifies errors from Composio API calls into structured error types.
 */

import type { ComposioToolError, ComposioErrorType } from '../../types/composio-errors.js';
import { getToolkitMapping } from '../../services/toolkit-keywords.js';

/**
 * HTTP status to error type mapping.
 */
function getErrorTypeFromStatus(status: number): ComposioErrorType {
  if (status === 401) return 'connection_expired';
  if (status === 403) return 'permission_denied';
  if (status === 429) return 'rate_limited';
  if (status >= 500 && status < 600) return 'service_unavailable';
  if (status === 400) return 'validation_error';
  return 'unknown_error';
}

/**
 * Error body patterns that indicate specific error types.
 */
const ERROR_PATTERNS: Array<{
  pattern: RegExp;
  type: ComposioErrorType;
}> = [
  { pattern: /unauthorized|invalid_token|token_expired|token_revoked/i, type: 'connection_expired' },
  { pattern: /rate.?limit|too.?many.?requests|throttl/i, type: 'rate_limited' },
  { pattern: /forbidden|insufficient_scope|permission_denied/i, type: 'permission_denied' },
  { pattern: /validation|invalid_parameter|missing_required/i, type: 'validation_error' },
  { pattern: /service.?unavailable|internal.?error|timeout/i, type: 'service_unavailable' },
];

/**
 * Classify an error from Composio execution.
 */
export function classifyComposioError(
  error: unknown,
  toolkitSlug: string,
): ComposioToolError {
  const toolkitMapping = getToolkitMapping(toolkitSlug);
  const toolkitName = toolkitMapping?.toolkitName || toolkitSlug;

  // Default error
  const defaultError: ComposioToolError = {
    type: 'unknown_error',
    toolkitSlug,
    toolkitName,
    message: 'An unexpected error occurred',
  };

  if (!error) {
    return defaultError;
  }

  // Handle Error instances
  if (error instanceof Error) {
    const message = error.message;

    // Check for HTTP error with response
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const httpError = error as any;
    const status = httpError.status || httpError.statusCode || httpError.response?.status;
    const body = httpError.response?.data || httpError.body || {};

    // Check status code first
    if (status) {
      const errorType = getErrorTypeFromStatus(status);

      return {
        type: errorType,
        toolkitSlug,
        toolkitName,
        message: extractErrorMessage(body, message),
        retryAfter: extractRetryAfter(httpError),
        details: typeof body === 'object' ? body : { raw: body },
      };
    }

    // Check message patterns
    for (const { pattern, type } of ERROR_PATTERNS) {
      if (pattern.test(message)) {
        return {
          type,
          toolkitSlug,
          toolkitName,
          message,
        };
      }
    }

    // Return generic error with message
    return {
      type: 'unknown_error',
      toolkitSlug,
      toolkitName,
      message,
    };
  }

  // Handle object errors
  if (typeof error === 'object') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const errorObj = error as any;

    const status = errorObj.status || errorObj.statusCode;
    const message = errorObj.message || errorObj.error || 'Unknown error';

    if (status) {
      const errorType = getErrorTypeFromStatus(status);

      return {
        type: errorType,
        toolkitSlug,
        toolkitName,
        message,
        retryAfter: extractRetryAfter(errorObj),
      };
    }

    return {
      type: 'unknown_error',
      toolkitSlug,
      toolkitName,
      message,
      details: errorObj,
    };
  }

  // Handle string errors
  if (typeof error === 'string') {
    return {
      type: 'unknown_error',
      toolkitSlug,
      toolkitName,
      message: error,
    };
  }

  return defaultError;
}

/**
 * Extract error message from response body.
 */
function extractErrorMessage(body: unknown, fallback: string): string {
  if (!body) return fallback;

  if (typeof body === 'string') return body;

  if (typeof body === 'object' && body !== null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj = body as any;
    return obj.message || obj.error || obj.description || fallback;
  }

  return fallback;
}

/**
 * Extract retry-after value from error response.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractRetryAfter(error: any): number | undefined {
  // Check headers
  const retryAfter = error?.headers?.['retry-after'] || error?.headers?.['Retry-After'];
  if (retryAfter) {
    const parsed = parseInt(retryAfter, 10);
    if (!isNaN(parsed)) return parsed;
  }

  // Check body
  const body = error?.response?.data || error?.body || {};
  if (typeof body === 'object' && body !== null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const retryValue = (body as any).retry_after || (body as any).retryAfter;
    if (typeof retryValue === 'number') return retryValue;
  }

  return undefined;
}

/**
 * Check if an error indicates the connection needs re-authentication.
 */
export function needsReconnection(errorType: ComposioErrorType): boolean {
  return errorType === 'connection_expired' || errorType === 'connection_required';
}

/**
 * Check if an error is retryable after waiting.
 */
export function isRetryableAfter(errorType: ComposioErrorType): boolean {
  return errorType === 'rate_limited' || errorType === 'service_unavailable';
}