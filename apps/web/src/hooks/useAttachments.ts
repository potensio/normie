/**
 * useAttachments - Manage path attachments for chat messages
 *
 * Simplified to work with file/folder paths only (no file reading).
 * This is an Electron app - AI can read files directly from paths.
 */

import { useState, useCallback } from "react";
import { generateId } from "@normie/utils";

export interface PendingAttachment {
  id: string; // Local temporary ID
  path: string; // Absolute file or folder path
  name: string; // File or folder name
  isDirectory: boolean; // Whether this is a folder
  size: number; // File size (0 for directories)
}

interface UseAttachmentsReturn {
  attachments: PendingAttachment[];
  addPaths: (
    paths: Array<{
      path: string;
      name: string;
      isDirectory: boolean;
      size: number;
    }>,
  ) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  hasAttachments: boolean;
}

export function useAttachments(): UseAttachmentsReturn {
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);

  const addPaths = useCallback(
    (
      paths: Array<{
        path: string;
        name: string;
        isDirectory: boolean;
        size: number;
      }>,
    ) => {
      const newAttachments: PendingAttachment[] = paths.map((p) => ({
        id: generateId(),
        ...p,
      }));

      setAttachments((prev) => [...prev, ...newAttachments]);
    },
    [],
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments([]);
  }, []);

  return {
    attachments,
    addPaths,
    removeAttachment,
    clearAttachments,
    hasAttachments: attachments.length > 0,
  };
}
