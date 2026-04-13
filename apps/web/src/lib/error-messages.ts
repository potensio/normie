/**
 * Error classification for tool executions
 *
 * Maps technical errors to user-friendly messages.
 */

/**
 * Maximum length for unknown error messages
 */
const MAX_ERROR_LENGTH = 77;

/**
 * Classify tool error into user-friendly message
 */
export function classifyToolError(error: unknown): string {
  if (!error) return "Unknown error";

  const message =
    error instanceof Error ? error.message : String(error);

  const lowerMessage = message.toLowerCase();

  // Network errors
  if (
    lowerMessage.includes("network") ||
    lowerMessage.includes("enet") ||
    lowerMessage.includes("econnrefused") ||
    lowerMessage.includes("econnreset") ||
    lowerMessage.includes("fetch failed")
  ) {
    return "Network error, please check your connection";
  }

  // Timeout errors
  if (
    lowerMessage.includes("timeout") ||
    lowerMessage.includes("etimedout") ||
    lowerMessage.includes("timed out")
  ) {
    return "Operation timed out";
  }

  // Permission errors
  if (
    lowerMessage.includes("permission") ||
    lowerMessage.includes("eacces") ||
    lowerMessage.includes("eperm") ||
    lowerMessage.includes("denied")
  ) {
    return "Permission denied";
  }

  // Not found errors
  if (
    lowerMessage.includes("not found") ||
    lowerMessage.includes("enoent") ||
    lowerMessage.includes("does not exist")
  ) {
    return "File or resource not found";
  }

  // Truncate unknown errors
  if (message.length > MAX_ERROR_LENGTH) {
    return message.slice(0, MAX_ERROR_LENGTH) + "...";
  }

  return message;
}