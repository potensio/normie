# Refactoring Checklist

Detailed implementation steps for each refactoring priority.

---

## P0: Error Handling Middleware

### Goal
Centralize error handling with consistent response shape and structured logging.

### Files to Create

```
apps/server/src/
├── middleware/
│   └── errors.ts          # Error handler + custom error classes
├── utils/
│   └── logger.ts          # Structured logger (optional, use pino/winston)
```

### Implementation

**Step 1: Create error types (`middleware/errors.ts`)**

```typescript
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code: string = 'INTERNAL_ERROR'
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Access denied') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, 'VALIDATION_ERROR');
  }
}
```

**Step 2: Create error handler (`middleware/errors.ts`)**

```typescript
import type { Request, Response, NextFunction } from 'express';
import { AppError } from './errors.js';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error(`[ERROR] ${req.method} ${req.path}`, err);

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code
    });
  }

  // Unknown error - don't leak details
  return res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR'
  });
}
```

**Step 3: Update `index.ts`**

```typescript
import { errorHandler } from './middleware/errors.js';

// ... after all routes
app.use(errorHandler);
```

**Step 4: Update a route as example (`routes/chats.ts`)**

```typescript
import { NotFoundError, ForbiddenError } from '../middleware/errors.js';

// Before
if (!chat) {
  return res.status(404).json({ error: 'Chat not found' });
}

// After
if (!chat) {
  throw new NotFoundError('Chat');
}
```

### Checklist
- [ ] Create `middleware/errors.ts`
- [ ] Create error classes
- [ ] Add error handler to Express app
- [ ] Update auth routes
- [ ] Update chat routes
- [ ] Update workspace routes
- [ ] Update memory routes

---

## P0: Add Critical Path Tests

### Goal
Create tests for the most critical functionality.

### Files to Create

```
apps/server/src/
├── __tests__/
│   ├── setup.ts              # Test setup (DB, mocks)
│   ├── auth.test.ts          # Auth flow tests
│   ├── chats.test.ts         # Chat API tests
│   └── workspaces.test.ts    # Workspace tests
```

### Implementation

**Step 1: Add test dependencies**

```bash
pnpm --filter @normie/server add -D vitest @vitest/coverage-v8 supertest
```

**Step 2: Create test setup (`__tests__/setup.ts`)**

```typescript
import { beforeAll, afterAll, beforeEach } from 'vitest';
import { drizzle } from 'drizzle-orm/pg-core';
import { migrate } from 'drizzle-orm/pg-core/migrator';
// Use test database

beforeAll(async () => {
  // Connect to test DB
  // Run migrations
});

afterAll(async () => {
  // Cleanup
});

beforeEach(async () => {
  // Reset data
});
```

**Step 3: Create auth tests (`__tests__/auth.test.ts`)**

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../index.js';

describe('Auth API', () => {
  describe('POST /api/auth/register', () => {
    it('should create a new user', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'password123' });
      
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('test@example.com');
    });

    it('should reject duplicate email', async () => {
      // Register once
      await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'password123' });

      // Register again
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'test@example.com', password: 'password123' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should return session cookie on success', async () => {
      // ...
    });

    it('should reject wrong password', async () => {
      // ...
    });
  });
});
```

### Checklist
- [ ] Install vitest, supertest
- [ ] Create test setup
- [ ] Create auth.test.ts (register, login, logout, refresh)
- [ ] Create chats.test.ts (CRUD, stream)
- [ ] Create workspaces.test.ts (CRUD, members)
- [ ] Add CI test script
- [ ] Add coverage threshold

---

## P1: Extract Route Middleware

### Goal
Reduce code duplication in routes by creating reusable middleware.

### Files to Create

```
apps/server/src/
├── middleware/
│   ├── resource-access.ts    # Chat/workspace loading + access check
│   └── validate.ts           # Request validation helpers
```

### Implementation

**Step 1: Create resource loaders (`middleware/resource-access.ts`)**

```typescript
import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import * as schema from '../db/schema.js';
import { NotFoundError, ForbiddenError } from './errors.js';

declare global {
  namespace Express {
    interface Request {
      chat?: typeof schema.chats.$inferSelect;
      workspace?: typeof schema.workspaces.$inferSelect;
    }
  }
}

/**
 * Load chat by ID and attach to req.chat
 */
export async function loadChat(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const db = getDb();
  const [chat] = await db
    .select()
    .from(schema.chats)
    .where(eq(schema.chats.id, req.params.chatId));

  if (!chat) {
    throw new NotFoundError('Chat');
  }

  req.chat = chat;
  next();
}

/**
 * Load workspace by ID and attach to req.workspace
 */
export async function loadWorkspace(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const db = getDb();
  const workspaceId = req.params.workspaceId || req.body.workspaceId;

  const [workspace] = await db
    .select()
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspaceId));

  if (!workspace) {
    throw new NotFoundError('Workspace');
  }

  req.workspace = workspace;
  next();
}

/**
 * Verify user has access to req.chat's workspace
 */
export async function requireChatAccess(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const db = getDb();
  const chat = req.chat!;

  // Load workspace if not already loaded
  if (!req.workspace) {
    const [workspace] = await db
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, chat.workspaceId));
    req.workspace = workspace;
  }

  const workspace = req.workspace!;

  // Owner has full access
  if (workspace.ownerId === req.userId) {
    req.isWorkspaceOwner = true;
    return next();
  }

  // Check membership
  const [membership] = await db
    .select()
    .from(schema.workspaceMembers)
    .where(eq(schema.workspaceMembers.workspaceId, workspace.id));

  if (!membership) {
    throw new ForbiddenError('Access denied');
  }

  req.workspaceRole = membership.role;
  next();
}

/**
 * Require write access (owner/admin/editor)
 */
export function requireWriteAccess(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (req.isWorkspaceOwner || 
      req.workspaceRole === 'admin' ||
      (req.workspaceRole !== 'viewer')) {
    return next();
  }
  throw new ForbiddenError('Write access required');
}
```

**Step 2: Update routes to use middleware (`routes/chats.ts`)**

```typescript
import { loadChat, requireChatAccess, requireWriteAccess } from '../middleware/resource-access.js';

// Before: 30+ lines of repeated code
router.get('/:chatId', async (req, res) => {
  const [chat] = await db.select()...;
  if (!chat) return res.status(404)...;
  const [workspace] = ...;
  if (workspace.ownerId !== req.userId) {
    const [membership] = ...;
    if (!membership) return res.status(403)...;
  }
  // ... actual logic
});

// After: Clean, declarative
router.get('/:chatId', 
  loadChat, 
  requireChatAccess, 
  async (req, res) => {
    // req.chat is loaded and authorized
    // Just return the data
    const messages = await getMessages(req.chat.id);
    res.json({ ...req.chat, messages });
  }
);
```

### Checklist
- [ ] Create `middleware/resource-access.ts`
- [ ] Add type extensions for Express Request
- [ ] Refactor `routes/chats.ts` (6+ endpoints)
- [ ] Refactor `routes/memories.ts`
- [ ] Refactor `routes/workspaces.ts`
- [ ] Test all affected endpoints

---

## P1: Clean Up Legacy Provider Code

### Goal
Remove confusion around deprecated provider system.

### Current State

```
apps/server/src/providers/
├── bedrock-mantle-provider.ts  # 18KB - USED by pi/index.ts
└── index.ts                     # Deprecated stub
```

### Implementation

**Step 1: Verify Mantle usage**

```typescript
// pi/index.ts imports it:
import { streamBedrockMantle, getBedrockMantleConfig, isBedrockMantleModel } 
  from '../providers/bedrock-mantle-provider.js';
```

**Step 2: Move Mantle provider to pi/**

```bash
mkdir -p apps/server/src/pi/providers
mv apps/server/src/providers/bedrock-mantle-provider.ts apps/server/src/pi/providers/mantle.ts
```

**Step 3: Update imports in pi/index.ts**

```typescript
// Before
import { streamBedrockMantle, ... } from '../providers/bedrock-mantle-provider.js';

// After
import { streamBedrockMantle, ... } from './providers/mantle.js';
```

**Step 4: Delete providers/ directory entirely**

```bash
rm -rf apps/server/src/providers/
```

### Checklist
- [ ] Move bedrock-mantle-provider.ts to pi/providers/mantle.ts
- [ ] Update import in pi/index.ts
- [ ] Delete providers/index.ts
- [ ] Verify Bedrock streaming still works
- [ ] Update AGENTS.md to remove provider references

---

## P2: Split Large Components

### Goal
Make components more maintainable by extracting modules.

### Files to Split

| File | Lines | Action |
|------|-------|--------|
| `ChatSidebar.tsx` | 451 | Extract sub-components |
| `routes/chats.ts` | 863 | Split by endpoint type |

### Implementation

**ChatSidebar.tsx split:**

```
components/chat/
├── ChatSidebar.tsx          # Container (50 lines)
├── ChatList.tsx             # List rendering (100 lines)
├── ChatItem.tsx             # Single chat row (80 lines)
├── ChatSearch.tsx           # Search input (40 lines)
├── NewChatButton.tsx        # New chat action (30 lines)
└── ChatSidebarHeader.tsx    # Header with actions (50 lines)
```

**routes/chats.ts split:**

```
routes/
├── chats/
│   ├── index.ts             # Router + exports
│   ├── create.ts            # POST /workspace/:workspaceId
│   ├── read.ts              # GET /:chatId, GET /workspace/:workspaceId
│   ├── update.ts            # PATCH /:chatId, PATCH /:chatId/model
│   ├── delete.ts            # DELETE /:chatId
│   └── stream.ts            # POST /:chatId/stream
```

### Checklist
- [ ] Extract ChatList from ChatSidebar
- [ ] Extract ChatItem from ChatSidebar
- [ ] Split chats.ts routes
- [ ] Update barrel exports
- [ ] Test UI still works

---

## P2: Strengthen TypeScript

### Goal
Catch more errors at compile time.

### Implementation

**Step 1: Update tsconfig.json**

```json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

**Step 2: Fix common issues**

```typescript
// Before: any
const tools = await buildWorkspaceTools(options) as any;

// After: Proper type
import type { Tool } from '@mariozechner/pi-ai';

const tools: Tool[] = await buildWorkspaceTools(options);
```

**Step 3: Standardize API response types**

```typescript
// types/api.ts
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  code?: string;
}

export interface ChatListResponse {
  chats: Chat[];
}

export interface ChatResponse extends Chat {
  messages: Message[];
}
```

### Checklist
- [ ] Update tsconfig.json with stricter options
- [ ] Add API response types
- [ ] Fix `any` in pi/tools/
- [ ] Fix `any` in pi/index.ts
- [ ] Run full type check