# Phase 4: Message Display

## Overview

This phase covers how attachments are displayed in the chat message history. Users should see their uploaded files in the conversation, with clickable images and file metadata.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     MESSAGE WITH ATTACHMENTS                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  MessageItem.tsx                                                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ [User Avatar]                                                │   │
│  │                                                              │   │
│  │ ┌─────────────────────────────────────────────────────────┐ │   │
│  │ │ AttachmentGrid                                           │ │   │
│  │ │ ┌───────────┐ ┌───────────┐ ┌───────────────────────────┐│ │   │
│  │ │ │ [Image]   │ │ [Image]   │ │ 📄 document.pdf (245 KB) ││ │   │
│  │ │ │ preview   │ │ preview   │ │ click to open            ││ │   │
│  │ │ └───────────┘ └───────────┘ └───────────────────────────┘│ │   │
│  │ └─────────────────────────────────────────────────────────┘ │   │
│  │                                                              │   │
│  │ "Here are the files I mentioned..."                         │   │
│  │                                                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### AttachmentDisplay

Single attachment preview with click-to-open behavior.

```typescript
// apps/web/src/components/chat/AttachmentDisplay.tsx

import { FileText, Image, FileCode, File } from 'lucide-react';

interface Attachment {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  storagePath: string;
}

interface AttachmentDisplayProps {
  attachment: Attachment;
  onOpen: (attachment: Attachment) => void;
}

export function AttachmentDisplay({ attachment, onOpen }: AttachmentDisplayProps): JSX.Element;
```

**Behavior:**
- Images: Show thumbnail preview (lazy-loaded from disk)
- Other files: Show file type icon + name + size
- Clickable to open with system default app
- Hover state shows "Click to open" tooltip

### AttachmentGrid

Container for multiple attachments in a message.

```typescript
// apps/web/src/components/chat/AttachmentGrid.tsx

import type { Attachment } from './AttachmentDisplay';

interface AttachmentGridProps {
  attachments: Attachment[];
  onOpenAttachment: (attachment: Attachment) => void;
}

export function AttachmentGrid({ 
  attachments, 
  onOpenAttachment 
}: AttachmentGridProps): JSX.Element | null;
```

**Behavior:**
- Returns `null` if no attachments
- Grid layout with wrapping for multiple files
- Images get larger preview cells
- Non-images get compact cells with icon

### MessageItem Updates

Add attachment rendering to existing component.

```typescript
// apps/web/src/components/chat/MessageItem.tsx

import { AttachmentGrid } from './AttachmentGrid';

interface MessageItemProps {
  message: Message;
  // ... existing props
}

// In render:
{message.attachments?.length > 0 && (
  <AttachmentGrid 
    attachments={message.attachments}
    onOpenAttachment={handleOpenAttachment}
  />
)}

// Handler for opening attachments
const handleOpenAttachment = useCallback(async (attachment: Attachment) => {
  await window.electronAPI?.openAttachment(attachment.storagePath);
}, []);
```

### Image Preview Modal (Optional Enhancement)

Full-size image viewer when clicking an image attachment.

```typescript
// apps/web/src/components/chat/ImagePreviewModal.tsx

interface ImagePreviewModalProps {
  isOpen: boolean;
  imageUrl: string;
  imageName: string;
  onClose: () => void;
}

export function ImagePreviewModal({ 
  isOpen, 
  imageUrl, 
  imageName, 
  onClose 
}: ImagePreviewModalProps): JSX.Element | null;
```

**Behavior:**
- Full-screen overlay with dark background
- Centered image with max dimensions
- Close button and ESC key to dismiss
- Click outside to close

## Types Updates

### Message Type

```typescript
// packages/types/src/index.ts

export interface Attachment {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  storagePath: string;
  createdAt?: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  html?: string;
  toolCalls?: ToolCall[];
  reasoning?: string;
  inlineToolCalls?: InlineToolCall[];
  attachments?: Attachment[];  // NEW
}
```

### Electron API Types

```typescript
// apps/web/src/types/electron.d.ts

interface ElectronAPI {
  // ... existing methods ...
  
  // File attachment methods
  openAttachment: (storagePath: string) => Promise<void>;
  readAttachment: (storagePath: string) => Promise<{ data: string; mimeType: string }>;
}

interface AuthAPI {
  // ... existing methods ...
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
    authAPI?: AuthAPI;
  }
}
```

## Visual Design

### Grid Layout

```css
/* AttachmentGrid.module.css */

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
  margin-bottom: 8px;
}

/* For messages with both images and files */
.gridMixed {
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
}

/* Image cells are larger */
.imageCell {
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  background: #f4f4f5;
}

/* File cells are compact */
.fileCell {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 8px;
  background: #f4f4f5;
  cursor: pointer;
}
```

### Image Attachment

```
┌────────────────────┐
│                    │
│   [Image Preview]  │
│                    │
│                    │
└────────────────────┘
       ↓ hover
┌────────────────────┐
│ ┌----------------┐ │
│ │                │ │
│ │   [Darker]     │ │
│ │                │ │
│ └----------------┘ │
│  Click to open     │
└────────────────────┘
```

### File Attachment

```
┌───────────────────────────────┐
│ 📄 document.pdf               │
│ 245 KB • Click to open        │
└───────────────────────────────┘
```

## File Structure

```
apps/web/src/
├── components/chat/
│   ├── MessageItem.tsx         # [Modify] Add attachment rendering
│   ├── AttachmentDisplay.tsx   # [Create] Single attachment view
│   ├── AttachmentGrid.tsx      # [Create] Grid container
│   └── ImagePreviewModal.tsx   # [Create] Optional full-size viewer
├── hooks/
│   └── useAttachmentLoader.ts  # [Create] Load attachments from disk
└── types/
    └── electron.d.ts           # [Modify] Add attachment types

packages/types/src/
└── index.ts                    # [Modify] Add Attachment to Message
```

## Error Handling

| Error | Detection | Handling |
|-------|-----------|----------|
| File not found on disk | `openAttachment` throws | Show "File not found" message |
| Cannot open file type | System handler fails | Show "Cannot open this file type" |
| Image load failed | `<img>` onError | Show placeholder icon |
| Permission denied | IPC error | Show "Permission denied" message |

## Testing Strategy

### Unit Tests

- `AttachmentDisplay`: Renders image vs file correctly
- `AttachmentGrid`: Renders multiple attachments
- Format size function returns correct strings

### Integration Tests

- Message with attachments renders grid
- Click attachment triggers `openAttachment` IPC
- Image preview loads from storage path

### Visual Tests

- Screenshot tests for attachment grid layouts
- Image attachment with various aspect ratios
- Multi-file attachment display