/**
 * ConnectionPrompt
 *
 * Displays a connection prompt when a toolkit needs to be connected.
 * Shows toolkit info and a clickable button to authorize access.
 */

import { motion } from 'framer-motion';
import { ExternalLink, CheckCircle } from 'lucide-react';
import type { ConnectionToolResult } from '@normie/types';
import { ToolkitIcon } from '../icons/ToolkitIcons';
import { ConnectionPromptButton } from './ConnectionPromptButton';

export interface ConnectionPromptProps {
  /** Connection data from the tool result */
  data: ConnectionToolResult;
  /** Callback when user initiates connection */
  onConnect?: (toolkitSlug: string) => void;
}

/**
 * Get the title based on connection type.
 */
function getTitle(type: ConnectionToolResult['type']): string {
  switch (type) {
    case 'connection_required':
      return 'Connect Your Account';
    case 'connection_expired':
      return 'Reconnect Your Account';
    case 'connection_initiated':
      return 'Connection Initiated';
    default:
      return 'Connect Your Account';
  }
}

/**
 * Get the button text based on connection type.
 */
function getButtonText(
  type: ConnectionToolResult['type'],
  toolkitName: string,
): string {
  switch (type) {
    case 'connection_required':
      return `Connect ${toolkitName}`;
    case 'connection_expired':
      return `Reconnect ${toolkitName}`;
    case 'connection_initiated':
      return `Authorize ${toolkitName}`;
    default:
      return `Connect ${toolkitName}`;
  }
}

export function ConnectionPrompt({
  data,
  onConnect,
}: ConnectionPromptProps): JSX.Element {
  const { type, toolkitSlug, toolkitName, authUrl, suggestedActions } = data;

  const handleConnect = () => {
    onConnect?.(toolkitSlug);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-200 dark:border-zinc-700">
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-white dark:bg-zinc-700 shadow-sm">
          <ToolkitIcon slug={toolkitSlug} size="lg" />
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {toolkitName}
          </h4>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {getTitle(type)}
          </p>
        </div>
        {type === 'connection_initiated' && (
          <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
            <span className="animate-pulse">●</span>
            Pending
          </div>
        )}
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        <p className="text-sm text-zinc-600 dark:text-zinc-300 mb-3">
          {data.message}
        </p>

        {/* Suggested actions */}
        {suggestedActions && suggestedActions.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">
              What you'll be able to do:
            </p>
            <ul className="space-y-1">
              {suggestedActions.slice(0, 4).map((action, index) => (
                <li
                  key={index}
                  className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300"
                >
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                  {action}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Connect button */}
        {authUrl && (
          <ConnectionPromptButton
            toolkitName={toolkitName}
            toolkitSlug={toolkitSlug}
            authUrl={authUrl}
            variant="primary"
            onConnect={handleConnect}
          >
            {getButtonText(type, toolkitName)}
          </ConnectionPromptButton>
        )}

        {/* No auth URL (error case) */}
        {!authUrl && type !== 'connection_initiated' && (
          <p className="text-sm text-red-500">
            Unable to generate authorization link. Please try again.
          </p>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-4 py-2 bg-zinc-100/50 dark:bg-zinc-800/50 border-t border-zinc-200 dark:border-zinc-700">
        <p className="text-xs text-zinc-400 dark:text-zinc-500 flex items-center gap-1.5">
          <ExternalLink className="w-3 h-3" />
          Opens in your default browser
        </p>
      </div>
    </motion.div>
  );
}