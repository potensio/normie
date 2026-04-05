# Design Overview: Pi Agent Integration

## Architecture Philosophy

Replace Normie's custom provider layer with Pi Agent SDK to gain production-proven agent infrastructure. This design follows a **clean replacement strategy** - delete old, add new, maintain compatibility at the API boundary (SSE streaming).

## Design Documents Structure

This design is split into focused modules:

1. **00-overview.md** (this file) - High-level architecture and design principles
2. **01-session-management.md** - JSONL session storage, tree structure, crash safety
3. **02-tool-system.md** - Composio adapter, web tools, workspace isolation
4. **03-event-translation.md** - Pi events → StreamChunk SSE format
5. **04-api-endpoints.md** - New REST APIs for model switching, branching, tree access
6. **05-database-schema.md** - Schema changes, migration strategy
7. **06-provider-integration.md** - Pi AI multi-provider setup, configuration
8. **07-implementation-phases.md** - Step-by-step implementation order

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                         │
│                  (No changes required)                       │
└────────────────────────┬────────────────────────────────────┘
                         │ SSE (StreamChunk format)
                         │
┌────────────────────────▼────────────────────────────────────┐
│                  Express API Layer                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  POST /api/chat (modified)                           │   │
│  │  PATCH /api/chats/:id/model (new)                    │   │
│  │  POST /api/chats/:id/branch (new)                    │   │
│  │  GET /api/chats/:id/tree (new)                       │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│              Pi Agent Integration Layer                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  SessionManager (JSONL storage)                      │   │
│  │  EventAdapter (Pi events → StreamChunk)              │   │
│  │  ToolRegistry (Composio + Web tools)                 │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                   Pi Agent SDK                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  pi-coding-agent (session, tools, compaction)        │   │
│  │  pi-agent-core (agent loop, tool execution)          │   │
│  │  pi-ai (unified LLM API, 15+ providers)              │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────┘
                         │
        ┌────────────────┴────────────────┐
        │                                  │
┌───────▼────────┐              ┌─────────▼──────────┐
│  LLM Providers │              │  Composio Tools    │
│  (15+ options) │              │  (workspace-scoped)│
└────────────────┘              └────────────────────┘
```

## What Gets Deleted

```
apps/server/src/providers/
├── base-provider.ts          ❌ DELETE (~500 lines)
├── claude-provider.ts        ❌ DELETE (~200 lines)
├── opencode-provider.ts      ❌ DELETE (~150 lines)
├── kimi-provider.ts          ❌ DELETE (~150 lines)
├── bedrock-provider.ts       ❌ DELETE (~150 lines)
└── index.ts                  ⚠️  SIMPLIFY (keep registry only)
```

**Total deletion: ~1,200 lines**

## What Gets Added

```
apps/server/src/pi/
├── config.ts                 ✅ NEW (~50 lines)
├── session-manager.ts        ✅ NEW (~150 lines)
├── event-adapter.ts          ✅ NEW (~100 lines)
├── tools/
│   ├── composio-tools.ts     ✅ NEW (~150 lines)
│   ├── web-tools.ts          ✅ NEW (~50 lines)
│   └── index.ts              ✅ NEW (~20 lines)
└── index.ts                  ✅ NEW (~30 lines)
```

**Total addition: ~550 lines**

**Net result: -650 lines, +15 providers, +branching, +model switching**

## Key Design Principles

### 1. Boundary Compatibility

- **Frontend sees no changes** - SSE StreamChunk format preserved
- **Database schema simplified** - Remove sessionId/sessionProvider (Pi manages internally)
- **API surface expanded** - Add new endpoints, keep existing ones working

### 2. Workspace Isolation

- **Composio entity IDs** - Maintain `ws_{workspaceId}_user_{userId}` pattern
- **Tool scoping** - Each workspace gets isolated tool set
- **Session storage** - JSONL files organized by workspace

### 3. Crash Safety

- **Atomic JSONL appends** - Each message write is atomic
- **No in-memory state** - All state in JSONL files
- **Graceful recovery** - Load from JSONL on restart

### 4. Performance Parity

- **Streaming latency** - Match or beat current 50ms chunk intervals
- **First token time** - Within 500ms of current baseline
- **Memory efficiency** - JSONL files prevent memory bloat

## Implementation Strategy

### Phase 1: Foundation (Core Infrastructure)

- Install Pi Agent packages
- Create session manager wrapper
- Set up JSONL storage directory structure

### Phase 2: Tool System (Composio Integration)

- Build Composio → Pi tool adapter
- Implement web tools (search/fetch)
- Test workspace isolation

### Phase 3: Event Translation (SSE Compatibility)

- Build Pi event → StreamChunk translator
- Test streaming performance
- Verify frontend compatibility

### Phase 4: API Integration (Express Routes)

- Modify POST /api/chat to use Pi Agent
- Add model switching endpoint
- Add branching endpoints

### Phase 5: Database Migration (Schema Changes)

- Remove sessionId/sessionProvider columns
- Add branch tracking columns
- Create Drizzle migration

### Phase 6: Provider Cleanup (Delete Legacy Code)

- Remove old provider files
- Update provider registry
- Clean up imports

### Phase 7: Testing & Validation

- Integration tests for all new features
- Performance benchmarks
- End-to-end testing

## Success Metrics

- ✅ All existing chat functionality works
- ✅ 15+ providers available (vs 5 currently)
- ✅ Model switching works mid-conversation
- ✅ Conversation branching creates independent paths
- ✅ Sessions survive crashes (JSONL recovery)
- ✅ Streaming performance ≥ current baseline
- ✅ Composio tools work with workspace isolation
- ✅ Codebase reduced by ~650 lines

## Risk Mitigation

### Risk: Composio MCP incompatibility with Pi

**Mitigation:** Build adapter layer that wraps Composio actions as Pi tools. Test with 2-3 key actions first.

### Risk: Performance degradation

**Mitigation:** Benchmark streaming latency early. Pi's streamSimple is optimized, should match or beat current.

### Risk: JSONL file corruption

**Mitigation:** Use atomic writes, implement recovery logic that loads valid messages up to corruption point.

### Risk: Frontend breaking changes

**Mitigation:** Maintain exact StreamChunk format. Add integration tests that verify event translation.

## Next Steps

Read the detailed design documents in order:

1. Session Management (01-session-management.md)
2. Tool System (02-tool-system.md)
3. Event Translation (03-event-translation.md)
4. API Endpoints (04-api-endpoints.md)
5. Database Schema (05-database-schema.md)
6. Provider Integration (06-provider-integration.md)
7. Implementation Phases (07-implementation-phases.md)
