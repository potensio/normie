/**
 * Browser Utilities
 *
 * Cross-platform utilities for opening URLs and detecting environment.
 * Works in both Electron and web contexts.
 */

/**
 * Check if running in Electron environment.
 */
export function isElectron(): boolean {
  // Check for Electron's exposed API
  if (typeof window !== 'undefined' && window.electron) {
    return true;
  }

  // Alternative check via process
  if (
    typeof window !== 'undefined' &&
    typeof window.process === 'object' &&
    window.process.type === 'renderer'
  ) {
    return true;
  }

  return false;
}

/**
 * Open URL in default browser.
 *
 * In Electron: Uses shell.openExternal() to open in system browser.
 * In web: Uses window.open() with _blank target.
 *
 * @param url - The URL to open
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (!url) {
    console.warn('[Browser] No URL provided to openExternalUrl');
    return;
  }

  // Try Electron's shell API first
  if (typeof window !== 'undefined' && window.electron?.shell?.openExternal) {
    try {
      await window.electron.shell.openExternal(url);
      console.log('[Browser] Opened URL via Electron shell:', url);
      return;
    } catch (error) {
      console.error('[Browser] Electron shell.openExternal failed:', error);
      // Fall through to web fallback
    }
  }

  // Web fallback
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
    console.log('[Browser] Opened URL via window.open:', url);
    return;
  }

  console.error('[Browser] Cannot open URL: no window available');
}

/**
 * Copy text to clipboard.
 *
 * @param text - The text to copy
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    const success = document.execCommand('copy');
    document.body.removeChild(textArea);
    return success;
  } catch (error) {
    console.error('[Browser] Failed to copy to clipboard:', error);
    return false;
  }
}

/**
 * Type declarations for Electron's exposed API.
 * These are defined in the preload script.
 */
declare global {
  interface Window {
    electron?: {
      shell?: {
        openExternal: (url: string) => Promise<void>;
      };
      ipc?: {
        invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
        on: (channel: string, callback: (...args: unknown[]) => void) => void;
        removeListener: (channel: string, callback: (...args: unknown[]) => void) => void;
      };
    };
    process?: {
      type?: string;
    };
  }
}