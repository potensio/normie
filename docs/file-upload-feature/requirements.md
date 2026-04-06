# File Upload Feature - Requirements Document

## Introduction

The file upload feature enables users to attach multiple files to chat messages when interacting with AI. Files are stored locally in the Electron app's userData directory, with metadata persisted in the database. This approach eliminates cloud storage costs while maintaining file persistence across app restarts.

The feature supports images (processed as vision inputs for compatible models), text-based files (extracted and included in context), and binary files (stored with appropriate handling). Users can preview and remove attachments before sending, and attached files are displayed in the conversation history.

## Glossary

| Term | Definition |
|------|------------|
| **Attachment** | A file added to a chat message before sending |
| **FileMetadata** | Database record containing file reference (name, type, size, storage path) |
| **Vision-capable model** | AI model that can process images (Claude 3+, GPT-4o, Gemini) |
| **Text-extractable file** | File whose content can be read as text (TXT, MD, JSON, code files) |
| **Binary file** | File that cannot be meaningfully read as text (PDFs, archives, etc.) |
| **App data directory** | Platform-specific folder for storing app files (managed by Electron's `app.getPath('userData')`) |
| **Base64** | Binary-to-text encoding used to embed file data in API requests |

## Requirements

### Requirement 1
**User Story:** As a user, I want to attach files to my message using a file picker, so that I can share context with the AI.

#### Acceptance Criteria
1. WHEN the user clicks the attachment button (Paperclip icon) THEN the System SHALL open the native file picker dialog allowing multiple file selection.
2. WHEN the user selects one or more files THEN the System SHALL add all selected files to the current message's attachment list.
3. WHEN files are added THEN the System SHALL display each file as a removable chip/pill in the input area showing filename and file size.
4. WHEN the user clicks the remove button on an attached file THEN the System SHALL remove that file from the attachment list.
5. WHEN the user has not attached any files THEN the System SHALL not display any attachment preview area.
6. WHEN the user clicks the attachment button but cancels the file picker THEN the System SHALL not modify the current attachment list.

---

### Requirement 2
**User Story:** As a user, I want to see preview thumbnails for image attachments, so that I can verify I attached the correct images.

#### Acceptance Criteria
1. WHEN the user attaches an image file (PNG, JPEG, GIF, WebP, BMP) THEN the System SHALL display a thumbnail preview of the image in the attachment chip.
2. WHEN the image thumbnail loads THEN the System SHALL maintain aspect ratio with a maximum height of 48px.
3. WHEN the image fails to load for preview THEN the System SHALL display a generic file icon fallback.
4. WHEN the user attaches a non-image file THEN the System SHALL display a file type icon based on the file extension.

---

### Requirement 3
**User Story:** As a user, I want my attached files to be persisted and included in the conversation, so that the AI can reference them in its responses.

#### Acceptance Criteria
1. WHEN the user sends a message with attachments THEN the System SHALL save all attached files to the app data directory before creating the message.
2. WHEN files are saved THEN the System SHALL generate unique filenames to prevent collisions (e.g., `{messageId}_{timestamp}_{originalName}`).
3. WHEN files are saved THEN the System SHALL store file metadata in the database linked to the message (name, type, size, storage path).
4. WHEN a chat is deleted THEN the System SHALL delete all associated files from the app data directory.
5. WHEN the message is sent THEN the System SHALL include all text-extractable file contents in the AI context.
6. WHEN the message is sent with image attachments AND the selected model is vision-capable THEN the System SHALL include images as base64 in the AI request.
7. WHEN the message is sent with image attachments AND the selected model is NOT vision-capable THEN the System SHALL display a warning that images may not be processed by this model.

---

### Requirement 4
**User Story:** As a user, I want to see my attached files displayed in the conversation history, so that I can reference what I shared.

#### Acceptance Criteria
1. WHEN a user message with attachments is displayed THEN the System SHALL show attachment previews above the message text.
2. WHEN an image attachment is displayed in history THEN the System SHALL render a clickable thumbnail that opens the full-size image.
3. WHEN the user clicks on an attachment in history THEN the System SHALL open the file using the system's default application.
4. WHEN displaying file attachments THEN the System SHALL show file name and size in a consistent format (e.g., "document.pdf (245 KB)").

---

### Requirement 5
**User Story:** As a user, I want the system to handle large files gracefully, so that the app remains performant.

#### Acceptance Criteria
1. WHEN the user attempts to attach a file larger than 50MB THEN the System SHALL reject the file and display an error message indicating the 50MB limit.
2. WHEN the total size of attachments exceeds 100MB THEN the System SHALL display a warning but allow the user to proceed.
3. WHEN the user attaches more than 10 files THEN the System SHALL display a warning suggesting to reduce the number of attachments.
4. WHEN a file upload is in progress THEN the System SHALL display an upload progress indicator for files larger than 5MB.
5. WHEN the app data directory exceeds 1GB THEN the System SHALL log a cleanup warning (background task, not user-facing).

---

### Requirement 6
**User Story:** As a user, I want non-image files to be processed intelligently, so that the AI can understand their content when possible.

#### Acceptance Criteria
1. WHEN the user attaches a text-extractable file (TXT, MD, JSON, CSV, XML, code files) THEN the System SHALL read the file content and include it in the AI context as text.
2. WHEN a text-extractable file exceeds 100KB THEN the System SHALL truncate the content with a notice: "[File truncated - first 100KB shown]".
3. WHEN the user attaches a binary file (PDF, DOCX, etc.) THEN the System SHALL attempt to extract text content if a suitable library is available; otherwise include only metadata (filename, type, size).
4. WHEN text extraction fails for a binary file THEN the System SHALL log the error and include only the file metadata in the context.
5. WHEN the AI response references an attached file THEN the System SHALL display the reference as a clickable link to the file.

---

### Requirement 7
**User Story:** As a user, I want the attachment button to clearly indicate its purpose, so that I know how to add files.

#### Acceptance Criteria
1. WHEN the user hovers over the attachment button THEN the System SHALL display a tooltip reading "Attach files".
2. WHEN the cursor hovers over the attachment button THEN the System SHALL change the button's visual state to indicate interactivity.
3. WHEN the sending is in progress (isStreaming) THEN the System SHALL disable the attachment button.
4. WHEN the input area is in "home" variant (new chat) THEN the System SHALL display the attachment button with the same functionality.

---

## Non-Functional Requirements

### Requirement 8
**User Story:** As a developer, I want the file upload feature to handle errors gracefully, so that users are informed of issues and the app remains stable.

#### Acceptance Criteria
1. WHEN file read permission is denied THEN the System SHALL display an error toast: "Could not read file: [filename]".
2. WHEN the app data directory is not writable THEN the System SHALL display an error message and log the error for debugging.
3. WHEN a file becomes corrupted or missing from storage THEN the System SHALL display a placeholder in the UI instead of crashing.
4. WHEN the database operation to save file metadata fails THEN the System SHALL delete the orphaned file from disk and display an error to the user.

### Requirement 9
**User Story:** As a developer, I want file storage to be organized efficiently, so that the app data directory remains maintainable.

#### Acceptance Criteria
1. WHEN storing files THEN the System SHALL organize them in a subdirectory structure: `{userData}/attachments/{chatId}/`.
2. WHEN computing storage paths THEN the System SHALL use the Electron `app.getPath('userData')` API to determine the base directory.
3. WHEN files are saved THEN the System SHALL preserve the original file extension.

---

## Out of Scope

The following are explicitly excluded from this requirement:

- Drag-and-drop file upload (deferred to future iteration)
- File editing/preview in a separate window
- File compression before upload
- Video or audio file processing (files can be attached but not processed for content)
- Cloud storage or file sharing between devices
- End-to-end encryption of stored files