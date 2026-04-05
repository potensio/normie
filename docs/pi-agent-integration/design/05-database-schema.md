# Database Schema Design

## Overview

Simplify the chats table by removing Pi-managed fields (sessionId, sessionProvider) and adding branch tracking columns. JSONL files become the source of truth for conversation state.

## Schema Changes

### Current Chats Table

```typescript
export const chats = pgTable("chats", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  title: text("title").notNull(),
  provider: text("provider").notNull(),
  model: text("model"),
  sessionId: text("session_id"), // ❌ REMOVE
  sessionProvider: text("session_provider"), // ❌ REMOVE
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

### New Chats Table

```typescript
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

  // ✅ NEW: Session file path
  sessionFilePath: text("session_file_path"),

  // ✅ NEW: Branch tracking
  parentChatId: uuid("parent_chat_id").references(() => chats.id, {
    onDelete: "set null",
  }),
  branchPointMessageId: text("branch_point_message_id"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

## Migration Strategy

### Drizzle Migration File

**File:** `apps/server/drizzle/XXXX_pi_agent_integration.sql`

```sql
-- Pi Agent Integration Migration
-- Remove legacy session columns, add JSONL session tracking and branching support

-- Step 1: Remove old session columns
ALTER TABLE chats DROP COLUMN IF EXISTS session_id;
ALTER TABLE chats DROP COLUMN IF EXISTS session_provider;

-- Step 2: Add new session file path column
ALTER TABLE chats ADD COLUMN session_file_path TEXT;

-- Step 3: Add branch tracking columns
ALTER TABLE chats ADD COLUMN parent_chat_id UUID;
ALTER TABLE chats ADD COLUMN branch_point_message_id TEXT;

-- Step 4: Add foreign key constraint for parent_chat_id
ALTER TABLE chats
  ADD CONSTRAINT chats_parent_chat_id_fkey
  FOREIGN KEY (parent_chat_id)
  REFERENCES chats(id)
  ON DELETE SET NULL;

-- Step 5: Create indexes for performance
CREATE INDEX idx_chats_parent_chat_id ON chats(parent_chat_id);
CREATE INDEX idx_chats_workspace_id_updated_at ON chats(workspace_id, updated_at DESC);
CREATE INDEX idx_chats_session_file_path ON chats(session_file_path) WHERE session_file_path IS NOT NULL;

-- Step 6: Add comments
COMMENT ON COLUMN chats.session_file_path IS 'Path to JSONL session file managed by Pi Agent';
COMMENT ON COLUMN chats.parent_chat_id IS 'Parent chat ID for branched conversations';
COMMENT ON COLUMN chats.branch_point_message_id IS 'Entry ID where branch occurred';
```

### Drizzle Schema Update

**File:** `apps/server/src/db/schema.ts`

```typescript
import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const chats = pgTable(
  "chats",
  {
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
    sessionFilePath: text("session_file_path"),
    parentChatId: uuid("parent_chat_id"),
    branchPointMessageId: text("branch_point_message_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    parentChatIdIdx: index("idx_chats_parent_chat_id").on(table.parentChatId),
    workspaceUpdatedIdx: index("idx_chats_workspace_id_updated_at").on(
      table.workspaceId,
      table.updatedAt,
    ),
    sessionFilePathIdx: index("idx_chats_session_file_path").on(
      table.sessionFilePath,
    ),
  }),
);

// Self-referencing relation for branches
export const chatsRelations = relations(chats, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [chats.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, {
    fields: [chats.userId],
    references: [users.id],
  }),
  parentChat: one(chats, {
    fields: [chats.parentChatId],
    references: [chats.id],
    relationName: "chatBranches",
  }),
  branches: many(chats, {
    relationName: "chatBranches",
  }),
  messages: many(messages),
}));
```

## Messages Table (Unchanged)

The messages table remains for quick UI display and backward compatibility:

```typescript
export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  chatId: uuid("chat_id")
    .notNull()
    .references(() => chats.id, { onDelete: "cascade" }),
  role: text("role").notNull(), // 'user' | 'assistant' | 'system'
  content: text("content").notNull(),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

**Note:** Messages table is optional with Pi Agent. JSONL files are the source of truth. Messages table can be used for:

- Quick UI display without parsing JSONL
- Search/filtering across conversations
- Analytics and reporting

## Data Flow

### Chat Creation

```typescript
// 1. Create chat record
const [chat] = await db
  .insert(schema.chats)
  .values({
    workspaceId,
    userId,
    title: "New Chat",
    provider: "anthropic",
    model: "claude-opus-4-5",
  })
  .returning();

// 2. Create session manager (creates JSONL file)
const sessionManager = new NormieSessionManager({
  workspaceId: chat.workspaceId,
  chatId: chat.id,
});

// 3. Update chat with session file path
await db
  .update(schema.chats)
  .set({
    sessionFilePath: sessionManager.getSessionFilePath(),
  })
  .where(eq(schema.chats.id, chat.id));

// Result:
// - DB record: chats table
// - JSONL file: .pi/sessions/{workspaceId}/{chatId}.jsonl
```

### Message Append

```typescript
// 1. Append to JSONL (source of truth)
sessionManager.appendMessage({
  role: "user",
  content: "Hello",
  timestamp: Date.now(),
});

// 2. Optionally save to messages table (for UI)
await db.insert(schema.messages).values({
  chatId: chat.id,
  role: "user",
  content: "Hello",
});

// 3. Update chat timestamp
await db
  .update(schema.chats)
  .set({ updatedAt: new Date() })
  .where(eq(schema.chats.id, chat.id));
```

### Branch Creation

```typescript
// 1. Create branch session (copies history)
const branchSession = await NormieSessionManager.createBranch(
  { workspaceId, chatId: parentChatId },
  branchFromMessageId,
);

// 2. Create branch chat record
const [branchChat] = await db
  .insert(schema.chats)
  .values({
    workspaceId,
    userId,
    title: `${parentChat.title} (branch)`,
    provider: parentChat.provider,
    model: parentChat.model,
    parentChatId: parentChat.id,
    branchPointMessageId: branchFromMessageId,
    sessionFilePath: branchSession.getSessionFilePath(),
  })
  .returning();

// Result:
// - New DB record with parentChatId set
// - New JSONL file with copied history
```

## Query Patterns

### Get Chat with Messages

```typescript
// Option 1: From messages table (fast, for UI)
const chat = await db.query.chats.findFirst({
  where: eq(schema.chats.id, chatId),
  with: {
    messages: {
      orderBy: schema.messages.createdAt,
    },
  },
});

// Option 2: From JSONL file (source of truth)
const sessionManager = new NormieSessionManager({
  workspaceId: chat.workspaceId,
  chatId: chat.id,
});
const context = sessionManager.buildContext();
// context.messages contains full conversation history
```

### Get Chat Branches

```typescript
// Get all branches of a chat
const branches = await db.query.chats.findMany({
  where: eq(schema.chats.parentChatId, chatId),
  orderBy: schema.chats.createdAt,
});

// Get full branch tree (recursive)
async function getChatTree(chatId: string) {
  const chat = await db.query.chats.findFirst({
    where: eq(schema.chats.id, chatId),
    with: {
      branches: true,
    },
  });

  if (!chat) return null;

  // Recursively get branches
  const branchTrees = await Promise.all(
    chat.branches.map((b) => getChatTree(b.id)),
  );

  return {
    ...chat,
    branches: branchTrees,
  };
}
```

### Get Workspace Chats

```typescript
// Get all chats in workspace (ordered by recent)
const chats = await db.query.chats.findMany({
  where: eq(schema.chats.workspaceId, workspaceId),
  orderBy: desc(schema.chats.updatedAt),
  limit: 50,
});
```

## Indexes and Performance

### Index Strategy

```sql
-- Primary key (automatic)
CREATE UNIQUE INDEX chats_pkey ON chats(id);

-- Workspace queries (most common)
CREATE INDEX idx_chats_workspace_id_updated_at ON chats(workspace_id, updated_at DESC);

-- Branch queries
CREATE INDEX idx_chats_parent_chat_id ON chats(parent_chat_id);

-- Session file lookups
CREATE INDEX idx_chats_session_file_path ON chats(session_file_path) WHERE session_file_path IS NOT NULL;

-- User queries
CREATE INDEX idx_chats_user_id ON chats(user_id);
```

### Query Performance

| Query                | Index Used                          | Performance |
| -------------------- | ----------------------------------- | ----------- |
| List workspace chats | `idx_chats_workspace_id_updated_at` | O(log n)    |
| Get chat branches    | `idx_chats_parent_chat_id`          | O(log n)    |
| Find by session file | `idx_chats_session_file_path`       | O(log n)    |
| Get user chats       | `idx_chats_user_id`                 | O(log n)    |

## Data Integrity

### Constraints

```sql
-- Foreign keys
ALTER TABLE chats
  ADD CONSTRAINT chats_workspace_id_fkey
  FOREIGN KEY (workspace_id)
  REFERENCES workspaces(id)
  ON DELETE CASCADE;

ALTER TABLE chats
  ADD CONSTRAINT chats_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES users(id)
  ON DELETE CASCADE;

ALTER TABLE chats
  ADD CONSTRAINT chats_parent_chat_id_fkey
  FOREIGN KEY (parent_chat_id)
  REFERENCES chats(id)
  ON DELETE SET NULL;

-- Check constraints
ALTER TABLE chats
  ADD CONSTRAINT chats_provider_check
  CHECK (provider IN ('anthropic', 'openai', 'google', 'groq', 'xai', 'mistral', 'openrouter', 'ollama'));
```

### Cascade Behavior

| Parent    | Child   | On Delete                  |
| --------- | ------- | -------------------------- |
| workspace | chat    | CASCADE (delete chats)     |
| user      | chat    | CASCADE (delete chats)     |
| chat      | branch  | SET NULL (orphan branches) |
| chat      | message | CASCADE (delete messages)  |

## Backup and Recovery

### JSONL Files

```bash
# Backup all sessions
tar -czf sessions-backup-$(date +%Y%m%d).tar.gz .pi/sessions/

# Restore sessions
tar -xzf sessions-backup-20240101.tar.gz
```

### Database

```bash
# Backup database
pg_dump $DATABASE_URL > normie-backup-$(date +%Y%m%d).sql

# Restore database
psql $DATABASE_URL < normie-backup-20240101.sql
```

### Sync Strategy

JSONL files are the source of truth. If database and JSONL diverge:

```typescript
// Rebuild messages table from JSONL
async function syncMessagesFromJSONL(chatId: string) {
  const chat = await db.query.chats.findFirst({
    where: eq(schema.chats.id, chatId),
  });

  if (!chat || !chat.sessionFilePath) {
    throw new Error("Chat or session file not found");
  }

  // Load from JSONL
  const sessionManager = new NormieSessionManager({
    workspaceId: chat.workspaceId,
    chatId: chat.id,
  });

  const context = sessionManager.buildContext();

  // Clear existing messages
  await db.delete(schema.messages).where(eq(schema.messages.chatId, chatId));

  // Insert from JSONL
  for (const msg of context.messages) {
    await db.insert(schema.messages).values({
      chatId,
      role: msg.role,
      content: msg.content,
      metadata: msg.metadata || {},
    });
  }
}
```

## Migration Execution

### Run Migration

```bash
# Generate migration
cd apps/server
pnpm db:generate

# Push to database
pnpm db:push

# Or use migrate command
pnpm db:migrate
```

### Rollback Plan

```sql
-- Rollback migration (if needed)
ALTER TABLE chats ADD COLUMN session_id TEXT;
ALTER TABLE chats ADD COLUMN session_provider TEXT;
ALTER TABLE chats DROP COLUMN session_file_path;
ALTER TABLE chats DROP COLUMN parent_chat_id;
ALTER TABLE chats DROP COLUMN branch_point_message_id;
DROP INDEX IF EXISTS idx_chats_parent_chat_id;
DROP INDEX IF EXISTS idx_chats_session_file_path;
```

## Testing

### Schema Tests

```typescript
describe("Database Schema", () => {
  it("should create chat with session file path", async () => {
    const [chat] = await db
      .insert(schema.chats)
      .values({
        workspaceId: testWorkspace.id,
        userId: testUser.id,
        title: "Test Chat",
        provider: "anthropic",
        model: "claude-opus-4-5",
        sessionFilePath: ".pi/sessions/ws-123/chat-456.jsonl",
      })
      .returning();

    expect(chat.sessionFilePath).toBe(".pi/sessions/ws-123/chat-456.jsonl");
  });

  it("should create branch with parent reference", async () => {
    const [parent] = await db
      .insert(schema.chats)
      .values({
        workspaceId: testWorkspace.id,
        userId: testUser.id,
        title: "Parent Chat",
        provider: "anthropic",
        model: "claude-opus-4-5",
      })
      .returning();

    const [branch] = await db
      .insert(schema.chats)
      .values({
        workspaceId: testWorkspace.id,
        userId: testUser.id,
        title: "Branch Chat",
        provider: "anthropic",
        model: "claude-opus-4-5",
        parentChatId: parent.id,
        branchPointMessageId: "entry-5",
      })
      .returning();

    expect(branch.parentChatId).toBe(parent.id);
    expect(branch.branchPointMessageId).toBe("entry-5");
  });

  it("should cascade delete chats when workspace deleted", async () => {
    const [workspace] = await db
      .insert(schema.workspaces)
      .values({ ownerId: testUser.id, name: "Test WS" })
      .returning();

    const [chat] = await db
      .insert(schema.chats)
      .values({
        workspaceId: workspace.id,
        userId: testUser.id,
        title: "Test Chat",
        provider: "anthropic",
        model: "claude-opus-4-5",
      })
      .returning();

    // Delete workspace
    await db
      .delete(schema.workspaces)
      .where(eq(schema.workspaces.id, workspace.id));

    // Chat should be deleted
    const deletedChat = await db.query.chats.findFirst({
      where: eq(schema.chats.id, chat.id),
    });

    expect(deletedChat).toBeUndefined();
  });
});
```

## Monitoring

### Database Metrics

```typescript
// Track chat creation rate
SELECT
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as chats_created
FROM chats
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;

// Track branch creation rate
SELECT
  COUNT(*) as total_branches,
  COUNT(DISTINCT parent_chat_id) as unique_parents
FROM chats
WHERE parent_chat_id IS NOT NULL;

// Track session file sizes
SELECT
  workspace_id,
  COUNT(*) as chat_count,
  AVG(LENGTH(session_file_path)) as avg_path_length
FROM chats
WHERE session_file_path IS NOT NULL
GROUP BY workspace_id;
```
