# Implementation Plan

## Status: COMPLETE ✓

- [x] 1. Backend: Add message metadata update endpoint
  - [x] 1.1 Add `updateMessageMetadata` function to chat.service.ts
  - [x] 1.2 Add `PATCH /messages/:id/metadata` route to chats.ts
  - _Requirements: 1.1, 1.2_

- [x] 2. Frontend: Persist blocks after stream
  - [x] 2.1 Add `updateMessageBlocks` method to chat API
  - [x] 2.2 Call `updateMessageBlocks` after stream completes in useChatStream
  - _Requirements: 1.1_

- [x] 3. Frontend: Load blocks from metadata
  - [x] 3.1 Update `transformApiMessage` to extract blocks from metadata
  - [x] 3.2 Update `ApiMessageResponse` type to include metadata
  - _Requirements: 1.2, 1.3_

- [x] 4. UI: Remove border wrapper from CompactToolCall
  - [x] 4.1 Remove `bg-zinc-50 border border-zinc-200` from wrapper div
  - _Requirements: 2.1, 2.2_

- [x] 5. Final Checkpoint
  - Ensure all tests pass, ask the user if questions arise.