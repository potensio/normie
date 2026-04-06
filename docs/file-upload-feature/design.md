# File Upload Feature - Design Document

This document is split into multiple phase files for better organization:

- **[Phase 1: UI & Upload Flow](./phase-1-ui-upload.md)** - Frontend attachment UI, file picker, preview chips
- **[Phase 2: Storage Layer](./phase-2-storage.md)** - Local file storage, database schema, Electron IPC
- **[Phase 3: AI Integration](./phase-3-ai-integration.md)** - File processing, vision models, context building
- **[Phase 4: Message Display](./phase-4-message-display.md)** - Attachment rendering in chat history

## Overview

This design document outlines the architecture for implementing file upload functionality in the Electron-based chat application. Users will be able to attach multiple files to chat messages, which will be stored locally and processed by AI models.

### Key Architectural Decisions

1. **Local File Storage**: Files stored in Electron's `userData` directory, not in cloud
2. **Database Metadata**: File metadata (name, type, size, path) stored in PostgreSQL
3. **Vision Integration**: Images sent to vision-capable models as base64
4. **Text Extraction**: Text files extracted and included in AI context
5. **Attachment Lifecycle**: Files deleted when their parent chat is deleted

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                           FRONTEND (React)                          │
├─────────────────────────────────────────────────────────────────────┤
│  ChatInput.tsx                                                      │
│  ├── AttachmentButton (Paperclip)                                   │
│  ├── AttachmentPreview (chips with thumbnails)                      │
│  └── FilePreviewChip (image thumbnail / file icon)                  │
├─────────────────────────────────────────────────────────────────────┤
│  electronAPI (preload.ts)                                           │
│  ├── selectFiles() → IPC → main.ts dialog.showOpenDialog            │
│  ├── saveAttachment() → IPC → main.ts fs.writeFile                  │
│  └── readAttachment() → IPC → main.ts fs.readFile                   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        ELECTRON MAIN PROCESS                        │
├─────────────────────────────────────────────────────────────────────┤
│  main.ts                                                            │
│  ├── dialog.showOpenDialog({ multiSelections: true })               │
│  ├── fs.writeFile(userData/attachments/{chatId}/{filename})        │
│  ├── fs.readFile(userData/attachments/{chatId}/{filename})         │
│  └── fs.rm(userData/attachments/{chatId}, { recursive: true })     │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         BACKEND (Express)                           │
├─────────────────────────────────────────────────────────────────────┤
│  routes/chats.ts                                                    │
│  └── POST /:chatId/stream → chat-stream.service.ts                  │
├─────────────────────────────────────────────────────────────────────┤
│  services/file.service.ts (NEW)                                     │
│  ├── validateFile(file) → size, type checks                         │
│  ├── extractTextContent(file) → for text files                      │
│  └── processImage(file) → base64, dimensions                        │
├─────────────────────────────────────────────────────────────────────┤
│  services/context-builder.ts                                        │
│  └── buildFullContext() → now includes file content                 │
├─────────────────────────────────────────────────────────────────────┤
│  pi/index.ts (runPiQuery)                                           │
│  └── Messages now include image content blocks                      │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          DATABASE (PostgreSQL)                      │
├─────────────────────────────────────────────────────────────────────┤
│  message_attachments (NEW TABLE)                                    │
│  ├── id (uuid, PK)                                                  │
│  ├── messageId (uuid, FK → messages.id)                             │
│  ├── filename (varchar)                                             │
│  ├── originalName (varchar)                                         │
│  ├── mimeType (varchar)                                             │
│  ├── size (integer)                                                 │
│  ├── storagePath (text)                                             │
│  └── createdAt (timestamp)                                          │
└─────────────────────────────────────────────────────────────────────┘
```

## Correctness Properties

### Property 1: Attachment Count Invariant

_For any_ message M with N attached files stored in database, the attachment list displayed in UI SHALL contain exactly N items.

**Validates: Requirement 1.2, 1.3**

### Property 2: File-Cleanup Atomicity

_For any_ chat deletion operation, all associated files SHALL be deleted from disk IF AND ONLY IF the database transaction completes successfully.

**Validates: Requirement 3.4**

### Property 3: Image Encoding Correctness

_For any_ image file I sent to a vision-capable model, the base64 data URL SHALL be valid and decodable back to the original image bytes.

**Validates: Requirement 3.6**

### Property 4: Text Extraction Truncation

_For any_ text-extractable file F with content length L > 100KB, the extracted content included in AI context SHALL be exactly the first 100KB with a truncation notice appended.

**Validates: Requirement 6.2**

### Property 5: Size Validation Reject

_For any_ file F with size > 50MB, the system SHALL reject the file and display an error BEFORE any disk write occurs.

**Validates: Requirement 5.1**

### Traceability Matrix

| Property | Requirement(s) | Test Type |
|----------|----------------|-----------|
| Property 1: Attachment Count Invariant | Req 1.2, 1.3 | Property-based |
| Property 2: File-Cleanup Atomicity | Req 3.4 | Integration |
| Property 3: Image Encoding Correctness | Req 3.6 | Property-based |
| Property 4: Text Extraction Truncation | Req 6.2 | Unit |
| Property 5: Size Validation Reject | Req 5.1 | Unit |

## Non-Functional Requirements

### Storage Limits

| Metric | Limit | Behavior |
|--------|-------|----------|
| Max file size | 50 MB | Reject with error |
| Total attachments per message | 10 | Warning (allow proceed) |
| Total size per message | 100 MB | Warning (allow proceed) |
| App data directory quota | 1 GB | Log warning (background) |

### Supported File Types

| Category | Extensions | Processing |
|----------|------------|------------|
| Images | .png, .jpg, .jpeg, .gif, .webp, .bmp | Vision model input |
| Text | .txt, .md, .json, .csv, .xml | Extract to context |
| Code | .ts, .tsx, .js, .jsx, .py, .go, .rs, .java | Extract to context |
| Documents | .pdf, .docx | Text extraction (best effort) |
| Binary | * | Metadata only |

### Vision-Capable Models

Models that can process images:
- Anthropic: `claude-3-opus`, `claude-3-sonnet`, `claude-3-haiku`, `claude-3.5-sonnet`
- OpenAI: `gpt-4o`, `gpt-4-turbo`
- Google: `gemini-1.5-pro`, `gemini-1.5-flash`
- Groq: `llama-3.2-11b-vision-preview`