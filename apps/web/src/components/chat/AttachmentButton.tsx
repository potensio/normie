/**
 * AttachmentButton - Button that triggers file picker dialog
 */

import { Paperclip, Loader2 } from 'lucide-react';
import { useState, useCallback } from 'react';

interface AttachmentButtonProps {
  onSelectFiles: (files: Array<{ path: string; name: string; size: number; type: string; data: string }>) => Promise<void>;
  disabled?: boolean;
  isStreaming: boolean;
}

export function AttachmentButton({ onSelectFiles, disabled, isStreaming }: AttachmentButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = useCallback(async () => {
    if (isStreaming || disabled || isLoading) return;

    setIsLoading(true);
    try {
      // Call Electron API to open file picker
      const result = await window.electronAPI?.selectFiles();
      
      if (!result?.success || !result.files?.length) {
        return;
      }

      // Read each file as data URL
      const filesWithData = await Promise.all(
        result.files.map(async (file) => {
          const data = await window.electronAPI?.readFileAsDataUrl(file.path);
          return {
            path: file.path,
            name: file.name,
            size: file.size,
            type: file.type,
            data: data || '',
          };
        })
      );

      await onSelectFiles(filesWithData);
    } catch (error) {
      console.error('[AttachmentButton] Error selecting files:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isStreaming, disabled, isLoading, onSelectFiles]);

  const isDisabled = isStreaming || disabled || isLoading;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isDisabled}
      title="Attach files"
      className="w-8 h-8 rounded-full bg-white border border-zinc-200 flex items-center justify-center hover:bg-zinc-50 transition-colors text-zinc-500 hover:text-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
      ) : (
        <Paperclip className="w-4 h-4" strokeWidth={1.5} />
      )}
    </button>
  );
}