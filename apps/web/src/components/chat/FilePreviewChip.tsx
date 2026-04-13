/**
 * FilePreviewChip - Displays a single attached file or folder path
 *
 * Simplified to show path info only (no previews, no file reading).
 */

import {
  X,
  FileText,
  Image as ImageIcon,
  FileCode,
  File,
  Folder,
} from "lucide-react";
import type { PendingAttachment } from "@/hooks/useAttachments";

interface FilePreviewChipProps {
  attachment: PendingAttachment;
  onRemove: (id: string) => void;
}

/**
 * Format file size for display
 */
function formatSize(bytes: number): string {
  if (bytes === 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Get file icon based on extension
 */
function getFileIcon(filename: string, isDirectory: boolean) {
  if (isDirectory) {
    return <Folder className="w-4 h-4 text-blue-500" />;
  }

  const ext = filename.toLowerCase().split(".").pop() || "";

  // Code files
  if (
    [
      "ts",
      "tsx",
      "js",
      "jsx",
      "py",
      "go",
      "rs",
      "java",
      "kt",
      "swift",
      "c",
      "cpp",
      "h",
    ].includes(ext)
  ) {
    return <FileCode className="w-4 h-4 text-blue-500" />;
  }

  // Image files
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(ext)) {
    return <ImageIcon className="w-4 h-4 text-green-500" />;
  }

  // Text files
  if (["txt", "md", "json", "csv", "xml", "yaml", "yml"].includes(ext)) {
    return <FileText className="w-4 h-4 text-orange-500" />;
  }

  // Default
  return <File className="w-4 h-4 text-zinc-400" />;
}

export function FilePreviewChip({
  attachment,
  onRemove,
}: FilePreviewChipProps) {
  return (
    <div className="group relative flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-200 bg-white">
      {/* Icon */}
      <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
        {getFileIcon(attachment.name, attachment.isDirectory)}
      </div>

      {/* Path info */}
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-medium truncate text-zinc-700">
          {attachment.name}
        </span>
        {!attachment.isDirectory && attachment.size > 0 && (
          <span className="text-xs text-zinc-400">
            {formatSize(attachment.size)}
          </span>
        )}
        {attachment.isDirectory && (
          <span className="text-xs text-zinc-400">Folder</span>
        )}
      </div>

      {/* Remove button */}
      <button
        type="button"
        onClick={() => onRemove(attachment.id)}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-zinc-100 transition-opacity"
        title="Remove"
      >
        <X className="w-4 h-4 text-zinc-400 hover:text-zinc-600" />
      </button>
    </div>
  );
}
