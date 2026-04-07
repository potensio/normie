/**
 * File Processor - Process attachments for AI consumption
 */

import fs from 'fs';
import path from 'path';
import type { SavedAttachment } from './file.service.js';

// Vision-capable model patterns
const VISION_MODEL_PATTERNS = [
  'claude-3', 'claude-3.5', 'claude-opus-4', 'claude-sonnet-4',
  'gpt-4o', 'gpt-4-turbo', 'gpt-4-vision',
  'gemini-1.5', 'gemini-2',
  'llama-3.2-11b-vision', 'llama-3.2-90b-vision'
];

// Text extractable extensions
const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.json', '.csv', '.xml', '.yaml', '.yml',
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.pyw', '.go', '.rs', '.java', '.kt', '.swift',
  '.c', '.cpp', '.cc', '.h', '.hpp', '.cs',
  '.rb', '.php', '.sh', '.bash', '.zsh',
  '.sql', '.prisma', '.graphql', '.proto',
  '.html', '.css', '.scss', '.sass', '.less',
  '.dockerfile', '.makefile', '.cmake', '.toml', '.ini', '.env', '.gitignore'
]);

// Image extensions
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']);

// Max text file size (100KB)
const MAX_TEXT_SIZE = 100 * 1024;

export interface ProcessedContent {
  type: 'text' | 'image';
  text?: string;
  source?: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

export interface FileProcessingResult {
  contents: ProcessedContent[];
  warnings: string[];
}

/**
 * Check if a model supports vision
 */
export function isVisionModel(model: string): boolean {
  const normalizedModel = model.toLowerCase();
  return VISION_MODEL_PATTERNS.some(pattern => normalizedModel.includes(pattern));
}

/**
 * Check if file is an image by extension
 */
export function isImageFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

/**
 * Check if file is text-extractable by extension
 */
export function isTextFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return TEXT_EXTENSIONS.has(ext);
}

/**
 * Process a single attachment for AI consumption
 */
export async function processAttachment(
  attachment: SavedAttachment,
  options: { model: string; attachmentsDir: string }
): Promise<FileProcessingResult> {
  const { model, attachmentsDir } = options;
  const result: FileProcessingResult = { contents: [], warnings: [] };
  
  // Handle images
  if (isImageFile(attachment.originalName)) {
    if (isVisionModel(model)) {
      const content = await processImageAttachment(attachment, attachmentsDir);
      if (content) {
        result.contents.push(content);
      } else {
        result.contents.push({
          type: 'text',
          text: `[Image: ${attachment.originalName} (${formatSize(attachment.size)}) - could not be loaded]`
        });
      }
    } else {
      result.contents.push({
        type: 'text',
        text: `[Image: ${attachment.originalName} (${formatSize(attachment.size)}) - model does not support vision]`
      });
      result.warnings.push(
        `Image "${attachment.originalName}" not processed - model does not support vision`
      );
    }
    return result;
  }
  
  // Handle text files
  if (isTextFile(attachment.originalName)) {
    const content = await processTextAttachment(attachment, attachmentsDir);
    result.contents.push(content);
    return result;
  }
  
  // Handle binary files - metadata only
  result.contents.push({
    type: 'text',
    text: `[Attached file: ${attachment.originalName} (${formatSize(attachment.size)})]`
  });
  result.warnings.push(
    `Binary file "${attachment.originalName}" cannot be read as text`
  );
  
  return result;
}

/**
 * Process image attachment to vision content
 */
async function processImageAttachment(
  attachment: SavedAttachment,
  attachmentsDir: string
): Promise<ProcessedContent | null> {
  try {
    const filePath = path.join(attachmentsDir, attachment.storagePath);
    const buffer = fs.readFileSync(filePath);
    const base64 = buffer.toString('base64');
    
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: attachment.mimeType,
        data: base64
      }
    };
  } catch (error) {
    console.error('[FILE-PROCESSOR] Failed to read image:', error);
    return null;
  }
}

/**
 * Process text attachment to text content
 */
async function processTextAttachment(
  attachment: SavedAttachment,
  attachmentsDir: string
): Promise<ProcessedContent> {
  try {
    const filePath = path.join(attachmentsDir, attachment.storagePath);
    let content = fs.readFileSync(filePath, 'utf-8');
    
    // Truncate if too large
    if (Buffer.byteLength(content, 'utf-8') > MAX_TEXT_SIZE) {
      content = content.substring(0, MAX_TEXT_SIZE);
      content += '\n\n[File truncated - first 100KB shown]';
    }
    
    return {
      type: 'text',
      text: `[File: ${attachment.originalName}]\n\`\`\`\n${content}\n\`\`\``
    };
  } catch (error) {
    console.error('[FILE-PROCESSOR] Failed to read text file:', error);
    return {
      type: 'text',
      text: `[File "${attachment.originalName}" could not be read]`
    };
  }
}

/**
 * Format file size for display
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}