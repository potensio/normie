/**
 * useAttachments - Manage file attachments for chat messages
 */

import { useState, useCallback } from 'react';
import { generateId } from '@normie/utils';
import { validateFile } from '@/lib/file-validation';

export interface PendingAttachment {
  id: string; // Local temporary ID
  file: File; // Native File object
  preview?: string; // Data URL for image preview
  error?: string; // Validation error if any
}

interface UseAttachmentsReturn {
  attachments: PendingAttachment[];
  addFiles: (files: Array<{ path: string; name: string; size: number; type: string; data?: string }>) => Promise<void>;
  removeFile: (id: string) => void;
  clearFiles: () => void;
  hasFiles: boolean;
}

export function useAttachments(): UseAttachmentsReturn {
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);

  const addFiles = useCallback(async (files: Array<{ path: string; name: string; size: number; type: string; data?: string }>) => {
    const newAttachments: PendingAttachment[] = [];

    for (const fileData of files) {
      // Validate file size
      const validation = validateFile({ name: fileData.name, size: fileData.size });
      
      const attachment: PendingAttachment = {
        id: generateId(),
        file: new File([], fileData.name, { type: fileData.type }), // Placeholder File object
        error: validation.valid ? undefined : validation.error,
      };

      // Create preview for images if data is provided
      if (fileData.data && fileData.type.startsWith('image/')) {
        attachment.preview = fileData.data;
      }

      newAttachments.push(attachment);
    }

    setAttachments((prev) => [...prev, ...newAttachments]);
  }, []);

  const removeFile = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const clearFiles = useCallback(() => {
    setAttachments([]);
  }, []);

  return {
    attachments,
    addFiles,
    removeFile,
    clearFiles,
    hasFiles: attachments.length > 0,
  };
}