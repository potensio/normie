# File Upload Feature - Implementation Tasks

This document is organized by phases. Complete tasks in order within each phase.

---

## Phase 1: UI & Upload Flow

### 1.1 Database Schema
- [x] Add `messageAttachments` table to `apps/server/src/db/schema.ts`
- [x] Add relation to `messages` for attachments
- [x] Run migration to create table

### 1.2 Types
- [x] Add `Attachment` interface to `packages/types/src/index.ts`
- [x] Update `Message` interface to include optional `attachments` field
- [x] Update `apps/web/src/types/electron.d.ts` with file IPC types

### 1.3 Electron IPC (main.ts)
- [x] Add `getAttachmentsDir()` helper function
- [x] Add `ensureAttachmentsDir(chatId)` helper function
- [x] Add `getMimeType(ext)` helper function
- [x] Implement `select-files` IPC handler
- [x] Implement `read-file-data-url` IPC handler
- [x] Implement `save-attachments` IPC handler
- [x] Implement `read-attachment` IPC handler
- [x] Implement `delete-chat-attachments` IPC handler
- [x] Implement `open-attachment` IPC handler

### 1.4 Electron Preload (preload.ts)
- [x] Expose `selectFiles()` method
- [x] Expose `readFileAsDataUrl()` method
- [x] Expose `saveAttachments()` method
- [x] Expose `readAttachment()` method
- [x] Expose `deleteChatAttachments()` method
- [x] Expose `openAttachment()` method

### 1.5 Frontend Utilities
- [x] Create `apps/web/src/lib/file-validation.ts`
- [x] Create formatFileSize helper

### 1.6 Frontend Hooks
- [x] Create `apps/web/src/hooks/useAttachments.ts`

### 1.7 Frontend Components
- [x] Create `apps/web/src/components/chat/AttachmentButton.tsx`
- [x] Create `apps/web/src/components/chat/FilePreviewChip.tsx`
- [x] Create `apps/web/src/components/chat/AttachmentPreviewArea.tsx`
- [x] Modify `apps/web/src/components/chat/ChatInput.tsx` to integrate attachment components

---

## Phase 2: Storage Layer

### 2.1 Backend Service
- [x] Create `apps/server/src/services/file.service.ts`
- [x] Implement `saveAttachmentMetadata()`
- [x] Implement `getMessageAttachments()`
- [x] Implement `getChatAttachments()`
- [x] Implement `deleteMessageAttachments()`

### 2.2 Chat Service Updates
- [x] Modify `apps/server/src/services/chat.service.ts` to include attachments in `getChatWithMessages()`
- [x] Update `deleteChat()` in preload to trigger file cleanup via IPC

### 2.3 API Routes
- [x] Modify `apps/server/src/routes/chats.ts` stream endpoint to accept `attachments` in request body

### 2.4 Frontend API
- [x] Modify `apps/web/src/lib/api/chat.ts` `send()` to include attachments

### 2.5 Hook Updates
- [x] Modify `apps/web/src/components/chat/ChatInputContainer.tsx` to save attachments before sending

### 2.6 Tests
- [ ] Unit tests for `file.service.ts`
- [ ] Integration test: Save attachment → verify on disk → verify in DB
- [ ] Integration test: Delete chat → verify files removed from disk

---

## Phase 3: AI Integration

### 3.1 File Processor Service
- [x] Create `apps/server/src/services/file-processor.ts`
- [x] Implement `isVisionModel()`
- [x] Implement `isImageFile()`
- [x] Implement `isTextFile()`
- [x] Implement `processAttachment()`
- [x] Implement `processImageAttachment()`
- [x] Implement `processTextAttachment()`

### 3.2 Context Builder Updates
- [x] Modify `apps/server/src/services/context-builder.ts` to accept attachments
- [x] Update `buildFullContext()` to process attachments and include in messages

### 3.3 Stream Service Updates
- [x] Update `StreamParams` interface to include `attachments`
- [x] Pass attachments to `buildStreamContext()`

### 3.4 Pi Agent Updates
- [x] Update `RunPiQueryOptions` interface to support multimodal content
- [x] Handle multimodal content in `session.prompt()` with images option

### 3.5 Tests
- [ ] Unit test: `isVisionModel()` model matching
- [ ] Unit test: `processAttachment()` for each file type
- [ ] Unit test: Text file truncation at 100KB
- [ ] Integration test: Send message with image → verify base64 in AI request

---

## Phase 4: Message Display

### 4.1 Frontend Components
- [x] Create `apps/web/src/components/chat/AttachmentDisplay.tsx`
- [x] Create `apps/web/src/components/chat/AttachmentGrid.tsx`
- [ ] Create `apps/web/src/components/chat/ImagePreviewModal.tsx` (optional enhancement)
- [x] Modify `apps/web/src/components/chat/MessageItem.tsx` to render attachments

### 4.2 Styles
- [x] Add styles for attachment grid layout (via Tailwind classes)

### 4.3 Tests
- [ ] Unit test: `AttachmentDisplay` renders image correctly
- [ ] Unit test: `AttachmentGrid` with multiple attachments
- [ ] Integration test: Click attachment triggers `openAttachment`

---

## Verification Checklist

After completing all phases:

### Functional Tests
- [ ] User can click attachment button and select files
- [ ] Selected files appear as preview chips in input area
- [ ] User can remove attachments before sending
- [ ] Files > 50MB are rejected with error message
- [ ] Sending message saves files to disk
- [ ] Attachments display in chat history
- [ ] Clicking attachment opens with system app
- [ ] Deleting chat removes files from disk
- [ ] Images sent to vision-capable models
- [ ] Text files extracted and included in context
- [ ] Non-vision model shows warning for images

### Cross-Platform Tests
- [ ] Works on macOS
- [ ] Works on Windows
- [ ] Works on Linux

### Performance Checks
- [ ] No lag when attaching multiple files
- [ ] Large files don't block UI
- [ ] Image previews load progressively