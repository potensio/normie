/**
 * ErrorToolResult
 *
 * Displays tool execution errors with appropriate guidance.
 * Handles rate limits, service errors, validation errors, and permission issues.
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  Clock,
  AlertTriangle,
  Shield,
  RefreshCw,
} from 'lucide-react';
import type { ComposioToolError } from '@normie/types';
import { ToolkitIcon } from '../icons/ToolkitIcons';

export interface ErrorToolResultProps {
  /** The error data */
  error: ComposioToolError;
  /** The tool name that failed */
  toolName?: string;
  /** Whether the tool is still streaming */
  isStreaming?: boolean;
}

/**
 * Get icon and color for error type.
 */
function getErrorStyle(type: ComposioToolError['type']) {
  switch (type) {
    case 'rate_limited':
      return {
        icon: Clock,
        bgColor: 'bg-amber-50 dark:bg-amber-900/20',
        borderColor: 'border-amber-200 dark:border-amber-800',
        iconColor: 'text-amber-500',
        textColor: 'text-amber-700 dark:text-amber-400',
      };
    case 'service_unavailable':
      return {
        icon: AlertTriangle,
        bgColor: 'bg-orange-50 dark:bg-orange-900/20',
        borderColor: 'border-orange-200 dark:border-orange-800',
        iconColor: 'text-orange-500',
        textColor: 'text-orange-700 dark:text-orange-400',
      };
    case 'permission_denied':
      return {
        icon: Shield,
        bgColor: 'bg-purple-50 dark:bg-purple-900/20',
        borderColor: 'border-purple-200 dark:border-purple-800',
        iconColor: 'text-purple-500',
        textColor: 'text-purple-700 dark:text-purple-400',
      };
    case 'validation_error':
      return {
        icon: AlertCircle,
        bgColor: 'bg-blue-50 dark:bg-blue-900/20',
        borderColor: 'border-blue-200 dark:border-blue-800',
        iconColor: 'text-blue-500',
        textColor: 'text-blue-700 dark:text-blue-400',
      };
    default:
      return {
        icon: AlertCircle,
        bgColor: 'bg-red-50 dark:bg-red-900/20',
        borderColor: 'border-red-200 dark:border-red-800',
        iconColor: 'text-red-500',
        textColor: 'text-red-700 dark:text-red-400',
      };
  }
}

/**
 * Countdown timer component for rate limits.
 */
function RateLimitCountdown({ seconds }: { seconds: number }) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    if (remaining <= 0) return;

    const timer = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [remaining]);

  if (remaining <= 0) {
    return (
      <span className="text-emerald-600 dark:text-emerald-400 text-sm">
        You can retry now
      </span>
    );
  }

  const minutes = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const formatted = minutes > 0 ? `${minutes}m ${secs}s` : `${secs}s`;

  return (
    <span className="text-amber-600 dark:text-amber-400 text-sm font-medium">
      Retry in {formatted}
    </span>
  );
}

export function ErrorToolResult({
  error,
  toolName,
  isStreaming,
}: ErrorToolResultProps): JSX.Element {
  const { type, toolkitSlug, toolkitName, message, retryAfter, details } = error;
  const style = getErrorStyle(type);
  const Icon = style.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
      className={`rounded-lg border ${style.borderColor} ${style.bgColor} overflow-hidden`}
    >
      {/* Header */}
      <div className="flex items-start gap-3 px-4 py-3">
        <div className={`flex-shrink-0 mt-0.5 ${style.iconColor}`}>
          <Icon className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {toolkitSlug && (
              <ToolkitIcon slug={toolkitSlug} size="sm" />
            )}
            <h4 className={`text-sm font-medium ${style.textColor}`}>
              {toolkitName || 'Tool'} Error
            </h4>
          </div>

          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            {message}
          </p>

          {toolName && (
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">
              Action: {toolName}
            </p>
          )}
        </div>
      </div>

      {/* Rate limit countdown */}
      {type === 'rate_limited' && retryAfter && retryAfter > 0 && (
        <div className="px-4 py-2 border-t border-amber-200 dark:border-amber-800 bg-amber-100/50 dark:bg-amber-900/30">
          <RateLimitCountdown seconds={retryAfter} />
        </div>
      )}

      {/* Validation error details */}
      {type === 'validation_error' && details && Object.keys(details).length > 0 && (
        <div className="px-4 py-2 border-t border-blue-200 dark:border-blue-800 bg-blue-100/50 dark:bg-blue-900/30">
          <div className="text-xs text-blue-600 dark:text-blue-400 space-y-1">
            {Object.entries(details).map(([key, value]) => (
              <div key={key} className="flex gap-2">
                <span className="font-medium">{key}:</span>
                <span>{String(value)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Retry suggestion */}
      {(type === 'service_unavailable' || type === 'permission_denied') && (
        <div className="px-4 py-2 border-t border-zinc-200 dark:border-zinc-700 bg-zinc-100/50 dark:bg-zinc-800/30">
          <p className="text-xs text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
            <RefreshCw className="w-3 h-3" />
            {type === 'service_unavailable'
              ? 'Please try again later'
              : 'You may need to reconnect with additional permissions'}
          </p>
        </div>
      )}

      {isStreaming && (
        <div className="h-1 bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
          <div className="h-full bg-amber-500 animate-pulse w-1/2" />
        </div>
      )}
    </motion.div>
  );
}