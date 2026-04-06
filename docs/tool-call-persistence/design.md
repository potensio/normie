# Design Document: Tool Call Persistence & Styling Fixes

## Overview

This design addresses two issues:
1. **Persistence** — Tool calls stored in `blocks` array are not persisted to the database, so navigating away from a chat loses them
2. **Styling** — The compact tool call component has an unnecessary border wrapper adding visual noise

The approach:
- **Database**: Store `blocks` as JSONB in the `messages.metadata` column (already exists, no schema migration needed)
- **Backend**: Add endpoint to update message metadata with blocks after stream completes
- **Frontend**: Send blocks to backend after stream ends, ensure blocks are loaded when chat opens
- **UI**: Remove border wrapper from `CompactToolCall`, keeping result section styling minimal

---

## Architecture

### Current State
```
Stream Events → Frontend builds blocks[] → NOT SAVED → Lost on navigation
Stream Events → Server accumulates text only → Saved to DB
```

### Proposed State
```
Stream Events → Frontend builds blocks[]
                           ↓
Stream Complete → Frontend POST /messages/:id/blocks { blocks }
                           ↓
                   Server stores in metadata.blocks
                           ↓
Load Chat → Server returns messages with blocks from metadata
```

### Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend                                │
│  useChatStream builds blocks[]                                  │
│  Stream complete → POST /api/messages/:id/metadata              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Backend (NEW)                               │
│  PATCH /api/messages/:id/metadata                               │
│  → Update messages.metadata with { blocks }                     │
│  GET /api/chats/:id                                             │
│  → Return messages with blocks extracted from metadata          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Database                                 │
│  messages.metadata: { blocks: MessageBlock[] }                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Components and Interfaces

### Backend Layer

```typescript
// apps/server/src/routes/chats.ts (NEW endpoint)

// PATCH /api/messages/:id/metadata
// Update message metadata with blocks
interface UpdateMessageMetadataBody {
  blocks?: MessageBlock[];
}

// Response
interface MessageResponse {
  id: string;
  role: string;
  content: string;
  blocks?: MessageBlock[]; // extracted from metadata
  createdAt: Date;
}
```

### Service Layer

```typescript
// apps/server/src/services/chat.service.ts (NEW function)

export async function updateMessageMetadata(
  db: DbClient,
  messageId: string,
  blocks: Array<{ type: 'text'; content: string } | { type: 'tool'; toolCall: Record<string, unknown> }>
): Promise<typeof schema.messages.$inferSelect>;
```

### Frontend Layer

```typescript
// apps/web/src/lib/api/chat.ts (NEW)

updateMessageBlocks: async (messageId: string, blocks: MessageBlock[]): Promise<void>;
```

```typescript
// apps/web/src/hooks/useChatStream.ts (MODIFIED)

// After stream completes, persist blocks
await chatApi.updateMessageBlocks(assistantMessageId, blocks);
```

---

## Data Models

### MessageBlock Storage Format

```typescript
// Stored in messages.metadata.blocks as JSONB
{
  "blocks": [
    { "type": "text", "content": "I'll search for the file..." },
    { 
      "type": "tool", 
      "toolCall": {
        "id": "abc123",
        "name": "search",
        "input": { "query": "config" },
        "status": "success",
        "startTime": 1712345678901,
        "duration": 0.3,
        "result": { "files": [...] }
      }
    },
    { "type": "text", "content": "Found 3 files..." }
  ]
}
```

---

## Correctness Properties

### Property 1: Blocks Round-Trip Integrity

_For any_ message saved with `blocks` array, WHEN the chat is loaded from database THEN the returned `blocks` SHALL equal the original `blocks` (deep equality).

**Validates: Requirement 1.1, 1.2, 1.3**

### Property 2: Minimal Styling

_For any_ tool call in compact state (not expanded), WHEN rendered THEN no border or background SHALL be visible on the wrapper element.

**Validates: Requirement 2.1, 2.2**

---

## Data Flow

### Save Flow

1. Stream completes in `useChatStream`
2. `blocks[]` array is fully built
3. Frontend calls `PATCH /api/messages/:id/metadata` with `{ blocks }`
4. Server updates `messages.metadata.blocks` in database
5. Response confirms save

### Load Flow

1. User navigates to chat
2. `GET /api/chats/:id` called
3. Server returns messages, `getChatWithMessages` transforms response to include `blocks` from `metadata`
4. Frontend `transformApiChat` extracts `blocks` into Message objects
5. `MessageItem` renders `MessageBlocks` with restored tool calls

---

## File Structure

```
apps/server/src/
├── services/
│   └── chat.service.ts        # [Modify] Add updateMessageMetadata, extract blocks on read
└── routes/
    └── chats.ts               # [Modify] Add PATCH /messages/:id/metadata endpoint

apps/web/src/
├── components/
│   └── CompactToolCall.tsx    # [Modify] Remove border wrapper
├── lib/
│   └── api/
│       └── chat.ts            # [Modify] Add updateMessageBlocks method
├── hooks/
│   └── useChatStream.ts       # [Modify] Call updateMessageBlocks after stream
└── packages/
    └── utils/
        └── index.ts           # [Modify] Extract blocks from metadata in transformApiMessage
```

| File | Action | Description |
|------|--------|-------------|
| `apps/server/src/services/chat.service.ts` | Modify | Add `updateMessageMetadata`, update `getChatWithMessages` to extract blocks |
| `apps/server/src/routes/chats.ts` | Modify | Add `PATCH /messages/:id/metadata` endpoint |
| `apps/web/src/lib/api/chat.ts` | Modify | Add `updateMessageBlocks` method |
| `apps/web/src/hooks/useChatStream.ts` | Modify | Call `updateMessageBlocks` after stream completes |
| `apps/web/src/components/CompactToolCall.tsx` | Modify | Remove `bg-zinc-50 border border-zinc-200` wrapper |
| `packages/utils/src/index.ts` | Modify | Extract `blocks` from `metadata` in `transformApiMessage` |

---

## Out of Scope

- Retry/edit tool calls
- Tool call analytics
- Compression of large results
- Migration script for old messages