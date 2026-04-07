/**
 * ConnectionPromptButton
 *
 * A button that opens the OAuth authorization URL in the default browser.
 * Uses Electron's shell.openExternal when available.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, Loader2 } from 'lucide-react';
import { openExternalUrl } from '@/lib/browser';

export interface ConnectionPromptButtonProps {
  /** Display name of the toolkit */
  toolkitName: string;
  /** Slug of the toolkit */
  toolkitSlug: string;
  /** OAuth authorization URL */
  authUrl: string;
  /** Button variant */
  variant?: 'primary' | 'secondary';
  /** Callback when button is clicked */
  onConnect?: () => void;
  /** Children to render as button content */
  children: React.ReactNode;
}

const variantStyles = {
  primary:
    'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200',
  secondary:
    'bg-white dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-600',
};

export function ConnectionPromptButton({
  toolkitName,
  toolkitSlug,
  authUrl,
  variant = 'primary',
  onConnect,
  children,
}: ConnectionPromptButtonProps): JSX.Element {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    if (isLoading || !authUrl) return;

    setIsLoading(true);
    onConnect?.();

    try {
      await openExternalUrl(authUrl);
    } catch (error) {
      console.error('[ConnectionPromptButton] Failed to open URL:', error);
    } finally {
      // Add a small delay before resetting to show loading state
      setTimeout(() => setIsLoading(false), 500);
    }
  };

  return (
    <motion.button
      onClick={handleClick}
      disabled={isLoading || !authUrl}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className={`
        w-full flex items-center justify-center gap-2 px-4 py-2.5
        text-sm font-medium rounded-lg transition-colors
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variantStyles[variant]}
      `}
    >
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          Opening...
        </>
      ) : (
        <>
          <ExternalLink className="w-4 h-4" />
          {children}
        </>
      )}
    </motion.button>
  );
}