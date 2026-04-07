/**
 * AttachmentDisplay - Single attachment preview with click-to-open behavior
 */

import { memo, useCallback, useState, useEffect } from 'react';
import { FileText, Image as ImageIcon, FileCode, File, ExternalLink } from 'lucide-react';
import type { Attachment } from '@normie/types';
import { formatFileSize, isImageFile } from '@/lib/file-validation';

interface AttachmentDisplayProps {
  attachment: Attachment;
}

/**
 * Get file icon based on extension
 */
function getFileIcon(filename: string) {
  const ext = filename.toLowerCase().split('.').pop() || '';
  
  // Code files
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'cpp', 'h'].includes(ext)) {
    return <FileCode className="w-5 h-5 text-blue-500" />;
  }
  
  // Image files
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) {
    return <ImageIcon className="w-5 h-5 text-green-500" />;
  }
  
  // Text files
  if (['txt', 'md', 'json', 'csv', 'xml', 'yaml', 'yml'].includes(ext)) {
    return <FileText className="w-5 h-5 text-orange-500" />;
  }
  
  // PDF
  if (ext === 'pdf') {
    return <FileText className="w-5 h-5 text-red-500" />;
  }
  
  // Default
  return <File className="w-5 h-5 text-zinc-400" />;
}

export const AttachmentDisplay = memo(function AttachmentDisplay({ 
  attachment 
}: AttachmentDisplayProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const isImage = isImageFile(attachment.originalName);

  // Load image preview
  useEffect(() => {
    if (isImage && attachment.storagePath) {
      setIsLoading(true);
      window.electronAPI?.readAttachment(attachment.storagePath)
        .then((result) => {
          setImageUrl(result.data);
        })
        .catch((err) => {
          console.error('[AttachmentDisplay] Failed to load image:', err);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }
  }, [isImage, attachment.storagePath]);

  const handleClick = useCallback(() => {
    if (attachment.storagePath) {
      window.electronAPI?.openAttachment(attachment.storagePath);
    }
  }, [attachment.storagePath]);

  return (
    <button
      onClick={handleClick}
      className="group flex items-center gap-3 px-3 py-2 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors text-left"
      title={`Open ${attachment.originalName}`}
    >
      {/* Preview for images */}
      {isImage ? (
        <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0 bg-zinc-200 flex items-center justify-center">
          {isLoading ? (
            <ImageIcon className="w-5 h-5 text-zinc-400 animate-pulse" />
          ) : imageUrl ? (
            <img
              src={imageUrl}
              alt={attachment.originalName}
              className="w-full h-full object-cover"
            />
          ) : (
            <ImageIcon className="w-5 h-5 text-zinc-400" />
          )}
        </div>
      ) : (
        <div className="w-10 h-10 rounded flex items-center justify-center flex-shrink-0 bg-zinc-200">
          {getFileIcon(attachment.originalName)}
        </div>
      )}

      {/* File info */}
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-sm font-medium text-zinc-700 truncate">
          {attachment.originalName}
        </span>
        <span className="text-xs text-zinc-400">
          {formatFileSize(attachment.size)}
        </span>
      </div>

      {/* Open indicator */}
      <ExternalLink className="w-4 h-4 text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
    </button>
  );
});