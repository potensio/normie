# Pi Agent Integration - Design Documentation

## Overview

Complete design documentation for replacing Normie's custom provider layer with Pi Agent SDK. This transformation will:

- Delete ~1,200 lines of custom provider code
- Add support for 15+ LLM providers (vs current 5)
- Enable mid-conversation model switching
- Enable conversation branching
- Provide crash-safe JSONL session storage
- Reduce codebase by ~650 net lines

## Document Structure

Read the design documents in this order:

### 1. [Overview](./00-overview.md)

**Start here** - High-level architecture, design principles, and success metrics.

**Key Topics:**

- Architecture diagram
- What gets deleted vs added
- Design principles (boundary compatibility, workspace isolation, crash safety)
- Implementation strategy overview
- Risk mitigation

### 2. [Session Management](./01-session-management.md)

JSONL-based session storage with tree structure for branching.

**Key Topics:**

- JSONL file format and structure
- SessionManager wrapper implementation
- Crash safety with atomic writes
- Branch creation and management
- Integration with Pi Agent

### 3. [Tool System](./02-tool-system.md)

Composio adapter and web tools integration.

**Key Topics:**

- Pi Agent tool interface
- Composio → Pi tool adapter
- Web tools (search, fetch)
- Built-in Pi tools (read, write, bash, grep, find, ls)
- Workspace isolation via entity IDs

### 4. [Event Translation](./03-event-translation.md)

Translate Pi Agent events to StreamChunk SSE format.

**Key Topics:**

- Event format mapping
- EventAdapter implementation
- Streaming performance optimization
- Frontend compatibility
- Error handling

### 5. [API Endpoints](./04-api-endpoints.md)

New REST APIs and modified chat endpoint.

**Key Topics:**

- Model switching API (`PATCH /api/chats/:chatId/model`)
- Branch creation API (`POST /api/chats/:chatId/branch`)
- Session tree API (`GET /api/chats/:chatId/tree`)
- Enhanced providers API (`GET /api/providers`)
- Modified chat endpoint (`POST /api/chat`)

### 6. [Database Schema](./05-database-schema.md)

Schema changes and migration strategy.

**Key Topics:**

- Remove sessionId/sessionProvider columns
- Add sessionFilePath, parentChatId, branchPointMessageId columns
- Migration SQL
- Query patterns
- Data integrity

### 7. [Provider Integration](./06-provider-integration.md)

Pi AI unified LLM API integration.

**Key Topics:**

- Supported providers (15+)
- Configuration management
- Streaming configuration
- Cost tracking
- Error handling

### 8. [Implementation Phases](./07-implementation-phases.md)

**Implementation guide** - Step-by-step execution plan.

**Key Topics:**

- 8 phases with detailed tasks
- Testing strategy per phase
- Success criteria
- Timeline (15-22 hours total)
- Rollout strategy

## Quick Reference

### File Structure

```
apps/server/src/pi/
├── config.ts                 # Configuration management
├── session-manager.ts        # JSONL session wrapper
├── event-adapter.ts          # Pi events → StreamChunk
├── tools/
│   ├── composio-tools.ts     # Composio adapter
│   ├── web-tools.ts          # Web search/fetch
│   └── index.ts              # Tool registry
└── index.ts                  # Main Pi module

.pi/sessions/
└── {workspaceId}/
    └── {chatId}.jsonl        # Session files
```

### Key Interfaces

```typescript
// Create Pi session
const { session, sessionManager, eventAdapter } = await createPiSession({
  workspaceId,
  chatId,
  userId,
  provider: "anthropic",
  model: "claude-opus-4-5",
});

// Subscribe to events
session.subscribe((event) => {
  const chunk = eventAdapter.translate(event);
  if (chunk) {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }
});

// Execute prompt
await session.prompt(message);
```

### Database Changes

```sql
-- Remove
ALTER TABLE chats DROP COLUMN session_id;
ALTER TABLE chats DROP COLUMN session_provider;

-- Add
ALTER TABLE chats ADD COLUMN session_file_path TEXT;
ALTER TABLE chats ADD COLUMN parent_chat_id UUID;
ALTER TABLE chats ADD COLUMN branch_point_message_id TEXT;
```

### New Capabilities

1. **Model Switching**

   ```bash
   PATCH /api/chats/:chatId/model
   Body: { provider: 'openai', model: 'gpt-4o' }
   ```

2. **Conversation Branching**

   ```bash
   POST /api/chats/:chatId/branch
   Body: { branchFromMessageId: 'entry-5', title: 'Alternative' }
   ```

3. **Session Tree**
   ```bash
   GET /api/chats/:chatId/tree
   ```

## Implementation Timeline

| Phase                 | Duration  | Key Deliverables                      |
| --------------------- | --------- | ------------------------------------- |
| 1. Foundation         | 1-2 hours | Pi packages installed, config module  |
| 2. Session Management | 2-3 hours | JSONL storage, SessionManager wrapper |
| 3. Tool System        | 3-4 hours | Composio adapter, web tools           |
| 4. Event Translation  | 2-3 hours | EventAdapter, SSE compatibility       |
| 5. API Integration    | 3-4 hours | Modified chat endpoint, new APIs      |
| 6. Database Migration | 1-2 hours | Schema changes, migration             |
| 7. Provider Cleanup   | 1 hour    | Delete legacy code                    |
| 8. Testing            | 2-3 hours | Integration tests, validation         |

**Total: 15-22 hours (2-3 days)**

## Success Criteria

### Functional

- ✅ All existing chat functionality works
- ✅ 15+ providers available
- ✅ Model switching works mid-conversation
- ✅ Conversation branching works
- ✅ Sessions survive crashes

### Performance

- ✅ Streaming latency ≤ 50ms
- ✅ First token time ≤ 500ms
- ✅ Memory usage stable

### Code Quality

- ✅ ~1,200 lines deleted
- ✅ ~550 lines added
- ✅ Net reduction: ~650 lines
- ✅ Test coverage ≥ 80%

## Next Steps

1. **Review all design documents** in order (00-07)
2. **Start with Phase 1** (Foundation Setup) from [Implementation Phases](./07-implementation-phases.md)
3. **Test each phase** before moving to the next
4. **Track progress** against success criteria

## Questions?

Refer to specific design documents for detailed information:

- Architecture questions → [00-overview.md](./00-overview.md)
- Session/JSONL questions → [01-session-management.md](./01-session-management.md)
- Tool integration questions → [02-tool-system.md](./02-tool-system.md)
- Streaming questions → [03-event-translation.md](./03-event-translation.md)
- API questions → [04-api-endpoints.md](./04-api-endpoints.md)
- Database questions → [05-database-schema.md](./05-database-schema.md)
- Provider questions → [06-provider-integration.md](./06-provider-integration.md)
- Implementation questions → [07-implementation-phases.md](./07-implementation-phases.md)
