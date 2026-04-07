/**
 * AttachmentButton - Button that triggers file/folder picker dialog
 *
 * Simplified - no file reading, just path selection.
 */

import { Paperclip } from "lucide-react";
import { useCallback } from "react";

interface AttachmentButtonProps {
  onSelectPaths: (
    paths: Array<{
      path: string;
      name: string;
      isDirectory: boolean;
      size: number;
    }>,
  ) => void;
  disabled?: boolean;
  isStreaming: boolean;
}

export function AttachmentButton({
  onSelectPaths,
  disabled,
  isStreaming,
}: AttachmentButtonProps) {
  const handleClick = useCallback(async () => {
    if (isStreaming || disabled) return;

    try {
      // Call Electron API to open path picker (files or folders)
      const result = await window.electronAPI?.selectPaths();

      if (!result?.success || !result.paths?.length) {
        return;
      }

      // No file reading! Just pass paths directly
      onSelectPaths(result.paths);
    } catch (error) {
      console.error("[AttachmentButton] Error selecting paths:", error);
    }
  }, [isStreaming, disabled, onSelectPaths]);

  const isDisabled = isStreaming || disabled;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isDisabled}
      title="Attach files or folders"
      className="w-8 h-8 rounded-full bg-white border border-zinc-200 flex items-center justify-center hover:bg-zinc-50 transition-colors text-zinc-500 hover:text-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Paperclip className="w-4 h-4" strokeWidth={1.5} />
    </button>
  );
}
