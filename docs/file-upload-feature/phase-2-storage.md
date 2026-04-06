# Phase 2: Storage Layer

## Overview

This phase covers the persistent storage of attached files. Files are stored in the Electron app's userData directory, with metadata in PostgreSQL. This approach keeps the database lean while ensuring files survive app restarts.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FILE STORAGE FLOW                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Renderer (React)                                                   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ sendMessage(content, attachments)                            │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  Electron IPC                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ saveAttachments(chatId, files) → main.ts                    │   │
│  │   → fs.writeFile(userData/attachments/{chatId}/{id}-{name}) │   │
│  │   → return [{ storagePath, ...metadata }]                   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  Backend API                                                        │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ POST /api/chats/:chatId/stream                               │   │
│  │   → body.attachments: [{ storagePath, name, type, size }]   │   │
│  │   → INSERT INTO message_attachments                          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                      FILE RETRIEVAL FLOW                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Backend API                                                        │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ GET /api/chats/:chatId                                       │   │
│  │   → JOIN message_attachments                                 │   │
│  │   → return messages with .attachments[]                      │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                              ▼                                      │
│  Renderer (React)                                                   │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ MessageItem                                                  │   │
│  │   → attachments.map(a => <AttachmentDisplay storagePath />) │   │
│  │   → window.electronAPI.readAttachment(storagePath)           │   │
│  │   → display thumbnail or open file                           │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Database Schema

### New Table: message_attachments

```sql
CREATE TABLE message_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,          -- Generated unique filename
  original_name VARCHAR(255) NOT NULL,     -- User's original filename
  mime_type VARCHAR(100) NOT NULL,
  size INTEGER NOT NULL,                   -- Size in bytes
  storage_path TEXT NOT NULL,              -- Relative path from userData
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_message_attachments_message ON message_attachments(message_id);
```

### Drizzle Schema

```typescript
// apps/server/src/db/schema.ts

export const messageAttachments = pgTable('message_attachments', {
  id: uuid('id').primaryKey().defaultRandom(),
  messageId: uuid('message_id').notNull().references(() => messages.id, { onDelete: 'cascade' }),
  filename: varchar('filename', { length: 255 }).notNull(),
  originalName: varchar('original_name', { length: 255 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  size: integer('size').notNull(),
  storagePath: text('storage_path').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
}, (table) => [
  index('idx_message_attachments_message').on(table.messageId)
]);

export const messageAttachmentsRelations = relations(messageAttachments, ({ one }) => ({
  message: one(messages, {
    fields: [messageAttachments.messageId],
    references: [messages.id]
  })
}));
```

### Update Messages Relations

```typescript
// Add to existing messagesRelations
export const messagesRelations = relations(messages, ({ one, many }) => ({
  chat: one(chats, { /* ... */ }),
  attachments: many(messageAttachments)  // NEW
}));
```

## Storage Directory Structure

```
{userData}/
└── attachments/
    ├── {chatId-1}/
    │   ├── {uuid}-document.pdf
    │   ├── {uuid}-image.png
    │   └── {uuid}-script.ts
    ├── {chatId-2}/
    │   └── {uuid}-data.json
    └── ...
```

**Naming Convention**: `{uuid}-{originalName}`
- UUID prevents filename collisions
- Original name preserved for display
- Extension preserved for MIME type detection

## Electron IPC Handlers

### preload.ts Additions

```typescript
// electron/src/preload.ts

interface SaveAttachmentsResult {
  success: boolean;
  attachments?: Array<{
    filename: string;
    originalName: string;
    mimeType: string;
    size: number;
    storagePath: string;
  }>;
  error?: string;
}

interface AttachmentData {
  data: string;      // Base64 data URL
  mimeType: string;
}

contextBridge.exposeInMainWorld('electronAPI', {
  // ... existing ...
  
  // Save attachments to disk
  saveAttachments: async (
    chatId: string,
    files: Array<{ data: string; name: string; type: string; size: number }>
  ): Promise<SaveAttachmentsResult> => {
    return await ipcRenderer.invoke('save-attachments', chatId, files);
  },
  
  // Read attachment from disk (returns data URL)
  readAttachment: async (storagePath: string): Promise<AttachmentData> => {
    return await ipcRenderer.invoke('read-attachment', storagePath);
  },
  
  // Delete all attachments for a chat
  deleteChatAttachments: async (chatId: string): Promise<void> => {
    return await ipcRenderer.invoke('delete-chat-attachments', chatId);
  },
  
  // Open attachment with system default app
  openAttachment: async (storagePath: string): Promise<void> => {
    return await ipcRenderer.invoke('open-attachment', storagePath);
  }
});
```

### main.ts Additions

```typescript
// electron/src/main.ts

import { app, ipcMain, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Get attachments directory path
function getAttachmentsDir(): string {
  return path.join(app.getPath('userData'), 'attachments');
}

// Ensure directory exists
function ensureAttachmentsDir(chatId: string): string {
  const dir = path.join(getAttachmentsDir(), chatId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// Save attachments handler
ipcMain.handle('save-attachments', async (_event, chatId: string, files: Array<{
  data: string;
  name: string;
  type: string;
  size: number
}>) => {
  try {
    const attachmentsDir = ensureAttachmentsDir(chatId);
    const savedAttachments: Array<{
      filename: string;
      originalName: string;
      mimeType: string;
      size: number;
      storagePath: string;
    }> = [];
    
    for (const file of files) {
      // Generate unique filename
      const ext = path.extname(file.name);
      const uuid = uuidv4();
      const filename = `${uuid}${ext}`;
      const filePath = path.join(attachmentsDir, filename);
      
      // Extract base64 data from data URL
      const matches = file.data.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        console.warn(`Invalid data URL for file: ${file.name}`);
        continue;
      }
      
      const mimeType = matches[1];
      const base64Data = matches[2];
      const buffer = Buffer.from(base64Data, 'base64');
      
      // Write file
      fs.writeFileSync(filePath, buffer);
      
      // Create storage path (relative to attachments dir)
      const storagePath = path.join(chatId, filename);
      
      savedAttachments.push({
        filename,
        originalName: file.name,
        mimeType: mimeType,
        size: file.size,
        storagePath
      });
    }
    
    return { success: true, attachments: savedAttachments };
  } catch (error) {
    console.error('[SAVE-ATTACHMENTS] Error:', error);
    return { success: false, error: (error as Error).message };
  }
});

// Read attachment handler
ipcMain.handle('read-attachment', async (_event, storagePath: string) => {
  try {
    const fullPath = path.join(getAttachmentsDir(), storagePath);
    const buffer = fs.readFileSync(fullPath);
    const ext = path.extname(fullPath).toLowerCase();
    const mimeType = getMimeType(ext);
    const base64 = buffer.toString('base64');
    
    return {
      data: `data:${mimeType};base64,${base64}`,
      mimeType
    };
  } catch (error) {
    console.error('[READ-ATTACHMENT] Error:', error);
    throw error;
  }
});

// Delete chat attachments handler
ipcMain.handle('delete-chat-attachments', async (_event, chatId: string) => {
  try {
    const chatDir = path.join(getAttachmentsDir(), chatId);
    if (fs.existsSync(chatDir)) {
      fs.rmSync(chatDir, { recursive: true, force: true });
    }
  } catch (error) {
    console.error('[DELETE-ATTACHMENTS] Error:', error);
    // Don't throw - best effort cleanup
  }
});

// Open attachment with system app
ipcMain.handle('open-attachment', async (_event, storagePath: string) => {
  try {
    const fullPath = path.join(getAttachmentsDir(), storagePath);
    await shell.openPath(fullPath);
  } catch (error) {
    console.error('[OPEN-ATTACHMENT] Error:', error);
  }
});
```

## Backend Service

### file.service.ts

```typescript
// apps/server/src/services/file.service.ts

import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema.js';

export interface SavedAttachment {
  id: string;
  messageId: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  storagePath: string;
}

export interface AttachmentInput {
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  storagePath: string;
}

/**
 * Save attachment metadata to database
 */
export async function saveAttachmentMetadata(
  db: NodePgDatabase<typeof schema>,
  messageId: string,
  attachment: AttachmentInput
): Promise<SavedAttachment> {
  const [saved] = await db.insert(schema.messageAttachments)
    .values({
      messageId,
      ...attachment
    })
    .returning();
  
  return saved;
}

/**
 * Get all attachments for a message
 */
export async function getMessageAttachments(
  db: NodePgDatabase<typeof schema>,
  messageId: string
): Promise<SavedAttachment[]> {
  return db.select()
    .from(schema.messageAttachments)
    .where(eq(schema.messageAttachments.messageId, messageId));
}

/**
 * Get all attachments for a chat
 */
export async function getChatAttachments(
  db: NodePgDatabase<typeof schema>,
  chatId: string
): Promise<SavedAttachment[]> {
  const result = await db
    .select({
      id: schema.messageAttachments.id,
      messageId: schema.messageAttachments.messageId,
      filename: schema.messageAttachments.filename,
      originalName: schema.messageAttachments.originalName,
      mimeType: schema.messageAttachments.mimeType,
      size: schema.messageAttachments.size,
      storagePath: schema.messageAttachments.storagePath,
      createdAt: schema.messageAttachments.createdAt
    })
    .from(schema.messageAttachments)
    .innerJoin(
      schema.messages,
      eq(schema.messageAttachments.messageId, schema.messages.id)
    )
    .where(eq(schema.messages.chatId, chatId));
  
  return result;
}

/**
 * Delete attachments for a message
 */
export async function deleteMessageAttachments(
  db: NodePgDatabase<typeof schema>,
  messageId: string
): Promise<void> {
  await db.delete(schema.messageAttachments)
    .where(eq(schema.messageAttachments.messageId, messageId));
}
```

### Update chat.service.ts

```typescript
// apps/server/src/services/chat.service.ts

// Add to message fetching logic
import { getMessageAttachments } from './file.service.js';

export async function getChatWithMessages(
  db: DbClient,
  chatId: string
): Promise<{ chat: Chat; messages: Message[] }> {
  // ... existing logic ...
  
  // Fetch attachments for each message
  const messagesWithAttachments = await Promise.all(
    messages.map(async (msg) => {
      const attachments = await getMessageAttachments(db, msg.id);
      return { ...msg, attachments };
    })
  );
  
  return { chat, messages: messagesWithAttachments };
}
```

## API Endpoint Changes

### POST /api/chats/:chatId/stream

```typescript
// apps/server/src/routes/chats.ts

// Request body now includes attachments
interface StreamRequestBody {
  message: string;
  provider: string;
  model: string;
  workspaceId: string;
  attachments?: Array<{
    filename: string;
    originalName: string;
    mimeType: string;
    size: number;
    storagePath: string;
  }>;
}

// In stream handler
router.post('/:chatId/stream', asyncHandler(async (req: Request, res: Response) => {
  const { message, provider, model, workspaceId, attachments } = req.body;
  
  // ... validation ...
  
  await streamChatWithRequest(getDb(), {
    chatId,
    message,
    provider,
    model,
    workspaceId,
    userId: req.userId!,
    attachments  // NEW: Pass attachments to stream service
  }, req, res);
}));
```

## File Structure

```
apps/web/src/
├── lib/api/
│   └── chat.ts                 # [Modify] Include attachments in send
├── hooks/
│   └── useChatStream.ts        # [Modify] Handle attachment saving
└── types/
    └── electron.d.ts           # [Modify] Add attachment IPC types

apps/server/src/
├── db/
│   └── schema.ts               # [Modify] Add messageAttachments table
├── services/
│   ├── file.service.ts         # [Create] File metadata operations
│   ├── chat.service.ts         # [Modify] Include attachments in messages
│   └── chat-stream.service.ts  # [Modify] Process attachments
└── routes/
    └── chats.ts                # [Modify] Accept attachments in stream

electron/src/
├── main.ts                     # [Modify] Add attachment IPC handlers
└── preload.ts                  # [Modify] Expose attachment APIs
```

## Error Handling

| Error | Detection | Handling |
|-------|-----------|----------|
| Disk write failed | `fs.writeFileSync` throws | Return error to frontend, show toast |
| Directory not writable | `mkdirSync` throws | Show error "Cannot save attachments" |
| File not found on read | `fs.readFileSync` throws | Show placeholder in UI |
| Database insert failed | Drizzle throws | Delete orphaned file, show error |
| Storage path traversal | Path validation | Reject request (security) |

## Testing Strategy

### Unit Tests

- `file.service.ts`: CRUD operations for attachment metadata
- Path validation: Ensure no directory traversal attacks

### Integration Tests

- Save attachment via IPC → verify file on disk
- Save attachment → verify metadata in database
- Delete chat → verify files removed from disk

### Property-Based Tests

```typescript
// Property: For any saved attachment, reading it returns the same bytes
fc.assert(fc.property(
  fc.uint8Array({ minLength: 1, maxLength: 10000 }),
  async (originalBytes) => {
    const saved = await saveAttachment(chatId, originalBytes);
    const read = await readAttachment(saved.storagePath);
    return Buffer.compare(originalBytes, read) === 0;
  }
));
```