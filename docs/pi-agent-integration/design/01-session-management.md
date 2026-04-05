# Session Management Design

## Overview

Replace in-memory session Map + DB sessionId with Pi Agent's JSONL-based SessionManager. Each chat gets a dedicated JSONL file with tree structure support for conversation branching.

## JSONL Session Format

### File Structure

```
.pi/sessions/
├── {workspaceId}/
│   ├── {chatId}.jsonl
│   ├── {chatId}-branch-1.jsonl
│   └── {chatId}-branch-2.jsonl
```

### JSONL Entry Format

Each line in the JSONL file is a JSON object representing a conversation entry:

```typescript
interface SessionEntry {
  id: string; // Unique entry ID (UUID)
  parentId: string | null; // Parent entry ID (null for root)
  timestamp: number; // Unix timestamp
  type: "user" | "assistant" | "system" | "compaction";
  content: string; // Message content
  metadata?: {
    provider?: string; // LLM provider used
    model?: string; // Model used
    toolCalls?: ToolCall[]; // Tool invocations
    usage?: {
      // Token usage
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    };
  };
}

interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: "running" | "success" | "error";
  result?: unknown;
}
```

### Example JSONL File

```jsonl
{"id":"entry-1","parentId":null,"timestamp":1704067200000,"type":"user","content":"What files are in this directory?"}
{"id":"entry-2","parentId":"entry-1","timestamp":1704067201000,"type":"assistant","content":"I'll check the directory contents.","metadata":{"provider":"anthropic","model":"claude-opus-4-5","toolCalls":[{"id":"tool-1","name":"ls","input":{"path":"."},"status":"running"}]}}
{"id":"entry-3","parentId":"entry-2","timestamp":1704067202000,"type":"assistant","content":"The directory contains: package.json, src/, README.md","metadata":{"toolCalls":[{"id":"tool-1","name":"ls","input":{"path":"."},"status":"success","result":"package.json\nsrc/\nREADME.md"}],"usage":{"inputTokens":150,"outputTokens":45,"totalTokens":195}}}
```

## SessionManager Wrapper

### Module: `apps/server/src/pi/session-manager.ts`

```typescript
import { SessionManager as PiSessionManager } from "@mariozechner/pi-coding-agent";
import path from "path";
import fs from "fs/promises";

export interface SessionConfig {
  workspaceId: string;
  chatId: string;
  sessionDir?: string; // Default: .pi/sessions
}

export class NormieSessionManager {
  private piSessionManager: PiSessionManager;
  private sessionFilePath: string;

  constructor(config: SessionConfig) {
    const sessionDir = config.sessionDir || ".pi/sessions";
    const workspaceDir = path.join(sessionDir, config.workspaceId);
    this.sessionFilePath = path.join(workspaceDir, `${config.chatId}.jsonl`);

    // Ensure directory exists
    fs.mkdir(workspaceDir, { recursive: true });

    // Initialize Pi SessionManager
    this.piSessionManager = PiSessionManager.open(this.sessionFilePath);
  }

  /**
   * Get the underlying Pi SessionManager
   */
  getPiSessionManager(): PiSessionManager {
    return this.piSessionManager;
  }

  /**
   * Get session file path
   */
  getSessionFilePath(): string {
    return this.sessionFilePath;
  }

  /**
   * Build conversation context from JSONL
   */
  buildContext() {
    return this.piSessionManager.buildSessionContext();
  }

  /**
   * Get the leaf entry (most recent message in current branch)
   */
  getLeafEntry() {
    return this.piSessionManager.getLeafEntry();
  }

  /**
   * Branch from a specific entry
   */
  branch(entryId: string) {
    return this.piSessionManager.branch(entryId);
  }

  /**
   * Get full conversation tree
   */
  getTree() {
    return this.piSessionManager.getTree();
  }

  /**
   * Append a message to the session
   */
  appendMessage(message: {
    role: "user" | "assistant" | "system";
    content: string;
    timestamp: number;
  }) {
    return this.piSessionManager.appendMessage(message);
  }

  /**
   * Create a new branch session file
   */
  static async createBranch(
    config: SessionConfig,
    branchFromEntryId: string,
  ): Promise<NormieSessionManager> {
    // Load parent session
    const parentSession = new NormieSessionManager(config);

    // Branch from specific entry
    parentSession.branch(branchFromEntryId);

    // Create new session file for branch
    const branchChatId = `${config.chatId}-branch-${Date.now()}`;
    const branchConfig = { ...config, chatId: branchChatId };
    const branchSession = new NormieSessionManager(branchConfig);

    // Copy history up to branch point
    const tree = parentSession.getTree();
    const branchHistory = this.getHistoryUpToEntry(tree, branchFromEntryId);

    for (const entry of branchHistory) {
      branchSession.appendMessage({
        role: entry.type as "user" | "assistant" | "system",
        content: entry.content,
        timestamp: entry.timestamp,
      });
    }

    return branchSession;
  }

  /**
   * Helper: Extract history up to a specific entry
   */
  private static getHistoryUpToEntry(tree: any, targetEntryId: string): any[] {
    const history: any[] = [];

    function traverse(node: any) {
      history.push(node);
      if (node.id === targetEntryId) {
        return true;
      }
      if (node.children) {
        for (const child of node.children) {
          if (traverse(child)) {
            return true;
          }
        }
      }
      history.pop();
      return false;
    }

    traverse(tree);
    return history;
  }
}
```

## Session Lifecycle

### 1. Create New Session

```typescript
// When user starts a new chat
const sessionManager = new NormieSessionManager({
  workspaceId: "workspace-123",
  chatId: "chat-456",
});

// Session file created: .pi/sessions/workspace-123/chat-456.jsonl
```

### 2. Resume Existing Session

```typescript
// When user continues existing chat
const sessionManager = new NormieSessionManager({
  workspaceId: "workspace-123",
  chatId: "chat-456", // Existing chat ID
});

// Loads from: .pi/sessions/workspace-123/chat-456.jsonl
const context = sessionManager.buildContext();
// Returns: { messages, thinkingLevel, model }
```

### 3. Branch Conversation

```typescript
// When user wants to try alternative approach
const branchSession = await NormieSessionManager.createBranch(
  {
    workspaceId: "workspace-123",
    chatId: "chat-456",
  },
  "entry-5", // Branch from this message
);

// New file created: .pi/sessions/workspace-123/chat-456-branch-1704067300000.jsonl
// Contains history up to entry-5
```

## Crash Safety

### Atomic Writes

Pi's SessionManager uses atomic file operations:

```typescript
// Internally, Pi does:
1. Write to temporary file: chat-456.jsonl.tmp
2. Append new entry
3. Atomic rename: chat-456.jsonl.tmp → chat-456.jsonl
```

### Recovery on Restart

```typescript
// On server restart
const sessionManager = new NormieSessionManager({
  workspaceId: "workspace-123",
  chatId: "chat-456",
});

// Automatically loads from JSONL file
// If file is corrupted, loads valid entries up to corruption point
const context = sessionManager.buildContext();
```

## Integration with Pi Agent

### Creating Agent Session

```typescript
import { createAgentSession } from "@mariozechner/pi-coding-agent";
import { getModel, streamSimple } from "@mariozechner/pi-ai";

const sessionManager = new NormieSessionManager({
  workspaceId: "workspace-123",
  chatId: "chat-456",
});

const { session } = await createAgentSession({
  model: getModel("anthropic", "claude-opus-4-5"),
  sessionManager: sessionManager.getPiSessionManager(),
  customTools: [...composioTools, ...webTools],
  thinkingLevel: "off",
});

session.agent.streamFn = streamSimple;

// Subscribe to events
session.subscribe((event) => {
  // Handle Pi Agent events
});

// Execute prompt
await session.prompt("What files are in this directory?");
```

## Database Integration

### Chat Record

```typescript
// Database stores minimal metadata
interface Chat {
  id: string; // Chat UUID
  workspaceId: string;
  userId: string;
  title: string;
  provider: string; // Current provider
  model: string | null; // Current model
  sessionFilePath: string; // Path to JSONL file
  parentChatId: string | null; // For branches
  branchPointMessageId: string | null; // Entry ID where branch occurred
  createdAt: Date;
  updatedAt: Date;
}
```

### Session File Path Storage

```typescript
// When creating chat
const sessionManager = new NormieSessionManager({
  workspaceId: chat.workspaceId,
  chatId: chat.id,
});

await db
  .update(schema.chats)
  .set({
    sessionFilePath: sessionManager.getSessionFilePath(),
  })
  .where(eq(schema.chats.id, chat.id));
```

## Performance Considerations

### File Size Management

- **Context compaction**: Pi automatically compacts when approaching token limits
- **Compaction entries**: Stored as special entry type in JSONL
- **Original history preserved**: Full JSONL file kept, compacted context used for LLM

### Read Performance

- **Lazy loading**: JSONL parsed only when needed
- **Caching**: Pi caches parsed context in memory
- **Incremental reads**: Only new entries read on resume

### Write Performance

- **Append-only**: O(1) write complexity
- **No locks needed**: Atomic renames prevent corruption
- **Async writes**: Non-blocking file operations

## Error Handling

### Corrupted JSONL File

```typescript
try {
  const context = sessionManager.buildContext();
} catch (error) {
  if (error.message.includes("Invalid JSON")) {
    // Load valid entries up to corruption
    const partialContext = sessionManager.buildContextPartial();
    console.error("[SessionManager] Corrupted JSONL, loaded partial history");
  }
}
```

### Missing Session File

```typescript
// Pi automatically creates new file if missing
const sessionManager = new NormieSessionManager({
  workspaceId: "workspace-123",
  chatId: "new-chat",
});

// File created on first message append
sessionManager.appendMessage({
  role: "user",
  content: "Hello",
  timestamp: Date.now(),
});
```

## Testing Strategy

### Unit Tests

```typescript
describe("NormieSessionManager", () => {
  it("should create new session file", async () => {
    const manager = new NormieSessionManager({
      workspaceId: "test-ws",
      chatId: "test-chat",
    });

    expect(fs.existsSync(manager.getSessionFilePath())).toBe(true);
  });

  it("should append and retrieve messages", async () => {
    const manager = new NormieSessionManager({
      workspaceId: "test-ws",
      chatId: "test-chat",
    });

    manager.appendMessage({
      role: "user",
      content: "Test message",
      timestamp: Date.now(),
    });

    const context = manager.buildContext();
    expect(context.messages).toHaveLength(1);
    expect(context.messages[0].content).toBe("Test message");
  });

  it("should create branch with history", async () => {
    const parent = new NormieSessionManager({
      workspaceId: "test-ws",
      chatId: "parent-chat",
    });

    // Add messages
    parent.appendMessage({
      role: "user",
      content: "Message 1",
      timestamp: Date.now(),
    });
    parent.appendMessage({
      role: "assistant",
      content: "Response 1",
      timestamp: Date.now(),
    });

    const leaf = parent.getLeafEntry();
    const branch = await NormieSessionManager.createBranch(
      { workspaceId: "test-ws", chatId: "parent-chat" },
      leaf.id,
    );

    const branchContext = branch.buildContext();
    expect(branchContext.messages).toHaveLength(2);
  });
});
```

### Integration Tests

```typescript
describe("Session Recovery", () => {
  it("should recover from crash", async () => {
    const manager1 = new NormieSessionManager({
      workspaceId: "test-ws",
      chatId: "crash-test",
    });

    manager1.appendMessage({
      role: "user",
      content: "Before crash",
      timestamp: Date.now(),
    });

    // Simulate crash (don't call cleanup)

    // Create new manager instance (simulates restart)
    const manager2 = new NormieSessionManager({
      workspaceId: "test-ws",
      chatId: "crash-test",
    });

    const context = manager2.buildContext();
    expect(context.messages).toHaveLength(1);
    expect(context.messages[0].content).toBe("Before crash");
  });
});
```

## Migration from Current System

### Current State

- In-memory Map: `sessions.set(chatId, sessionId)`
- DB field: `chats.sessionId` (provider-specific)

### New State

- JSONL files: `.pi/sessions/{workspaceId}/{chatId}.jsonl`
- DB field: `chats.sessionFilePath`

### Migration Strategy

**No backward compatibility** - Fresh start:

1. Keep existing chats table for reference
2. New chats use Pi sessions from day 1
3. Old chats remain read-only (display from messages table)
4. Users can "restart" old chats as new Pi sessions
