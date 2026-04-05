# Implementation Phases

## Overview

Step-by-step implementation plan for Pi Agent integration. Each phase is independent and can be tested before moving to the next.

## Phase 1: Foundation Setup

**Goal:** Install Pi Agent packages and create basic infrastructure

**Duration:** 1-2 hours

### Tasks

1. **Install Dependencies**

   ```bash
   cd apps/server
   pnpm add @mariozechner/pi-ai @mariozechner/pi-agent-core @mariozechner/pi-coding-agent
   ```

2. **Create Directory Structure**

   ```bash
   mkdir -p apps/server/src/pi/tools
   mkdir -p .pi/sessions
   ```

3. **Create Configuration Module**
   - File: `apps/server/src/pi/config.ts`
   - Load environment variables
   - Validate configuration
   - Export helper functions

4. **Create Main Pi Module**
   - File: `apps/server/src/pi/index.ts`
   - Export `createPiSession` function
   - Export `initializePiAgent` function

5. **Update Server Startup**
   - File: `apps/server/src/index.ts`
   - Call `initializePiAgent()` on startup
   - Log configuration

### Testing

```typescript
// Test configuration loading
describe("Pi Config", () => {
  it("should load configuration", () => {
    const config = loadPiConfig();
    expect(config.defaultProvider).toBeDefined();
    expect(config.enabledProviders.length).toBeGreaterThan(0);
  });
});
```

### Success Criteria

- ✅ Pi packages installed
- ✅ Configuration loads without errors
- ✅ Server starts successfully
- ✅ Default model is accessible

---

## Phase 2: Session Management

**Goal:** Implement JSONL session storage with Pi SessionManager

**Duration:** 2-3 hours

### Tasks

1. **Create SessionManager Wrapper**
   - File: `apps/server/src/pi/session-manager.ts`
   - Implement `NormieSessionManager` class
   - Handle JSONL file creation
   - Implement branch creation

2. **Test Session Operations**
   - Create new session
   - Append messages
   - Load existing session
   - Create branch

3. **Integrate with Database**
   - Update chat creation to create JSONL file
   - Store `sessionFilePath` in database

### Testing

```typescript
describe("Session Manager", () => {
  it("should create new session file", () => {
    const manager = new NormieSessionManager({
      workspaceId: "test-ws",
      chatId: "test-chat",
    });
    expect(fs.existsSync(manager.getSessionFilePath())).toBe(true);
  });

  it("should append and retrieve messages", () => {
    const manager = new NormieSessionManager({
      workspaceId: "test-ws",
      chatId: "test-chat",
    });

    manager.appendMessage({
      role: "user",
      content: "Test",
      timestamp: Date.now(),
    });

    const context = manager.buildContext();
    expect(context.messages).toHaveLength(1);
  });
});
```

### Success Criteria

- ✅ JSONL files created in `.pi/sessions/`
- ✅ Messages persist across restarts
- ✅ Branch creation works
- ✅ Session file paths stored in database

---

## Phase 3: Tool System

**Goal:** Build Composio adapter and web tools

**Duration:** 3-4 hours

### Tasks

1. **Create Composio Tool Adapter**
   - File: `apps/server/src/pi/tools/composio-tools.ts`
   - Implement `buildComposioTools` function
   - Convert Composio schemas to TypeBox
   - Maintain workspace entity ID isolation

2. **Create Web Tools**
   - File: `apps/server/src/pi/tools/web-tools.ts`
   - Implement `webSearchTool`
   - Implement `webFetchTool`

3. **Create Tool Registry**
   - File: `apps/server/src/pi/tools/index.ts`
   - Implement `buildWorkspaceTools` function
   - Combine built-in, Composio, and web tools

4. **Test Tool Execution**
   - Test Composio tool with workspace entity ID
   - Test web search tool
   - Test built-in Pi tools (read, write, bash)

### Testing

```typescript
describe("Tool System", () => {
  it("should build Composio tools with entity ID", async () => {
    const tools = await buildComposioTools({
      workspaceId: "test-ws",
      userId: "test-user",
      composioClient: mockComposio,
    });

    expect(tools.length).toBeGreaterThan(0);

    // Execute tool
    const tool = tools[0];
    await tool.execute("call-1", {}, new AbortController().signal);

    // Verify entity ID was used
    expect(mockComposio.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        entityId: "ws_test-ws_user_test-user",
      }),
    );
  });

  it("should combine all tool types", async () => {
    const tools = await buildWorkspaceTools({
      workspaceId: "test-ws",
      userId: "test-user",
      composioClient: mockComposio,
    });

    // Should have built-in tools
    expect(tools.find((t) => t.name === "read")).toBeDefined();

    // Should have web tools
    expect(tools.find((t) => t.name === "web_search")).toBeDefined();

    // Should have Composio tools
    const composioTools = tools.filter(
      (t) => t.name.startsWith("GITHUB_") || t.name.startsWith("SLACK_"),
    );
    expect(composioTools.length).toBeGreaterThan(0);
  });
});
```

### Success Criteria

- ✅ Composio tools work with workspace isolation
- ✅ Web tools execute successfully
- ✅ Built-in Pi tools available
- ✅ Tool registry combines all types

---

## Phase 4: Event Translation

**Goal:** Translate Pi events to StreamChunk SSE format

**Duration:** 2-3 hours

### Tasks

1. **Create Event Adapter**
   - File: `apps/server/src/pi/event-adapter.ts`
   - Implement `EventAdapter` class
   - Map Pi events to StreamChunk format
   - Handle tool call tracking

2. **Test Event Translation**
   - Test text_delta → text chunk
   - Test toolcall_start → tool_use chunk
   - Test tool_execution_end → tool_result chunk
   - Test agent_end → done chunk

3. **Verify Frontend Compatibility**
   - Ensure StreamChunk format matches exactly
   - Test with existing frontend code

### Testing

```typescript
describe("Event Adapter", () => {
  it("should translate text_delta", () => {
    const adapter = new EventAdapter({
      provider: "anthropic",
      chatId: "test-chat",
    });

    const chunk = adapter.translate({
      type: "message_update",
      assistantMessageEvent: {
        type: "text_delta",
        delta: "Hello",
      },
    });

    expect(chunk).toEqual({
      type: "text",
      content: "Hello",
      provider: "anthropic",
    });
  });

  it("should translate toolcall_start", () => {
    const adapter = new EventAdapter({
      provider: "anthropic",
      chatId: "test-chat",
    });

    const chunk = adapter.translate({
      type: "message_update",
      assistantMessageEvent: {
        type: "toolcall_start",
        toolCall: {
          id: "tool-1",
          name: "read",
          input: { path: "file.txt" },
        },
      },
    });

    expect(chunk).toEqual({
      type: "tool_use",
      name: "read",
      input: { path: "file.txt" },
      id: "tool-1",
      provider: "anthropic",
    });
  });
});
```

### Success Criteria

- ✅ All Pi events translate correctly
- ✅ StreamChunk format matches exactly
- ✅ Frontend displays messages correctly
- ✅ Tool calls show in UI

---

## Phase 5: API Integration

**Goal:** Modify chat endpoint and add new APIs

**Duration:** 3-4 hours

### Tasks

1. **Modify POST /api/chat**
   - Replace provider.query() with Pi Agent
   - Use EventAdapter for SSE translation
   - Maintain exact same response format

2. **Add PATCH /api/chats/:chatId/model**
   - Implement model switching
   - Update chat metadata
   - Record switch in session

3. **Add POST /api/chats/:chatId/branch**
   - Implement branch creation
   - Create new chat record
   - Copy session history

4. **Add GET /api/chats/:chatId/tree**
   - Implement tree retrieval
   - Recursive branch loading

5. **Update GET /api/providers**
   - Return Pi AI model catalog
   - Group by provider
   - Include model metadata

### Testing

```typescript
describe("Chat API", () => {
  it("should stream with Pi Agent", async () => {
    const response = await fetch("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        message: "Hello",
        chatId: "test-chat",
        userId: "test-user",
        provider: "anthropic",
        model: "claude-opus-4-5",
        workspaceId: "test-ws",
      }),
    });

    const reader = response.body.getReader();
    const chunks = await readAllChunks(reader);

    expect(chunks[0].type).toBe("connected");
    expect(chunks.some((c) => c.type === "text")).toBe(true);
    expect(chunks[chunks.length - 1].type).toBe("done");
  });

  it("should switch models", async () => {
    const response = await fetch("/api/chats/test-chat/model", {
      method: "PATCH",
      body: JSON.stringify({
        provider: "openai",
        model: "gpt-4o",
      }),
    });

    expect(response.status).toBe(200);
    const updated = await response.json();
    expect(updated.provider).toBe("openai");
  });

  it("should create branch", async () => {
    const response = await fetch("/api/chats/test-chat/branch", {
      method: "POST",
      body: JSON.stringify({
        branchFromMessageId: "entry-5",
        title: "Alternative",
      }),
    });

    expect(response.status).toBe(200);
    const branch = await response.json();
    expect(branch.parentChatId).toBe("test-chat");
  });
});
```

### Success Criteria

- ✅ Chat endpoint works with Pi Agent
- ✅ Model switching works mid-conversation
- ✅ Branch creation works
- ✅ Tree API returns correct structure
- ✅ Provider list shows 15+ providers

---

## Phase 6: Database Migration

**Goal:** Update schema and migrate data

**Duration:** 1-2 hours

### Tasks

1. **Create Migration File**
   - File: `apps/server/drizzle/XXXX_pi_agent_integration.sql`
   - Remove sessionId, sessionProvider columns
   - Add sessionFilePath, parentChatId, branchPointMessageId columns
   - Create indexes

2. **Update Schema File**
   - File: `apps/server/src/db/schema.ts`
   - Update chats table definition
   - Add relations for branches

3. **Run Migration**

   ```bash
   cd apps/server
   pnpm db:push
   ```

4. **Verify Migration**
   - Check columns exist
   - Check indexes created
   - Test queries

### Testing

```typescript
describe("Database Migration", () => {
  it("should have new columns", async () => {
    const [chat] = await db
      .insert(schema.chats)
      .values({
        workspaceId: "test-ws",
        userId: "test-user",
        title: "Test",
        provider: "anthropic",
        model: "claude-opus-4-5",
        sessionFilePath: ".pi/sessions/test.jsonl",
        parentChatId: null,
        branchPointMessageId: null,
      })
      .returning();

    expect(chat.sessionFilePath).toBeDefined();
    expect(chat.parentChatId).toBeNull();
  });

  it("should support branch relationships", async () => {
    const [parent] = await db
      .insert(schema.chats)
      .values({
        workspaceId: "test-ws",
        userId: "test-user",
        title: "Parent",
        provider: "anthropic",
        model: "claude-opus-4-5",
      })
      .returning();

    const [branch] = await db
      .insert(schema.chats)
      .values({
        workspaceId: "test-ws",
        userId: "test-user",
        title: "Branch",
        provider: "anthropic",
        model: "claude-opus-4-5",
        parentChatId: parent.id,
        branchPointMessageId: "entry-5",
      })
      .returning();

    expect(branch.parentChatId).toBe(parent.id);
  });
});
```

### Success Criteria

- ✅ Migration runs without errors
- ✅ Old columns removed
- ✅ New columns added
- ✅ Indexes created
- ✅ Queries work correctly

---

## Phase 7: Provider Cleanup

**Goal:** Delete legacy provider code

**Duration:** 1 hour

### Tasks

1. **Delete Provider Files**

   ```bash
   rm apps/server/src/providers/base-provider.ts
   rm apps/server/src/providers/claude-provider.ts
   rm apps/server/src/providers/opencode-provider.ts
   rm apps/server/src/providers/kimi-provider.ts
   rm apps/server/src/providers/bedrock-provider.ts
   ```

2. **Simplify Provider Index**
   - File: `apps/server/src/providers/index.ts`
   - Remove provider registry
   - Keep only helper functions if needed

3. **Update Imports**
   - Remove imports of deleted providers
   - Update to use Pi Agent functions

4. **Clean Up Unused Code**
   - Remove provider-specific logic
   - Remove session Map management
   - Remove manual streaming normalization

### Testing

```bash
# Verify no broken imports
cd apps/server
npx tsc --noEmit

# Run tests
pnpm test
```

### Success Criteria

- ✅ All provider files deleted
- ✅ No TypeScript errors
- ✅ All tests pass
- ✅ Server starts successfully

---

## Phase 8: Testing & Validation

**Goal:** Comprehensive testing of all features

**Duration:** 2-3 hours

### Tasks

1. **Integration Tests**
   - Test full chat flow with Pi Agent
   - Test model switching
   - Test conversation branching
   - Test crash recovery

2. **Performance Tests**
   - Measure streaming latency
   - Measure first token time
   - Compare with baseline

3. **End-to-End Tests**
   - Test with real LLM providers
   - Test Composio tools
   - Test web tools
   - Test all 15+ providers

4. **Load Tests**
   - Test concurrent chats
   - Test large conversations
   - Test context compaction

### Testing

```typescript
describe("Integration Tests", () => {
  it("should handle full chat flow", async () => {
    // Create chat
    const chat = await createChat();

    // Send message
    const response1 = await sendMessage(chat.id, "Hello");
    expect(response1.chunks.some((c) => c.type === "text")).toBe(true);

    // Switch model
    await switchModel(chat.id, "openai", "gpt-4o");

    // Send another message
    const response2 = await sendMessage(chat.id, "Continue");
    expect(response2.chunks.some((c) => c.type === "text")).toBe(true);

    // Create branch
    const branch = await createBranch(chat.id, "entry-3");
    expect(branch.parentChatId).toBe(chat.id);

    // Send message to branch
    const response3 = await sendMessage(branch.id, "Alternative");
    expect(response3.chunks.some((c) => c.type === "text")).toBe(true);
  });

  it("should recover from crash", async () => {
    const chat = await createChat();
    await sendMessage(chat.id, "Message 1");

    // Simulate crash (kill server)
    await killServer();

    // Restart server
    await startServer();

    // Load chat - should have message
    const loaded = await loadChat(chat.id);
    expect(loaded.messages).toHaveLength(1);
  });
});
```

### Success Criteria

- ✅ All integration tests pass
- ✅ Performance meets baseline
- ✅ All providers work
- ✅ Crash recovery works
- ✅ Load tests pass

---

## Rollout Strategy

### Development

1. Create feature branch: `feature/pi-agent-integration`
2. Implement phases 1-8
3. Test thoroughly
4. Code review

### Staging

1. Deploy to staging environment
2. Run full test suite
3. Manual testing with real users
4. Performance monitoring

### Production

1. Deploy during low-traffic window
2. Monitor error rates
3. Monitor performance metrics
4. Gradual rollout (10% → 50% → 100%)

### Rollback Plan

If issues occur:

1. Revert to previous version
2. Restore database from backup
3. Investigate issues
4. Fix and redeploy

---

## Success Metrics

### Functional Metrics

- ✅ All existing chat functionality works
- ✅ 15+ providers available (vs 5 currently)
- ✅ Model switching works mid-conversation
- ✅ Conversation branching works
- ✅ Sessions survive crashes

### Performance Metrics

- ✅ Streaming latency ≤ 50ms between chunks
- ✅ First token time ≤ 500ms
- ✅ Memory usage stable (no leaks)
- ✅ JSONL file sizes reasonable

### Code Metrics

- ✅ ~1,200 lines deleted (providers)
- ✅ ~550 lines added (Pi integration)
- ✅ Net reduction: ~650 lines
- ✅ Test coverage ≥ 80%

---

## Timeline Summary

| Phase                   | Duration  | Dependencies   |
| ----------------------- | --------- | -------------- |
| 1. Foundation           | 1-2 hours | None           |
| 2. Session Management   | 2-3 hours | Phase 1        |
| 3. Tool System          | 3-4 hours | Phase 1        |
| 4. Event Translation    | 2-3 hours | Phase 1        |
| 5. API Integration      | 3-4 hours | Phases 2, 3, 4 |
| 6. Database Migration   | 1-2 hours | Phase 5        |
| 7. Provider Cleanup     | 1 hour    | Phase 6        |
| 8. Testing & Validation | 2-3 hours | Phase 7        |

**Total: 15-22 hours** (2-3 days of focused work)

---

## Post-Implementation

### Documentation

1. Update README with Pi Agent info
2. Document new API endpoints
3. Update AGENTS.md with new architecture
4. Create migration guide for users

### Monitoring

1. Set up error tracking for Pi Agent
2. Monitor JSONL file sizes
3. Track provider usage
4. Monitor cost per chat

### Future Enhancements

1. Add pi-tui for terminal UI
2. Implement custom compaction strategies
3. Add extension system
4. Build conversation analytics
