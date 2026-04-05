# API Endpoints Design

## Overview

Add new REST endpoints for Pi Agent features (model switching, conversation branching, session tree access) while maintaining existing chat endpoint compatibility.

## New Endpoints

### 1. Model Switching

**Endpoint:** `PATCH /api/chats/:chatId/model`

**Purpose:** Switch LLM provider/model mid-conversation

**Request:**

```typescript
{
  provider: string; // e.g., 'anthropic', 'openai', 'google'
  model: string; // e.g., 'claude-opus-4-5', 'gpt-4o', 'gemini-2.5-pro'
}
```

**Response:**

```typescript
{
  id: string;
  provider: string;
  model: string;
  updatedAt: string;
}
```

**Implementation:**

```typescript
router.patch(
  "/:chatId/model",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { chatId } = req.params;
      const { provider, model } = req.body;

      // Validate provider and model
      const piModel = getModel(provider, model);
      if (!piModel) {
        return res.status(400).json({
          error: `Invalid provider/model: ${provider}/${model}`,
        });
      }

      // Get chat and verify access
      const [chat] = await db
        .select()
        .from(schema.chats)
        .where(eq(schema.chats.id, chatId));

      if (!chat) {
        return res.status(404).json({ error: "Chat not found" });
      }

      // Verify workspace access
      await verifyWorkspaceAccess(req.userId!, chat.workspaceId);

      // Update chat metadata
      const [updated] = await db
        .update(schema.chats)
        .set({
          provider,
          model,
          updatedAt: new Date(),
        })
        .where(eq(schema.chats.id, chatId))
        .returning();

      // Record model switch in session metadata
      const sessionManager = new NormieSessionManager({
        workspaceId: chat.workspaceId,
        chatId: chat.id,
      });

      sessionManager.appendMessage({
        role: "system",
        content: `[Model switched to ${provider}/${model}]`,
        timestamp: Date.now(),
      });

      res.json(updated);
    } catch (error) {
      console.error("[API] Model switch error:", error);
      res.status(500).json({ error: "Failed to switch model" });
    }
  },
);
```

**Usage Example:**

```bash
curl -X PATCH http://localhost:3001/api/chats/abc123/model \
  -H "Content-Type: application/json" \
  -d '{"provider": "openai", "model": "gpt-4o"}'
```

### 2. Create Conversation Branch

**Endpoint:** `POST /api/chats/:chatId/branch`

**Purpose:** Create a new conversation branch from a specific message

**Request:**

```typescript
{
  branchFromMessageId: string;  // Entry ID to branch from
  title?: string;               // Optional title for branch
}
```

**Response:**

```typescript
{
  id: string; // New chat ID
  parentChatId: string; // Original chat ID
  branchPointMessageId: string;
  title: string;
  workspaceId: string;
  userId: string;
  provider: string;
  model: string;
  sessionFilePath: string;
  createdAt: string;
}
```

**Implementation:**

```typescript
router.post(
  "/:chatId/branch",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { chatId } = req.params;
      const { branchFromMessageId, title } = req.body;

      if (!branchFromMessageId) {
        return res.status(400).json({
          error: "branchFromMessageId is required",
        });
      }

      // Get parent chat
      const [parentChat] = await db
        .select()
        .from(schema.chats)
        .where(eq(schema.chats.id, chatId));

      if (!parentChat) {
        return res.status(404).json({ error: "Chat not found" });
      }

      // Verify workspace access
      await verifyWorkspaceAccess(req.userId!, parentChat.workspaceId);

      // Create branch session
      const branchSession = await NormieSessionManager.createBranch(
        {
          workspaceId: parentChat.workspaceId,
          chatId: parentChat.id,
        },
        branchFromMessageId,
      );

      // Create new chat record for branch
      const [branchChat] = await db
        .insert(schema.chats)
        .values({
          workspaceId: parentChat.workspaceId,
          userId: req.userId!,
          title: title || `${parentChat.title} (branch)`,
          provider: parentChat.provider,
          model: parentChat.model,
          parentChatId: parentChat.id,
          branchPointMessageId: branchFromMessageId,
          sessionFilePath: branchSession.getSessionFilePath(),
        })
        .returning();

      res.json(branchChat);
    } catch (error) {
      console.error("[API] Branch creation error:", error);
      res.status(500).json({ error: "Failed to create branch" });
    }
  },
);
```

**Usage Example:**

```bash
curl -X POST http://localhost:3001/api/chats/abc123/branch \
  -H "Content-Type: application/json" \
  -d '{"branchFromMessageId": "entry-5", "title": "Alternative approach"}'
```

### 3. Get Conversation Tree

**Endpoint:** `GET /api/chats/:chatId/tree`

**Purpose:** Get full conversation tree including all branches

**Response:**

```typescript
{
  root: {
    id: string;
    title: string;
    createdAt: string;
    branches: Array<{
      id: string;
      title: string;
      branchPointMessageId: string;
      createdAt: string;
      branches: Array<...>;  // Recursive
    }>;
  };
}
```

**Implementation:**

```typescript
router.get(
  "/:chatId/tree",
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { chatId } = req.params;

      // Get root chat
      const [rootChat] = await db
        .select()
        .from(schema.chats)
        .where(eq(schema.chats.id, chatId));

      if (!rootChat) {
        return res.status(404).json({ error: "Chat not found" });
      }

      // Verify workspace access
      await verifyWorkspaceAccess(req.userId!, rootChat.workspaceId);

      // Build tree recursively
      const tree = await buildChatTree(rootChat.id);

      res.json({ root: tree });
    } catch (error) {
      console.error("[API] Tree retrieval error:", error);
      res.status(500).json({ error: "Failed to get conversation tree" });
    }
  },
);

async function buildChatTree(chatId: string): Promise<any> {
  const [chat] = await db
    .select()
    .from(schema.chats)
    .where(eq(schema.chats.id, chatId));

  if (!chat) return null;

  // Get child branches
  const branches = await db
    .select()
    .from(schema.chats)
    .where(eq(schema.chats.parentChatId, chatId))
    .orderBy(schema.chats.createdAt);

  // Recursively build tree for each branch
  const branchTrees = await Promise.all(
    branches.map((branch) => buildChatTree(branch.id)),
  );

  return {
    id: chat.id,
    title: chat.title,
    provider: chat.provider,
    model: chat.model,
    branchPointMessageId: chat.branchPointMessageId,
    createdAt: chat.createdAt,
    branches: branchTrees,
  };
}
```

**Usage Example:**

```bash
curl http://localhost:3001/api/chats/abc123/tree
```

**Response Example:**

```json
{
  "root": {
    "id": "abc123",
    "title": "Original conversation",
    "provider": "anthropic",
    "model": "claude-opus-4-5",
    "createdAt": "2024-01-01T00:00:00Z",
    "branches": [
      {
        "id": "def456",
        "title": "Alternative approach",
        "branchPointMessageId": "entry-5",
        "provider": "openai",
        "model": "gpt-4o",
        "createdAt": "2024-01-01T00:10:00Z",
        "branches": []
      },
      {
        "id": "ghi789",
        "title": "Another try",
        "branchPointMessageId": "entry-3",
        "provider": "anthropic",
        "model": "claude-opus-4-5",
        "createdAt": "2024-01-01T00:15:00Z",
        "branches": []
      }
    ]
  }
}
```

### 4. Get Available Providers (Enhanced)

**Endpoint:** `GET /api/providers`

**Purpose:** List all available providers and models from Pi AI

**Response:**

```typescript
{
  providers: Array<{
    id: string;           // e.g., 'anthropic', 'openai'
    name: string;         // Display name
    models: Array<{
      id: string;         // e.g., 'claude-opus-4-5'
      name: string;       // Display name
      contextWindow: number;
      maxTokens: number;
      reasoning: boolean; // Supports extended thinking
      cost: {
        input: number;    // Per 1M tokens
        output: number;
      };
    }>;
  }>;
  default: {
    provider: string;
    model: string;
  };
}
```

**Implementation:**

```typescript
import { getAvailableModels } from "@mariozechner/pi-ai";

router.get("/providers", async (req: Request, res: Response) => {
  try {
    // Get all models from Pi AI
    const allModels = getAvailableModels();

    // Group by provider
    const providerMap = new Map<string, any>();

    for (const model of allModels) {
      if (!providerMap.has(model.provider)) {
        providerMap.set(model.provider, {
          id: model.provider,
          name: capitalizeProvider(model.provider),
          models: [],
        });
      }

      providerMap.get(model.provider).models.push({
        id: model.id,
        name: model.name,
        contextWindow: model.contextWindow,
        maxTokens: model.maxTokens,
        reasoning: model.reasoning,
        cost: model.cost,
      });
    }

    const providers = Array.from(providerMap.values());

    res.json({
      providers,
      default: {
        provider: "anthropic",
        model: "claude-opus-4-5",
      },
    });
  } catch (error) {
    console.error("[API] Provider list error:", error);
    res.status(500).json({ error: "Failed to get providers" });
  }
});

function capitalizeProvider(provider: string): string {
  const names: Record<string, string> = {
    anthropic: "Anthropic",
    openai: "OpenAI",
    google: "Google",
    groq: "Groq",
    xai: "xAI",
    mistral: "Mistral",
    openrouter: "OpenRouter",
    ollama: "Ollama",
  };
  return names[provider] || provider;
}
```

## Modified Endpoints

### POST /api/chat (Modified)

**Changes:**

- Use Pi Agent instead of legacy providers
- Maintain same SSE StreamChunk format
- Add session file path tracking

**Key Modifications:**

```typescript
app.post("/api/chat", async (req, res) => {
  const { message, chatId, userId, provider, model, workspaceId } = req.body;

  // Setup SSE (unchanged)
  res.setHeader("Content-Type", "text/event-stream");
  res.flushHeaders();

  try {
    // NEW: Create session manager
    const sessionManager = new NormieSessionManager({
      workspaceId,
      chatId,
    });

    // NEW: Build workspace tools
    const tools = await buildWorkspaceTools({
      workspaceId,
      userId,
      composioClient: getComposioClient(),
    });

    // NEW: Create Pi Agent session
    const { session } = await createAgentSession({
      model: getModel(provider, model),
      sessionManager: sessionManager.getPiSessionManager(),
      customTools: tools,
      thinkingLevel: "off",
    });

    session.agent.streamFn = streamSimple;

    // NEW: Event adapter for SSE translation
    const eventAdapter = new EventAdapter({ provider, chatId });

    // NEW: Subscribe to Pi events
    session.subscribe((event) => {
      const chunk = eventAdapter.translate(event);
      if (chunk) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
    });

    // Execute (same interface)
    await session.prompt(message);

    res.end();
  } catch (error) {
    // Error handling (unchanged)
    res.write(
      `data: ${JSON.stringify({ type: "error", message: error.message })}\n\n`,
    );
    res.end();
  }
});
```

## Database Schema Changes

### Chats Table

```typescript
// Remove these columns:
// - sessionId (Pi manages internally)
// - sessionProvider (Pi manages internally)

// Add these columns:
export const chats = pgTable("chats", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  provider: text("provider").notNull(),
  model: text("model"),

  // NEW: Session file path
  sessionFilePath: text("session_file_path"),

  // NEW: Branch tracking
  parentChatId: uuid("parent_chat_id").references(() => chats.id, {
    onDelete: "set null",
  }),
  branchPointMessageId: text("branch_point_message_id"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

### Migration

```typescript
// apps/server/drizzle/migrations/XXXX_pi_agent_integration.sql

-- Remove old session columns
ALTER TABLE chats DROP COLUMN IF EXISTS session_id;
ALTER TABLE chats DROP COLUMN IF EXISTS session_provider;

-- Add new columns
ALTER TABLE chats ADD COLUMN session_file_path TEXT;
ALTER TABLE chats ADD COLUMN parent_chat_id UUID REFERENCES chats(id) ON DELETE SET NULL;
ALTER TABLE chats ADD COLUMN branch_point_message_id TEXT;

-- Create index for branch queries
CREATE INDEX idx_chats_parent_chat_id ON chats(parent_chat_id);
```

## Error Responses

### Standard Error Format

```typescript
{
  error: string;        // Human-readable error message
  code?: string;        // Error code (e.g., 'INVALID_PROVIDER')
  details?: any;        // Additional error details
}
```

### Common Error Codes

| Code                     | Status | Description                              |
| ------------------------ | ------ | ---------------------------------------- |
| `INVALID_PROVIDER`       | 400    | Provider not supported                   |
| `INVALID_MODEL`          | 400    | Model not available for provider         |
| `CHAT_NOT_FOUND`         | 404    | Chat ID doesn't exist                    |
| `ACCESS_DENIED`          | 403    | User doesn't have access to workspace    |
| `BRANCH_POINT_NOT_FOUND` | 400    | Message ID doesn't exist in conversation |
| `SESSION_ERROR`          | 500    | JSONL session file error                 |

## Rate Limiting

### Per-User Limits

```typescript
import rateLimit from "express-rate-limit";

const chatLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 requests per minute
  message: { error: "Too many requests, please try again later" },
});

app.post("/api/chat", chatLimiter, async (req, res) => {
  // ...
});
```

## Testing Strategy

### Integration Tests

```typescript
describe("Model Switching API", () => {
  it("should switch model mid-conversation", async () => {
    // Create chat
    const chat = await createTestChat();

    // Send first message with Claude
    await sendMessage(chat.id, "Hello", "anthropic", "claude-opus-4-5");

    // Switch to GPT-4
    const response = await fetch(`/api/chats/${chat.id}/model`, {
      method: "PATCH",
      body: JSON.stringify({
        provider: "openai",
        model: "gpt-4o",
      }),
    });

    expect(response.status).toBe(200);
    const updated = await response.json();
    expect(updated.provider).toBe("openai");
    expect(updated.model).toBe("gpt-4o");

    // Send next message - should use GPT-4
    await sendMessage(chat.id, "Continue", "openai", "gpt-4o");
  });
});

describe("Branching API", () => {
  it("should create conversation branch", async () => {
    // Create chat with messages
    const chat = await createTestChat();
    await sendMessage(chat.id, "Message 1");
    await sendMessage(chat.id, "Message 2");
    const msg3 = await sendMessage(chat.id, "Message 3");

    // Branch from message 2
    const response = await fetch(`/api/chats/${chat.id}/branch`, {
      method: "POST",
      body: JSON.stringify({
        branchFromMessageId: msg3.id,
        title: "Alternative",
      }),
    });

    expect(response.status).toBe(200);
    const branch = await response.json();
    expect(branch.parentChatId).toBe(chat.id);
    expect(branch.branchPointMessageId).toBe(msg3.id);

    // Verify branch has history up to branch point
    const branchMessages = await getMessages(branch.id);
    expect(branchMessages.length).toBe(3);
  });
});
```

## Frontend Integration

### Model Switching UI

```typescript
// Frontend component
function ModelSwitcher({ chatId, currentProvider, currentModel }) {
  const switchModel = async (provider: string, model: string) => {
    const response = await fetch(`/api/chats/${chatId}/model`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, model })
    });

    if (response.ok) {
      toast.success(`Switched to ${provider}/${model}`);
    }
  };

  return (
    <Select value={`${currentProvider}/${currentModel}`} onChange={switchModel}>
      <option value="anthropic/claude-opus-4-5">Claude Opus 4.5</option>
      <option value="openai/gpt-4o">GPT-4o</option>
      <option value="google/gemini-2.5-pro">Gemini 2.5 Pro</option>
    </Select>
  );
}
```

### Branch Creation UI

```typescript
function MessageActions({ messageId, chatId }) {
  const createBranch = async () => {
    const response = await fetch(`/api/chats/${chatId}/branch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        branchFromMessageId: messageId,
        title: 'Alternative approach'
      })
    });

    if (response.ok) {
      const branch = await response.json();
      navigate(`/chat/${branch.id}`);
    }
  };

  return (
    <button onClick={createBranch}>
      Branch from here
    </button>
  );
}
```
