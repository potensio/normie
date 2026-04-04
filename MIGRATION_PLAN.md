# Migration Plan: Phase 5 & 6

## Overview

This document outlines the plan to:
1. Update imports to use `@normie/types` and `@normie/utils`
2. Migrate backend from JavaScript to TypeScript

**Estimated agents needed:** 8-9 agents
**Execution order:** Sequential for dependencies, parallel for independent modules

---

## Phase A: Update Imports to @normie/*

### Current State
- `apps/web` uses `@/types` and `@/lib/utils` (relative paths via Vite alias)
- `apps/server` has no shared type imports (plain JS)
- `packages/types` and `packages/utils` already exist

### Task A1: Update Frontend Imports
**Agent count:** 1
**Duration:** ~2 min

**Changes required:**
- Update `apps/web/tsconfig.json` - already has paths configured
- Update imports in files:
  - `src/types/index.ts` → `@normie/types`
  - `src/lib/utils.ts` → `@normie/utils`
  - All files importing from `@/types` → `@normie/types`

**Files to modify:**
```
apps/web/src/contexts/ChatContext.tsx
apps/web/src/contexts/AuthContext.tsx
apps/web/src/components/ProviderDropdown.tsx
apps/web/src/components/InlineToolCall.tsx
apps/web/src/components/MessageList.tsx
apps/web/src/lib/constants.ts
apps/web/src/lib/utils.ts (remove duplicate, use @normie/utils)
```

**After:**
- Delete `apps/web/src/types/index.ts` (use @normie/types)
- Keep `apps/web/src/types/electron.d.ts` (Electron-specific)
- Delete `apps/web/src/lib/utils.ts` (use @normie/utils)

---

## Phase B: Backend TypeScript Migration

### Dependency Graph

```
                    db/schema.js
                         │
                    db/index.js
                         │
                    db/init.js
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    providers/      services/       routes/
         │               │               │
         └───────────────┼───────────────┘
                         │
                    auth/
                         │
                    server.js
                         │
                    migrate.js
```

### Conversion Order

| Order | Module | Files | Lines | Dependencies |
|-------|--------|-------|-------|--------------|
| 1 | db/schema | 1 | ~200 | None |
| 2 | db/index | 1 | ~50 | schema |
| 3 | db/init | 1 | ~70 | index |
| 4 | providers/base | 1 | ~70 | None |
| 5 | providers/* | 6 | ~1200 | base-provider |
| 6 | services/* | 3 | ~480 | db, schema |
| 7 | auth/* | 2 | ~150 | db |
| 8 | routes/* | 5 | ~1365 | auth, db, providers, services |
| 9 | prompts | 1 | ~50 | None |
| 10 | server.js | 1 | ~500 | Everything |
| 11 | migrate.js | 1 | ~70 | db |

### Agent Assignments

#### Agent B1: Database Layer (db/)
- **Files:** `schema.js`, `index.js`, `init.js`
- **Lines:** ~320 total
- **Dependencies:** None (start first)
- **Output:** `db/schema.ts`, `db/index.ts`, `db/init.ts`

#### Agent B2: Base Provider
- **Files:** `providers/base-provider.js`
- **Lines:** ~70
- **Dependencies:** None
- **Output:** `providers/base-provider.ts`

#### Agent B3: Providers (parallel after B2)
- **Files:** `claude-provider.js`, `opencode-provider.js`, `kimi-provider.js`, `bedrock-provider.js`, `mcp-client.js`, `index.js`
- **Lines:** ~1200 total
- **Dependencies:** base-provider (B2)
- **Output:** All provider files as .ts

#### Agent B4: Services
- **Files:** `context-builder.js`, `embeddings.js`, `memory-search.js`
- **Lines:** ~480 total
- **Dependencies:** db (B1), schema
- **Output:** All services as .ts

#### Agent B5: Auth
- **Files:** `index.js`, `api-keys.js`
- **Lines:** ~150 total
- **Dependencies:** db (B1)
- **Output:** `auth/index.ts`, `auth/api-keys.ts`

#### Agent B6: Routes (parallel after B4, B5)
- **Files:** `auth.js`, `workspaces.js`, `chats.js`, `memories.js`, `api-keys.js`
- **Lines:** ~1365 total
- **Dependencies:** auth (B5), db (B1), providers (B3), services (B4)
- **Output:** All routes as .ts

#### Agent B7: Prompts + Config
- **Files:** `prompts/system.js`
- **Lines:** ~50
- **Dependencies:** None
- **Output:** `prompts/system.ts`

#### Agent B8: Main Server Files
- **Files:** `server.js`, `migrate.js`
- **Lines:** ~570 total
- **Dependencies:** All modules
- **Output:** `index.ts` (rename), `migrate.ts`

---

## TypeScript Configuration

### tsconfig.json Updates Needed

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "baseUrl": ".",
    "paths": {
      "@normie/types": ["../../packages/types/src"],
      "@normie/utils": ["../../packages/utils/src"]
    }
  },
  "include": ["src"]
}
```

### Import Changes Required

**Before (JS):**
```javascript
import { something } from './module.js';
```

**After (TS):**
```typescript
import { something } from './module.js'; // Keep .js for ESM
// OR
import { something } from './module'; // Without extension
```

---

## Execution Strategy

### Step 1: Phase A (Frontend)
- Spawn Agent A1
- Wait for completion
- Test build: `pnpm --filter @normie/web build`

### Step 2: Phase B - Foundation (Backend)
- Spawn Agent B1 (db/) and B2 (base-provider) in parallel
- Spawn Agent B7 (prompts) in parallel
- Wait for completion

### Step 3: Phase B - Core Modules
- Spawn Agent B3 (providers) - depends on B2
- Spawn Agent B4 (services) - depends on B1
- Spawn Agent B5 (auth) - depends on B1
- Wait for completion

### Step 4: Phase B - Routes
- Spawn Agent B6 (routes) - depends on B3, B4, B5
- Wait for completion

### Step 5: Phase B - Main Files
- Spawn Agent B8 (server.js, migrate.js) - depends on all
- Wait for completion

### Step 6: Integration
- Update package.json scripts
- Install additional type dependencies
- Test build: `pnpm --filter @normie/server build`
- Test run: `pnpm dev`

---

## Dependencies to Install

```bash
pnpm --filter @normie/server add -D \
  @types/node \
  @types/express \
  @types/cors \
  @types/cookie-parser \
  @types/jsonwebtoken \
  @types/bcrypt \
  @types/pg \
  @types/uuid \
  tsx
```

---

## Rollback Plan

If migration fails:
1. Delete all .ts files in apps/server/src
2. Restore from git: `git checkout -- apps/server/src/`
3. Revert package.json changes

---

## Success Criteria

1. ✅ `pnpm --filter @normie/web build` succeeds
2. ✅ `pnpm --filter @normie/server build` succeeds
3. ✅ `pnpm dev` runs without errors
4. ✅ `pnpm dev:electron` runs without errors
5. ✅ API endpoints respond correctly
6. ✅ No TypeScript compilation errors