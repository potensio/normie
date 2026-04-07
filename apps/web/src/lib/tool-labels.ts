/**
 * Tool labels and formatting utilities
 *
 * Maps tool names to human-readable labels for compact display.
 */

export interface ToolLabel {
  verb: string; // e.g., "Reading", "Running"
  pastTense: string; // e.g., "Read", "Ran"
}

// Known tool name patterns to label mapping
const TOOL_LABELS: Record<string, ToolLabel> = {
  // File operations
  read: { verb: "Reading", pastTense: "Read" },
  write: { verb: "Writing", pastTense: "Wrote" },
  edit: { verb: "Writing", pastTense: "Wrote" },
  create: { verb: "Creating", pastTense: "Created" },
  delete: { verb: "Deleting", pastTense: "Deleted" },

  // Shell/Command
  bash: { verb: "Running command", pastTense: "Ran command" },
  shell: { verb: "Running command", pastTense: "Ran command" },
  execute: { verb: "Executing", pastTense: "Executed" },

  // Search
  grep: { verb: "Searching", pastTense: "Searched" },
  search: { verb: "Searching", pastTense: "Searched" },
  find: { verb: "Finding", pastTense: "Found" },
  glob: { verb: "Finding files", pastTense: "Found files" },

  // Browser
  browser: { verb: "Opening browser", pastTense: "Opened browser" },
  navigate: { verb: "Navigating", pastTense: "Navigated" },
  click: { verb: "Clicking", pastTense: "Clicked" },
  screenshot: { verb: "Taking screenshot", pastTense: "Took screenshot" },

  // Data
  query: { verb: "Querying", pastTense: "Queried" },
  database: { verb: "Querying database", pastTense: "Queried database" },

  // Communication
  mail: { verb: "Sending email", pastTense: "Sent email" },
  email: { verb: "Sending email", pastTense: "Sent email" },
  slack: { verb: "Sending message", pastTense: "Sent message" },

  // Utility
  todo: { verb: "Updating todos", pastTense: "Updated todos" },

  // Connection/Integration
  connect_toolkit: { verb: "Initiating connection", pastTense: "Initiated connection" },
  connect: { verb: "Connecting", pastTense: "Connected" },
};

/**
 * Get tool label (verb and past tense) from tool name
 */
export function getToolLabel(toolName: string): ToolLabel {
  const normalizedName = toolName.toLowerCase();

  // Check exact match first
  if (TOOL_LABELS[normalizedName]) {
    return TOOL_LABELS[normalizedName];
  }

  // Check partial matches
  for (const [key, label] of Object.entries(TOOL_LABELS)) {
    if (normalizedName.includes(key) || key.includes(normalizedName)) {
      return label;
    }
  }

  // Fallback: convert camelCase/PascalCase to spaces and capitalize
  return {
    verb: formatToolName(toolName),
    pastTense: formatToolName(toolName),
  };
}

/**
 * Format tool name into a readable label
 * Converts camelCase/PascalCase to spaces and capitalizes
 */
function formatToolName(toolName: string): string {
  // Handle all caps
  if (toolName === toolName.toUpperCase()) {
    return toolName.charAt(0).toUpperCase() + toolName.slice(1).toLowerCase();
  }

  // Convert camelCase/PascalCase to spaces
  const spaced = toolName
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");

  // Capitalize first letter
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Extract tool target from tool input
 * Returns a short description of what the tool is operating on
 */
export function getToolTarget(
  toolName: string,
  input: Record<string, unknown>
): string {
  const normalizedName = toolName.toLowerCase();

  // File tools - show filename or path
  if (
    ["read", "write", "edit", "create", "delete"].some((t) =>
      normalizedName.includes(t)
    )
  ) {
    const filePath =
      (input.file_path as string) ||
      (input.path as string) ||
      (input.filename as string) ||
      (input.file as string);
    if (filePath) {
      return getBasename(filePath);
    }
  }

  // Bash/shell - show command
  if (
    ["bash", "shell", "execute"].some((t) => normalizedName.includes(t))
  ) {
    const command = (input.command as string) || (input.cmd as string);
    if (command) {
      return command;
    }
  }

  // Search tools - show query or pattern
  if (
    ["grep", "search", "find", "glob"].some((t) => normalizedName.includes(t))
  ) {
    const query =
      (input.query as string) ||
      (input.pattern as string) ||
      (input.search as string);
    if (query) {
      return query;
    }
  }

  // Browser tools - show URL
  if (["browser", "navigate"].some((t) => normalizedName.includes(t))) {
    const url = (input.url as string) || (input.link as string);
    if (url) {
      return url;
    }
  }

  // Fallback: try common field names
  return (
    (input.file_path as string) ||
    (input.path as string) ||
    (input.query as string) ||
    (input.command as string) ||
    (input.url as string) ||
    ""
  );
}

/**
 * Get basename from a file path
 */
function getBasename(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || filePath;
}

/**
 * Truncate target string to max length
 */
export function truncateTarget(target: string, maxLength = 40): string {
  if (!target) return "";
  if (target.length <= maxLength) return target;
  return target.slice(0, maxLength) + "...";
}