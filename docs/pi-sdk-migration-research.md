# Pi SDK Migration Research

**Date:** 2026-04-04
**Status:** Research Complete, Awaiting POC Decision

---

## Executive Summary

The pi-coding-agent SDK (`@mariozechner/pi-coding-agent`) is a mature agent framework that could replace Normie's custom provider implementation. Research indicates 80% fit with the project needs, requiring ~20% custom work for Composio integration and database persistence.

---

## 1. SDK Capabilities

### 1.1 Supported Providers (19+)

| Provider | Auth Method | Notes |
|----------|-------------|-------|
| Anthropic Claude | API Key / OAuth (Pro/Max) | Full Claude SDK support |
| OpenAI | API Key / OAuth (Plus/Pro) | GPT-4, GPT-4o, etc. |
| Azure OpenAI | API Key | Enterprise OpenAI |
| Google Gemini | API Key / OAuth (CLI) | Gemini Pro, Ultra |
| Google Vertex | ADC | Enterprise Google AI |
| Amazon Bedrock | AWS Profile/IAM | Claude, Llama, Mistral on AWS |
| Mistral | API Key | Mistral Large, Medium, Small |
| Groq | API Key | Fast inference (Llama, Mixtral) |
| Cerebras | API Key | Ultra-fast inference |
| xAI | API Key | Grok models |
| OpenRouter | API Key | Multi-provider gateway |
| Vercel AI Gateway | API Key | Multi-provider gateway |
| GitHub Copilot | OAuth | VS Code integration |
| Hugging Face | API Key | Open source models |
| Kimi For Coding | API Key | Moonshot AI |
| MiniMax | API Key | Chinese provider |
| ZAI | API Key | Various models |
| OpenCode Zen/Go | API Key | Free tier available |

**Key Benefit:** Zero provider maintenance. All providers maintained by pi team.

### 1.2 Built-in Tools

All tools work across ALL providers:

| Tool | Description |
|------|-------------|
| `read` | Read file contents (supports images, offset/limit) |
| `write` | Create or overwrite files |
| `edit` | String replacement editing |
| `bash` | Execute shell commands |
| `grep` | Search file contents |
| `find` | Glob-based file search |
| `ls` | Directory listing |

### 1.3 Session Management

**Two modes:**

1. **In-Memory** (no persistence):
```typescript
SessionManager.inMemory(cwd?: string)
```

2. **JSONL File-based** (default):
```typescript
SessionManager.create(cwd, sessionDir?)  // New session
SessionManager.open(path)                 // Open existing
SessionManager.continueRecent(cwd)        // Continue last
```

**Session structure:**
- Tree-based with `id`/`parentId` for branching
- Append-only (entries never modified)
- Supports compaction summaries, labels, custom entries

### 1.4 Event System

```typescript
type AgentSessionEvent =
  | { type: "message_update"; assistantMessageEvent: TextDeltaEvent | ThinkingDeltaEvent }
  | { type: "tool_execution_start"; toolName: string; toolCallId: string }
  | { type: "tool_execution_end"; toolName: string; result: ToolResult }
  | { type: "agent_start" }
  | { type: "agent_end"; messages: AgentMessage[] }
  | { type: "turn_start" }
  | { type: "turn_end"; message: AgentMessage; toolResults: ToolResult[] }
  | { type: "message_start" }
  | { type: "message_end" }
  | { type: "queue_update"; steering: string[]; followUp: string[] }
  | { type: "compaction_start"; reason: "manual" | "threshold" | "overflow" }
  | { type: "compaction_end"; result: CompactionResult; aborted: boolean }
  | { type: "auto_retry_start"; attempt: number; maxAttempts: number }
  | { type: "auto_retry_end"; success: boolean }
```

---

## 2. Integration Points

### 2.1 Express Backend Integration

```typescript
import { createAgentSession, SessionManager, AuthStorage, ModelRegistry } from "@mariozechner/pi-coding-agent";

app.post('/api/chat', async (req, res) => {
  const { session } = await createAgentSession({
    sessionManager: SessionManager.inMemory(),
    authStorage: AuthStorage.create(),
    modelRegistry: ModelRegistry.create(authStorage),
    customTools: await getComposioTools(),
    resourceLoader: buildResourceLoader(workspace),
  });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  session.subscribe((event) => {
    res.write(`data: ${JSON.stringify(translateEvent(event))}\n\n`);
  });

  await session.prompt(message);
});
```

### 2.2 Authentication Integration

Pi uses `AuthStorage` for API key management:

```typescript
import { AuthStorage } from "@mariozechner/pi-coding-agent";

// Custom auth storage that reads from your user_api_keys table
const authStorage = AuthStorage.create("/path/to/auth.json");

// Runtime API key (not persisted)
authStorage.setRuntimeApiKey("anthropic", userApiKey);

// Or implement custom AuthStorageBackend for DB integration
```

### 2.3 Workspace Context (SOUL.md, MEMORY.md, AGENTS.md)

```typescript
import { DefaultResourceLoader } from "@mariozechner/pi-coding-agent";

const loader = new DefaultResourceLoader({
  agentsFilesOverride: (current) => ({
    agentsFiles: [
      ...current.agentsFiles,
      { path: "/virtual/SOUL.md", content: workspace.soulMd },
      { path: "/virtual/MEMORY.md", content: workspace.memoryMd },
      { path: "/virtual/AGENTS.md", content: workspace.agentsMd },
    ],
  }),
  systemPromptOverride: () => yourSystemPrompt,
});
```

### 2.4 Session Persistence to PostgreSQL

**Challenge:** Pi defaults to JSONL files, not database.

**Option A: Sync JSONL → DB (Easier)**
- Let Pi write JSONL locally (Electron app)
- Periodically sync to PostgreSQL
- On session load, check DB for cross-device sync

**Option B: Custom SessionManager (Cleaner)**
```typescript
// Implement SessionManager interface backed by PostgreSQL
class DatabaseSessionManager implements SessionManager {
  // Store entries in messages table
  // Build tree from parent_id relationships
  // Sync across devices automatically
}
```

### 2.5 Frontend Event Translation

```typescript
// Map Pi events to your frontend's expected StreamChunk format
function translatePiEvent(event: AgentSessionEvent): StreamChunk {
  switch (event.type) {
    case "message_update":
      if (event.assistantMessageEvent.type === "text_delta") {
        return { type: "text", content: event.assistantMessageEvent.delta };
      }
      if (event.assistantMessageEvent.type === "thinking_delta") {
        return { type: "text", content: event.assistantMessageEvent.delta, isReasoning: true };
      }
      break;
    case "tool_execution_start":
      return { type: "tool_use", name: event.toolName, id: event.toolCallId };
    case "tool_execution_end":
      return { type: "tool_result", tool_use_id: event.toolCallId, result: event.result };
    case "agent_end":
      return { type: "done" };
  }
}
```

---

## 3. Composio MCP Integration

### 3.1 Challenge

Pi's philosophy: **No built-in MCP support**. Tools must be registered as `ToolDefinition[]`.

### 3.2 Solution: Wrap Composio as Custom Tools

```typescript
import { Composio } from "@composio/core";
import { Type } from "@sinclair/typebox";
import type { ToolDefinition } from "@mariozechner/pi-coding-agent";

async function getComposioTools(): Promise<ToolDefinition[]> {
  const composio = new Composio(process.env.COMPOSIO_API_KEY);

  // Get all available tools from Composio
  const tools = await composio.tools.list();

  return tools.map(tool => ({
    name: `composio_${tool.name}`,
    label: tool.name,
    description: tool.description,
    parameters: convertSchemaToTypeBox(tool.inputSchema),
    execute: async (toolCallId, params, signal, onUpdate, ctx) => {
      const result = await composio.tools.execute(tool.name, params);

      return {
        content: [{
          type: "text",
          text: typeof result === "string" ? result : JSON.stringify(result, null, 2)
        }],
        details: {},
      };
    },
  }));
}
```

### 3.3 Schema Conversion

```typescript
import { Type, type TSchema } from "@sinclair/typebox";

function convertSchemaToTypeBox(jsonSchema: object): TSchema {
  // Convert JSON Schema to TypeBox format
  // This may need refinement for complex schemas
  return Type.Object(jsonSchema.properties || {});
}
```

---

## 4. Migration Effort Estimate

### 4.1 Code Changes

| Area | Action | Lines Changed |
|------|--------|---------------|
| `providers/*` | **DELETE ALL** | -2,015 lines |
| `index.ts` | Major rewrite | ~300 rewritten |
| `routes/chats.ts` | Moderate changes | ~100 rewritten |
| Frontend `useChatStream.ts` | Event translation | ~50 rewritten |
| New: `pi-service.ts` | Pi wrapper | +150 lines |
| New: `composio-tools.ts` | Tool wrapper | +100 lines |
| New: `pi-event-adapter.ts` | Event translation | +50 lines |
| New: `session-sync.ts` | DB persistence | +100 lines |

**Net change:** -1,300 lines of code

### 4.2 Timeline

| Phase | Duration | Tasks |
|-------|----------|-------|
| POC | 1 day | Validate critical path |
| Core integration | 2 days | Pi setup, basic chat |
| Event translation | 1 day | Frontend compatibility |
| Composio tools | 1 day | Tool wrapper |
| Session persistence | 1-2 days | DB sync |
| Testing | 1 day | All providers, edge cases |
| Buffer | 1 day | Unexpected issues |
| **Total** | **7-9 days** | |

---

## 5. POC Plan

### 5.1 POC Scope

Validate these 4 critical paths:

1. **Basic chat with streaming**
   - Create session
   - Send message
   - Stream response
   - Handle abort

2. **Custom tool execution**
   - Register a simple tool
   - Trigger tool from prompt
   - Return result to LLM

3. **Context injection**
   - Load SOUL.md content
   - Verify in system prompt
   - Test with conversation

4. **Event translation**
   - Map Pi events to our `StreamChunk`
   - Verify frontend compatibility

### 5.2 POC Code

```typescript
// poc-pi-sdk.ts
import {
  createAgentSession,
  SessionManager,
  AuthStorage,
  ModelRegistry,
  DefaultResourceLoader,
  Type,
  type ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import { getModel } from "@mariozechner/pi-ai";

async function main() {
  // 1. Setup auth
  const authStorage = AuthStorage.create();
  authStorage.setRuntimeApiKey("anthropic", process.env.ANTHROPIC_API_KEY!);

  // 2. Setup model
  const modelRegistry = ModelRegistry.create(authStorage);
  const model = getModel("anthropic", "claude-sonnet-4-20250514");
  if (!model) throw new Error("Model not found");

  // 3. Custom tool
  const helloTool: ToolDefinition = {
    name: "hello",
    label: "Hello",
    description: "Say hello to someone",
    parameters: Type.Object({
      name: Type.String({ description: "Name to greet" }),
    }),
    execute: async (id, params) => ({
      content: [{ type: "text", text: `Hello, ${params.name}!` }],
      details: {},
    }),
  };

  // 4. Context injection
  const loader = new DefaultResourceLoader({
    systemPromptOverride: () => "You are a helpful assistant.",
    agentsFilesOverride: () => ({
      agentsFiles: [
        { path: "/virtual/SOUL.md", content: "# My Workspace\n\nBe concise and helpful." },
      ],
    }),
  });
  await loader.reload();

  // 5. Create session
  const { session } = await createAgentSession({
    model,
    authStorage,
    modelRegistry,
    customTools: [helloTool],
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(),
  });

  // 6. Subscribe to events
  session.subscribe((event) => {
    console.log("[Event]", event.type);

    if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
      process.stdout.write(event.assistantMessageEvent.delta);
    }

    if (event.type === "tool_execution_start") {
      console.log("\n[Tool]", event.toolName);
    }

    if (event.type === "agent_end") {
      console.log("\n[Done]");
    }
  });

  // 7. Send prompt
  await session.prompt("Say hello to Alice using the hello tool, then tell me what SOUL.md says.");
}

main().catch(console.error);
```

### 5.3 POC Success Criteria

| Test | Success Criteria |
|------|------------------|
| Chat streaming | Response streams to console |
| Custom tool | "Hello, Alice!" appears in output |
| Context injection | SOUL.md content influences response |
| Event translation | All event types logged correctly |

---

## 6. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Composio tools don't map cleanly | Medium | High | Test in POC first |
| Session persistence is complex | Medium | Medium | Start with in-memory, add DB later |
| Event format breaks frontend | Low | Medium | Translation layer is straightforward |
| Performance regression | Low | Medium | Pi uses same underlying APIs |
| Missing features | Low | High | Extension system fills gaps |

---

## 7. Decision Matrix

| Factor | Current Architecture | Pi SDK |
|--------|---------------------|--------|
| Provider maintenance | High (you maintain) | Zero (pi maintains) |
| Provider count | 4 | 19+ |
| Tool consistency | Provider-dependent | Unified across all |
| Session management | DB-backed | JSONL (need adapter) |
| Composio integration | Native MCP | Custom wrapper |
| Compaction/branching | Not implemented | Built-in |
| Extensions/skills | Not implemented | Built-in |
| Documentation | Your own | Community + docs |
| Control | Full | Delegated to SDK |

---

## 8. Recommendation

**Proceed with 1-day POC** to validate:
1. Custom tools work as expected
2. Composio wrapper is feasible
3. Event translation is clean
4. Context injection works

**If POC succeeds** → Full migration (7-9 days)
**If POC fails** → Keep current architecture, iterate incrementally

---

## 9. Resources

- **Pi SDK Docs:** `~/.pi/agent/docs/` or npm package
- **SDK Examples:** `node_modules/@mariozechner/pi-coding-agent/examples/sdk/`
- **Extension Examples:** `node_modules/@mariozechner/pi-coding-agent/examples/extensions/`
- **Openclaw Reference:** github.com/openclaw/openclaw (uses Pi SDK)
- **Pi Discord:** discord.com/invite/3cU7Bz4UPx