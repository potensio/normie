# Phase 3: AI Integration

## Overview

This phase covers how attached files are processed and sent to AI models. Images go to vision-capable models as base64, text files are extracted and included in context, and binary files are handled gracefully.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      AI REQUEST BUILDING                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  chat-stream.service.ts                                             │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ buildStreamContext(workspaceId, chatId, message, attachments)│   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  file-processor.ts                                                  │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ For each attachment:                                         │   │
│  │   ├─ Image? → toVisionContent() → { type: "image", ... }    │   │
│  │   ├─ Text?  → toTextContent()  → { type: "text", ... }     │   │
│  │   └─ Binary? → toMetadataOnly() → skip / metadata string    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  Message Format for AI                                              │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ {                                                            │   │
│  │   role: "user",                                              │   │
│  │   content: [                                                 │   │
│  │     { type: "text", text: "Here's the file..." },           │   │
│  │     { type: "image", source: { ... base64 ... } },          │   │
│  │     { type: "text", text: "[File: document.pdf]\n..." }     │   │
│  │   ]                                                          │   │
│  │ }                                                            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### File Processor Service

```typescript
// apps/server/src/services/file-processor.ts

import fs from 'fs';
import path from 'path';
import type { SavedAttachment } from './file.service.js';

// Vision-capable model prefixes
const VISION_MODELS = [
  'claude-3', 'claude-3.5', 'claude-opus-4', 'claude-sonnet-4',
  'gpt-4o', 'gpt-4-turbo', 'gpt-4-vision',
  'gemini-1.5', 'gemini-2',
  'llama-3.2-11b-vision', 'llama-3.2-90b-vision'
];

// Text extractable extensions
const TEXT_EXTENSIONS = [
  '.txt', '.md', '.markdown', '.json', '.csv', '.xml', '.yaml', '.yml',
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.pyw', '.go', '.rs', '.java', '.kt', '.swift',
  '.c', '.cpp', '.cc', '.h', '.hpp', '.cs',
  '.rb', '.php', '.sh', '.bash', '.zsh',
  '.sql', '.prisma', '.graphql', '.proto',
  '.html', '.css', '.scss', '.sass', '.less',
  '.dockerfile', '.makefile', '.cmake'
];

// Image extensions
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];

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
  return VISION_MODELS.some(vm => normalizedModel.includes(vm));
}

/**
 * Check if file is an image by extension
 */
export function isImageFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return IMAGE_EXTENSIONS.includes(ext);
}

/**
 * Check if file is text-extractable by extension
 */
export function isTextFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return TEXT_EXTENSIONS.includes(ext);
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
      }
    } else {
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
    return {
      type: 'text',
      text: `[Image "${attachment.originalName}" could not be loaded]`
    };
  }
}

/**
 * Process text attachment to text content
 */
async function processTextAttachment(
  attachment: SavedAttachment,
  attachmentsDir: string
): Promise<ProcessedContent> {
  const MAX_SIZE = 100 * 1024; // 100KB
  
  try {
    const filePath = path.join(attachmentsDir, attachment.storagePath);
    let content = fs.readFileSync(filePath, 'utf-8');
    
    // Truncate if too large
    if (Buffer.byteLength(content, 'utf-8') > MAX_SIZE) {
      content = content.substring(0, MAX_SIZE);
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
```

### Context Builder Updates

```typescript
// apps/server/src/services/context-builder.ts

import { processAttachment, isVisionModel } from './file-processor.js';
import type { SavedAttachment } from './file.service.js';

interface BuildContextOptions {
  maxMessages?: number;
  attachments?: SavedAttachment[];
  attachmentsDir?: string;
  model?: string;
}

export async function buildFullContext(
  workspaceId: string,
  chatId: string,
  currentMessage: string,
  db: DbClient,
  options: BuildContextOptions = {}
): Promise<{
  systemPrompt: string | null;
  messages: Array<{ role: string; content: string | Array<TextContent | ImageContent> }>;
}> {
  // ... existing context building logic ...
  
  // NEW: Process attachments if provided
  if (options.attachments?.length && options.attachmentsDir && options.model) {
    const processedAttachments = await Promise.all(
      options.attachments.map(a => 
        processAttachment(a, { 
          model: options.model!, 
          attachmentsDir: options.attachmentsDir! 
        })
      )
    );
    
    // Flatten all processed contents and warnings
    const allContents: ProcessedContent[] = [];
    const allWarnings: string[] = [];
    
    for (const result of processedAttachments) {
      allContents.push(...result.contents);
      allWarnings.push(...result.warnings);
    }
    
    // Build user message with attachments
    const userContent: Array<TextContent | ImageContent> = [
      { type: 'text', text: currentMessage }
    ];
    
    // Add all processed contents
    for (const content of allContents) {
      if (content.type === 'text') {
        userContent.push({ type: 'text', text: content.text! });
      } else if (content.type === 'image') {
        userContent.push({
          type: 'image',
          source: content.source
        });
      }
    }
    
    // Add warning messages if any
    if (allWarnings.length > 0) {
      messages.push({
        role: 'user',
        content: userContent
      });
      
      // System context about warnings (optional, could also be in system prompt)
      console.log('[CONTEXT] Processing warnings:', allWarnings);
    }
    
    return { systemPrompt, messages };
  }
  
  // ... existing return path for no attachments ...
}
```

### Stream Service Updates

```typescript
// apps/server/src/services/chat-stream.service.ts

// Add attachments to StreamParams
export interface StreamParams {
  chatId: string;
  message: string;
  provider: string;
  model: string;
  workspaceId: string;
  userId: string;
  attachments?: SavedAttachment[];  // NEW
}

// In streamChat function
export async function streamChat(
  db: DbClient,
  params: StreamParams,
  res: Response,
  signal?: AbortSignal
): Promise<void> {
  // ... existing setup ...
  
  // Get attachments directory
  const attachmentsDir = path.join(app.getPath('userData'), 'attachments');
  
  // Build context with attachments
  const { systemPrompt, messages } = await buildStreamContext(
    db,
    context.workspaceId,
    chatId,
    message,
    {
      attachments: params.attachments,
      attachmentsDir,
      model: params.model
    }
  );
  
  // ... continue with Pi Agent query ...
}
```

## Vision Model Support Matrix

| Provider | Model Pattern | Vision Support |
|----------|---------------|----------------|
| Anthropic | `claude-3-*`, `claude-3.5-*`, `claude-opus-4-*` | ✅ Yes |
| OpenAI | `gpt-4o*`, `gpt-4-turbo*`, `gpt-4-vision*` | ✅ Yes |
| Google | `gemini-1.5-*`, `gemini-2-*` | ✅ Yes |
| Groq | `llama-3.2-*-vision*` | ✅ Yes |
| OpenAI | `gpt-3.5-*` | ❌ No |
| Groq | `llama-3.1-*`, `mixtral-*` | ❌ No |
| Ollama | Depends on model | Check model capabilities |

## File Structure

```
apps/server/src/
├── services/
│   ├── file-processor.ts       # [Create] File processing for AI
│   ├── context-builder.ts      # [Modify] Include attachments
│   └── chat-stream.service.ts  # [Modify] Pass attachments to context
└── pi/
    └── index.ts                # [Modify] Handle multi-part content

packages/types/src/
└── index.ts                    # [Modify] Add ImageContent type
```

## Error Handling

| Error | Detection | Handling |
|-------|-----------|----------|
| Image read failed | `fs.readFileSync` throws | Return placeholder text |
| Text file read failed | `fs.readFileSync` throws | Return placeholder text |
| Non-vision model + image | `isVisionModel()` check | Add warning, include metadata only |
| File too large for context | Size check | Truncate with notice |

## Testing Strategy

### Unit Tests

- `isVisionModel()`: Test model string matching
- `processAttachment()`: Test each file type path
- `processTextAttachment()`: Test truncation logic

### Integration Tests

- Send message with image → verify base64 in AI request
- Send message with text file → verify content in context
- Send image with non-vision model → verify warning returned