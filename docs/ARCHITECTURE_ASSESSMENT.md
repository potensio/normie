# Architecture Assessment - Normie Codebase

**Date:** 2026-04-05
**Purpose:** Evaluate maintainability and identify refactoring priorities

---

## Executive Summary

Overall, the codebase has a **solid foundation** with good architectural decisions:
- ✅ Monorepo structure with shared packages
- ✅ TanStack Query for data fetching
- ✅ TypeScript throughout
- ✅ Feature-based hooks organization
- ✅ Centralized API client layer
- ✅ Session-based auth with JWT

However, there are **critical areas needing attention**:

| Priority | Area | Issue | Impact |
|----------|------|-------|--------|
| **P0** | Testing | Zero test coverage | High risk of regressions |
| **P0** | Error Handling | Inconsistent error patterns | Poor debugging experience |
| **P1** | Route Duplication | Auth/workspace checks repeated | Maintenance burden |
| **P1** | Legacy Code | Dead provider files remain | Confusion, tech debt |
| **P2** | Type Safety | `any` types in critical paths | Runtime errors |
| **P2** | Component Size | ChatSidebar 451 lines | Hard to maintain |

---

## What's Working Well

### 1. Monorepo Structure ✅
```
normie/
├── packages/
│   ├── types/       # Shared types
│   └── utils/       # Shared utilities
├── apps/
│   ├── web/         # Frontend (React + Vite)
│   └── server/      # Backend (Express + TypeScript)
└── electron/        # Electron main/preload
```
**Benefit:** Clear separation, shared code, independent deployments.

### 2. Frontend Architecture ✅

**Hooks are well-organized by feature:**
```typescript
// hooks/index.ts - Clean barrel exports
export { useChats, useCurrentChat, useChatNavigation } from './useChats';
export { useChatStream } from './useChatStream';
export { usePreferences } from './usePreferences';
```

**ChatContext as stateless orchestrator:**
```typescript
// ChatContext doesn't hold state, combines hooks
// This makes it testable and follows SRP
```

**API client layer is centralized:**
```typescript
// lib/api/client.ts - Single fetch wrapper with auth
export async function apiClient<T>(endpoint: string, options?: RequestOptions): Promise<T>
```

### 3. Backend Architecture ✅

**Pi Agent integration is clean:**
- `pi/index.ts` - Main entry point
- `pi/credentials.ts` - Credential resolution
- `pi/tools/` - Tool builders
- `pi/session-manager.ts` - Session handling

**Database schema is well-structured:**
- Proper relations defined
- Indexes on query paths
- Migration via Drizzle ORM

### 4. Authentication ✅
- Session-based with HTTP-only cookies
- JWT access tokens (15 min expiry)
- Automatic refresh flow
- Workspace access middleware

---

## Critical Issues

### P0: Zero Test Coverage ❌

**Current state:**
```bash
$ find . -name "*.test.ts" -o -name "*.spec.ts" | grep -v node_modules
# (empty - no tests exist)
```

**Risk:**
- Any refactor could break existing functionality
- No confidence in changes
- Regressions go undetected

**Recommendation:**
Start with critical path tests:
1. Auth flow (login, register, session refresh)
2. Chat streaming (message sending, abort)
3. Workspace access (permissions)

See [REFACTORING_CHECKLIST.md](./REFACTORING_CHECKLIST.md) for test file structure.

---

### P0: Inconsistent Error Handling ❌

**Problem:** Multiple error patterns across routes:

```typescript
// Pattern A: Direct console.error + status
catch (err) {
  console.error('[CHAT] Error:', err);
  res.status(500).json({ error: 'Failed to ...' });
}

// Pattern B: No logging
catch (err) {
  res.status(500).json({ error: 'Internal error' });
}

// Pattern C: Different response shape
catch (err) {
  res.status(500).json({ success: false, message: err.message });
}
```

**Impact:**
- Debugging is painful
- Frontend gets inconsistent error shapes
- No structured logging for production

**Recommendation:**
Create centralized error handling:

```typescript
// server/src/middleware/errors.ts
interface AppError extends Error {
  statusCode: number;
  code: string;
}

export function errorHandler(err: AppError, req: Request, res: Response, next: NextFunction) {
  const statusCode = err.statusCode || 500;
  
  logger.error(`[${req.path}] ${err.message}`, { 
    userId: req.userId,
    error: err 
  });

  res.status(statusCode).json({
    error: err.message,
    code: err.code || 'INTERNAL_ERROR'
  });
}
```

---

### P1: Route Code Duplication ❌

**Problem:** Every route repeats the same auth/workspace checks:

```typescript
// routes/chats.ts (repeated 6+ times)
const [chat] = await db.select().from(schema.chats).where(eq(schema.chats.id, chatId));
if (!chat) return res.status(404).json({ error: 'Chat not found' });

const [workspace] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, chat.workspaceId));

if (workspace.ownerId !== req.userId) {
  const [membership] = await db.select().from(schema.workspaceMembers)...;
  if (!membership) return res.status(403).json({ error: 'Access denied' });
}
```

**Impact:**
- 100+ lines of duplicated code
- High maintenance burden
- Easy to miss a check

**Recommendation:**
Create composable middleware and helpers:

```typescript
// middleware/resource-access.ts
export const loadChat = async (req: Request, res: Response, next: NextFunction) => {
  const chat = await db.query.chats.findFirst({
    where: eq(schema.chats.id, req.params.chatId)
  });
  
  if (!chat) {
    return res.status(404).json({ error: 'Chat not found' });
  }
  
  req.resource = { chat, workspaceId: chat.workspaceId };
  next();
};

export const requireChatAccess = [
  requireAuth,
  loadChat,
  requireResourceAccess
];
```

---

### P1: Dead Legacy Code ❌

**Problem:** Old provider files remain but are deprecated:

```
apps/server/src/providers/
├── bedrock-mantle-provider.ts  # 18KB - still used?
└── index.ts                     # Says "deprecated"
```

The `index.ts` explicitly states:
```typescript
/**
 * Provider Module (Legacy Stub)
 * @deprecated Use Pi Agent instead
 */
```

**Impact:**
- Confusion for new developers
- Risk of accidentally using deprecated code
- Bloats codebase

**Recommendation:**
1. Verify `bedrock-mantle-provider.ts` is still used by Pi Agent
2. If yes, move to `pi/providers/mantle.ts`
3. Delete `providers/index.ts` entirely

---

### P2: Type Safety Issues ⚠️

**Problem 1: `any` in critical paths**

```typescript
// pi/index.ts
const tools = ... as any;  // Tool type is complex but casting hides issues

// pi/tools/index.ts
composioClient: composioClient as any,
```

**Problem 2: Inconsistent response types**

```typescript
// Some routes return { chat }, others return just the entity
res.json(chat);           // GET /:chatId
res.json({ chats });      // GET /workspace/:workspaceId
```

**Recommendation:**
1. Create proper types for tools
2. Standardize API response shapes
3. Enable stricter TypeScript config

---

### P2: Large Component Files ⚠️

**Problem:**

| File | Lines | Concern |
|------|-------|---------|
| `ChatSidebar.tsx` | 451 | UI + logic mixed |
| `routes/chats.ts` | 863 | Too many endpoints |
| `ChatInput.tsx` | 349 | Could extract sub-components |
| `pi/index.ts` | 595 | God file territory |

**Recommendation:**
Extract modules:
- `ChatSidebar.tsx` → Split into `ChatList`, `ChatItem`, `NewChatButton`
- `routes/chats.ts` → Split into `chats-create.ts`, `chats-stream.ts`, `chats-crud.ts`

---

## Architecture Debt Summary

```
┌─────────────────────────────────────────────────────────────┐
│                    TECHNICAL DEBT QUADRANT                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   HIGH VALUE          │    tests/                   │       │
│                       │    - auth.test.ts           │       │
│   ┌───────────────────┼─────────────────────────────┘       │
│   │                   │                                     │
│   │  ERROR HANDLER    │    COMPOSE MIDDLEWARE               │
│   │  [P0]             │    [P1]                             │
│   │                   │                                     │
│   │  BACKEND CLEANUP  │    COMPONENT SPLIT                  │
│   │  [P1]             │    [P2]                             │
│   │                   │                                     │
│   └───────────────────┼─────────────────────────────────────│
│                       │                                     │
│   LOW VALUE           │                                     │
│                       │                                     │
└─────────────────────────────────────────────────────────────┘
```

---

## Recommended Refactoring Order

1. **[P0]** Add error handling middleware → Immediate stability gain
2. **[P0]** Add critical path tests → Safety net for all future work
3. **[P1]** Extract route middleware → Reduce duplication by ~200 lines
4. **[P1]** Clean up providers/ → Remove confusion
5. **[P2]** Split large components → Improve maintainability
6. **[P2]** Strengthen TypeScript → Catch more errors at compile time

See [REFACTORING_CHECKLIST.md](./REFACTORING_CHECKLIST.md) for detailed implementation steps.