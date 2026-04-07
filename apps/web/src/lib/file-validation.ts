/**
 * File validation utilities
 */

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const WARNING_SIZE = 100 * 1024 * 1024; // 100MB total
const MAX_FILES_WARNING = 10;

export interface ValidationResult {
  valid: boolean;
  error?: string;
  warning?: string;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Validate a single file
 */
export function validateFile(file: { name: string; size: number }): ValidationResult {
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File "${file.name}" exceeds 50MB limit (${formatFileSize(file.size)})`
    };
  }
  return { valid: true };
}

/**
 * Validate all attachments together (checks total size and count)
 */
export function validateAttachments(attachments: Array<{ file: { name: string; size: number } }>): ValidationResult {
  const totalSize = attachments.reduce((sum, a) => sum + a.file.size, 0);
  
  if (totalSize > WARNING_SIZE) {
    return {
      valid: true,
      warning: `Total size (${formatFileSize(totalSize)}) exceeds 100MB. Processing may be slow.`
    };
  }
  
  if (attachments.length > MAX_FILES_WARNING) {
    return {
      valid: true,
      warning: `${attachments.length} files attached. Consider reducing for better performance.`
    };
  }
  
  return { valid: true };
}

/**
 * Check if file is an image by extension
 */
export function isImageFile(filename: string): boolean {
  const ext = filename.toLowerCase().split('.').pop() || '';
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext);
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  return filename.toLowerCase().split('.').pop() || '';
}