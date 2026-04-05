import { codingTools, readOnlyTools } from '@mariozechner/pi-coding-agent';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { TSchema } from '@sinclair/typebox';
import {
  buildComposioTools,
  getComposioClient,
  type ComposioToolConfig,
} from './composio-tools.js';
import { webSearchTool, webFetchTool } from './web-tools.js';

// Re-export for external use
export { buildComposioTools, getComposioClient, type ComposioToolConfig } from './composio-tools.js';
export { webSearchTool, webFetchTool } from './web-tools.js';
export { codingTools, readOnlyTools } from '@mariozechner/pi-coding-agent';

/**
 * Tool builder configuration options
 */
export interface ToolBuilderOptions extends ComposioToolConfig {
  /**
   * Whether to include built-in coding tools (read, write, bash, edit, grep, find, ls)
   * @default true
   */
  includeCodingTools?: boolean;

  /**
   * Whether to include read-only tools only (no write operations)
   * @default false
   */
  readOnlyMode?: boolean;

  /**
   * Whether to include web tools (web_search, web_fetch)
   * @default true
   */
  includeWebTools?: boolean;

  /**
   * Whether to include Composio integration tools
   * @default true
   */
  includeComposioTools?: boolean;

  /**
   * Additional custom tools to include
   */
  customTools?: AgentTool[];
}

/**
 * Build complete tool set for a workspace.
 *
 * Combines:
 * - Pi's built-in coding tools (read, write, bash, edit, grep, find, ls)
 * - Web tools (web_search, web_fetch)
 * - Composio tools (workspace-specific integrations)
 * - Any additional custom tools
 *
 * @example
 * ```typescript
 * const tools = await buildWorkspaceTools({
 *   workspaceId: 'ws-123',
 *   userId: 'user-456',
 *   composioClient: getComposioClient(),
 * });
 * ```
 */
export async function buildWorkspaceTools(
  options: ToolBuilderOptions,
): Promise<AgentTool[]> {
  const {
    includeCodingTools = true,
    readOnlyMode = false,
    includeWebTools = true,
    includeComposioTools = true,
    customTools = [],
    ...composioConfig
  } = options;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: AgentTool<any>[] = [];

  // Add Pi's built-in coding tools
  if (includeCodingTools) {
    if (readOnlyMode) {
      // Read-only mode: only include safe tools
      tools.push(...readOnlyTools);
    } else {
      // Full mode: include all coding tools
      tools.push(...codingTools);
    }
  }

  // Add web tools
  if (includeWebTools) {
    // Cast through unknown to satisfy type checker for heterogeneous tool types
    tools.push(webSearchTool as unknown as AgentTool<TSchema>);
    tools.push(webFetchTool as unknown as AgentTool<TSchema>);
  }

  // Add Composio tools for this workspace
  if (includeComposioTools && composioConfig.workspaceId && composioConfig.userId) {
    try {
      const composioTools = await buildComposioTools(composioConfig);
      tools.push(...composioTools);
    } catch (error) {
      console.error(
        '[ToolSystem] Error building Composio tools:',
        error instanceof Error ? error.message : String(error),
      );
      // Continue without Composio tools rather than failing
    }
  }

  // Add any custom tools
  if (customTools.length > 0) {
    tools.push(...customTools);
  }

  console.log(
    `[ToolSystem] Built ${tools.length} tools for workspace ${composioConfig.workspaceId || 'N/A'}`,
  );

  return tools;
}

/**
 * Build minimal tool set (read-only + web tools only)
 *
 * Useful for preview or sandboxed environments where write access
 * should be restricted.
 */
export async function buildMinimalTools(
  options: Omit<ToolBuilderOptions, 'includeCodingTools' | 'readOnlyMode'>,
): Promise<AgentTool[]> {
  return buildWorkspaceTools({
    ...options,
    includeCodingTools: true,
    readOnlyMode: true,
  });
}

/**
 * Get a tool by name from an array of tools
 */
export function getToolByName(
  tools: AgentTool[],
  name: string,
): AgentTool | undefined {
  return tools.find((tool) => tool.name === name);
}

/**
 * Get all tool names from an array of tools
 */
export function getToolNames(tools: AgentTool[]): string[] {
  return tools.map((tool) => tool.name);
}

/**
 * Check if a tool exists in the array
 */
export function hasTool(tools: AgentTool[], name: string): boolean {
  return tools.some((tool) => tool.name === name);
}

/**
 * Filter tools by names (allowlist)
 */
export function filterTools(
  tools: AgentTool[],
  allowedNames: string[],
): AgentTool[] {
  const allowedSet = new Set(allowedNames);
  return tools.filter((tool) => allowedSet.has(tool.name));
}

/**
 * Exclude tools by names (blocklist)
 */
export function excludeTools(
  tools: AgentTool[],
  excludedNames: string[],
): AgentTool[] {
  const excludedSet = new Set(excludedNames);
  return tools.filter((tool) => !excludedSet.has(tool.name));
}

/**
 * Group tools by category for display purposes
 */
export function groupToolsByCategory(
  tools: AgentTool[],
): Record<string, AgentTool[]> {
  const groups: Record<string, AgentTool[]> = {
    'Built-in': [],
    'Web': [],
    'Integrations': [],
  };

  for (const tool of tools) {
    // Categorize by name patterns
    if (['read', 'write', 'edit', 'bash', 'grep', 'find', 'ls'].includes(tool.name)) {
      groups['Built-in'].push(tool);
    } else if (tool.name.startsWith('web_')) {
      groups['Web'].push(tool);
    } else {
      // Default to Integrations category for Composio tools
      if (!groups['Integrations']) {
        groups['Integrations'] = [];
      }
      groups['Integrations'].push(tool);
    }
  }

  // Remove empty groups
  for (const key of Object.keys(groups)) {
    if (groups[key].length === 0) {
      delete groups[key];
    }
  }

  return groups;
}
