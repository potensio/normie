/**
 * FilePreviewChip - Displays a single attached file with preview or icon
 */

import { X, FileText, Image as ImageIcon, FileCode, File } from 'lucide-react';
import type { PendingAttachment } from '@/hooks/useAttachments';
import { formatFileSize, isImageFile } from '@/lib/file-validation';

interface FilePreviewChipProps {
  attachment: PendingAttachment;
  onRemove: (id: string) => void;
}

/**
 * Get file icon based on extension
 */
function getFileIcon(filename: string) {
  const ext = filename.toLowerCase().split('.').pop() || '';
  
  // Code files
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'cpp', 'h'].includes(ext)) {
    return <FileCode className="w-4 h-4 text-blue-500" />;
  }
  
  // Image files
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) {
    return <ImageIcon className="w-4 h-4 text-green-500" />;
  }
  
  // Text files
  if (['txt', 'md', 'json', 'csv', 'xml', 'yaml', 'yml'].includes(ext)) {
    return <FileText className="w-4 h-4 text-orange-500" />;
  }
  
  // Default
  return <File className="w-4 h-4 text-zinc-400" />;
}

export function FilePreviewChip({ attachment, onRemove }: FilePreviewChipProps) {
  const isImage = isImageFile(attachment.file.name);
  const hasError = !!attachment.error;

  return (
    <div
      className={`group relative flex items-center gap-2 px-3 py-2 rounded-lg border ${
        hasError 
          ? 'border-red-200 bg-red-50' 
          : 'border-zinc-200 bg-white'
      }`}
    >
      {/* Preview for images */}
      {isImage && attachment.preview ? (
        <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0 bg-zinc-100">
          <img
            src={attachment.preview}
            alt={attachment.file.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              // Fallback to icon if image fails to load
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      ) : (
        <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
          {getFileIcon(attachment.file.name)}
        </div>
      )}

      {/* File info */}
      <div className="flex flex-col min-w-0">
        <span className={`text-sm font-medium truncate ${hasError ? 'text-red-700' : 'text-zinc-700'}`}>
          {attachment.file.name}
        </span>
        <span className={`text-xs ${hasError ? 'text-red-500' : 'text-zinc-400'}`}>
          {hasError ? attachment.error : formatFileSize(attachment.file.size)}
        </span>
      </div>

      {/* Remove button */}
      <button
        type="button"
        onClick={() => onRemove(attachment.id)}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-zinc-100 transition-opacity"
        title="Remove file"
      >
        <X className="w-4 h-4 text-zinc-400 hover:text-zinc-600" />
      </button>
    </div>
  );
}