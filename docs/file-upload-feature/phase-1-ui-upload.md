# Phase 1: UI & Upload Flow

## Overview

This phase covers the frontend UI components for file attachment in the chat input area. Users can select files via a native file picker, see previews, and remove attachments before sending.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        ChatInput.tsx                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ textarea (message input)                                   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ AttachmentPreviewArea                                      │ │
│  │ ├── FilePreviewChip (image: [thumbnail] filename.pdf)     │ │
│  │ ├── FilePreviewChip (doc:   [📄] document.pdf)            │ │
│  │ └── FilePreviewChip (code:  [💻] script.ts)               │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  [📎] | [Provider v] [Model v]                    [Send/Stop]  │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### AttachmentButton

Button that triggers the native file picker dialog.

```typescript
// apps/web/src/components/chat/AttachmentButton.tsx

interface AttachmentButtonProps {
  onSelectFiles: (files: File[]) => void;
  disabled?: boolean;
  isStreaming: boolean;
}

export function AttachmentButton({ onSelectFiles, disabled, isStreaming }: AttachmentButtonProps): JSX.Element;
```

**Behavior:**
- Renders a Paperclip icon button
- On click, calls `window.electronAPI.selectFiles()` to open native file picker
- Supports multi-selection
- Disabled when `isStreaming` is true
- Shows tooltip "Attach files" on hover

### FilePreviewChip

Displays a single attached file with preview (for images) or icon (for other files).

```typescript
// apps/web/src/components/chat/FilePreviewChip.tsx

interface PendingAttachment {
  id: string;           // Local temporary ID
  file: File;           // Native File object
  preview?: string;     // Data URL for image preview
  error?: string;       // Validation error if any
}

interface FilePreviewChipProps {
  attachment: PendingAttachment;
  onRemove: (id: string) => void;
}

export function FilePreviewChip({ attachment, onRemove }: FilePreviewChipProps): JSX.Element;
```

**Behavior:**
- For images: shows 48px height thumbnail with aspect ratio preserved
- For other files: shows file type icon (use `file-extension` or custom mapping)
- Shows filename and size (formatted: "245 KB", "2.3 MB")
- Has remove (X) button on hover
- Shows error state if validation failed

### AttachmentPreviewArea

Container for all file preview chips.

```typescript
// apps/web/src/components/chat/AttachmentPreviewArea.tsx

import type { PendingAttachment } from './FilePreviewChip';

interface AttachmentPreviewAreaProps {
  attachments: PendingAttachment[];
  onRemoveAttachment: (id: string) => void;
}

export function AttachmentPreviewArea({ 
  attachments, 
  onRemoveAttachment 
}: AttachmentPreviewAreaProps): JSX.Element | null;
```

**Behavior:**
- Returns `null` if `attachments` is empty
- Renders horizontal flex container with wrapping for chips
- Each chip is removable

### ChatInput (Modified)

Add attachment state and handlers to existing component.

```typescript
// apps/web/src/components/chat/ChatInput.tsx

interface ChatInputProps {
  // ... existing props ...
  
  // NEW: Attachment props
  attachments: PendingAttachment[];
  onAttachmentsChange: (attachments: PendingAttachment[]) => void;
}

// New internal hook for attachment management
function useAttachments() {
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  
  const addFiles = useCallback((files: File[]) => { /* ... */ }, []);
  const removeFile = useCallback((id: string) => { /* ... */ }, []);
  const clearFiles = useCallback(() => { /* ... */ }, []);
  
  return { attachments, addFiles, removeFile, clearFiles };
}
```

## Data Flow

### File Selection Flow

```
1. User clicks AttachmentButton (Paperclip icon)
2. AttachmentButton → window.electronAPI.selectFiles()
3. Electron main process → dialog.showOpenDialog({ 
     properties: ['multiSelections', 'openFile'],
     filters: [{ name: 'All Files', extensions: ['*'] }]
   })
4. User selects files in native dialog
5. Electron returns file paths to renderer
6. Renderer creates File objects from paths
7. For each file:
   a. Validate size (< 50MB)
   b. Generate local ID
   c. If image: create data URL preview
   d. Add to attachments state
8. AttachmentPreviewArea re-renders with files
```

### File Validation Flow

```typescript
// apps/web/src/lib/file-validation.ts

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const WARNING_SIZE = 100 * 1024 * 1024; // 100MB total
const MAX_FILES_WARNING = 10;

interface ValidationResult {
  valid: boolean;
  error?: string;
  warning?: string;
}

export function validateFile(file: File): ValidationResult {
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File "${file.name}" exceeds 50MB limit (${formatFileSize(file.size)})`
    };
  }
  return { valid: true };
}

export function validateAttachments(attachments: PendingAttachment[]): ValidationResult {
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
```

## Electron IPC Changes

### preload.ts Additions

```typescript
// electron/src/preload.ts

interface SelectFilesResult {
  success: boolean;
  files?: Array<{
    path: string;
    name: string;
    size: number;
    type: string;
  }>;
  error?: string;
}

contextBridge.exposeInMainWorld('electronAPI', {
  // ... existing methods ...
  
  // NEW: File selection
  selectFiles: async (): Promise<SelectFilesResult> => {
    return await ipcRenderer.invoke('select-files');
  },
  
  // NEW: Read file as data URL (for preview)
  readFileAsDataUrl: async (filePath: string): Promise<string> => {
    return await ipcRenderer.invoke('read-file-data-url', filePath);
  },
});
```

### main.ts Additions

```typescript
// electron/src/main.ts

import { dialog } from 'electron';

// File selection handler
ipcMain.handle('select-files', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['multiSelections', 'openFile'],
    filters: [
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  
  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, files: [] };
  }
  
  const files = result.filePaths.map(filePath => {
    const stats = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    return {
      path: filePath,
      name: path.basename(filePath),
      size: stats.size,
      type: getMimeType(ext)
    };
  });
  
  return { success: true, files };
});

// Read file as data URL (for image previews)
ipcMain.handle('read-file-data-url', async (_event, filePath: string) => {
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = getMimeType(ext);
  const base64 = buffer.toString('base64');
  return `data:${mimeType};base64,${base64}`;
});

// Helper: Get MIME type from extension
function getMimeType(ext: string): string {
  const mimeTypes: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.ts': 'text/typescript',
    '.tsx': 'text/typescript-jsx',
    '.js': 'text/javascript',
    '.jsx': 'text/javascript-jsx',
    '.py': 'text/x-python',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}
```

## File Structure

```
apps/web/src/
├── components/chat/
│   ├── ChatInput.tsx           # [Modify] Add attachment props
│   ├── AttachmentButton.tsx    # [Create] File picker trigger
│   ├── FilePreviewChip.tsx     # [Create] Single file preview
│   └── AttachmentPreviewArea.tsx # [Create] Container for chips
├── hooks/
│   └── useAttachments.ts       # [Create] Attachment state management
├── lib/
│   ├── file-validation.ts      # [Create] Size/type validation
│   └── file-utils.ts           # [Create] Format helpers
└── types/
    └── electron.d.ts           # [Modify] Add selectFiles to window.electronAPI

electron/src/
├── main.ts                     # [Modify] Add IPC handlers
└── preload.ts                  # [Modify] Expose file APIs
```

## Error Handling

| Error | Detection | Handling |
|-------|-----------|----------|
| File too large (>50MB) | Client-side validation | Show error toast, reject file |
| Read permission denied | IPC handler error | Show error toast "Could not read file" |
| Dialog cancelled | `result.canceled` | No-op, no changes to state |
| Invalid file type | MIME type check | Allow with warning in chip |
| Preview load failure | Image onError | Show fallback icon |

## Testing Strategy

### Unit Tests

- `file-validation.ts`: Test size limits, warning thresholds
- `useAttachments`: Test add/remove/clear operations

### Property-Based Tests

```typescript
// Property: For any file selection that returns N files,
// the attachment state contains exactly N items
fc.assert(fc.property(
  fc.array(fc.record({
    path: fc.string(),
    name: fc.string(),
    size: fc.nat(50_000_000), // Max 50MB
    type: fc.string()
  })),
  (files) => {
    const { attachments } = addFiles(files);
    return attachments.length === files.length;
  }
));
```

### Integration Tests

- Click attachment button → dialog opens → select files → chips appear
- Remove chip → attachment removed from state
- Send message → attachments included in request