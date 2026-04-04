# AGENTS.md

Instructions for AI assistants working on this codebase. Follow these guidelines to maintain consistency.

---

## Critical Rules

**GIT RESTRICTION**: AI is NOT permitted to commit or push code to git unless explicitly asked by the user. This includes:
- `git add`
- `git commit`
- `git push`

AI may run `git status`, `git diff`, `git log`, and other read-only commands freely.

**DATABASE MIGRATIONS**: Always use Drizzle ORM for database schema changes. Never use raw SQL files or manual table creation.

---

## Project Overview

Normie is an Electron desktop application with a Node.js backend supporting multiple AI providers (Claude, Opencode, Kimi, Bedrock) with Composio tool integration. Target: 10-100 users.

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Desktop | Electron 39 |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Backend | Express 5, Node.js (ESM), TypeScript |
| Database | PostgreSQL (Neon), pgvector, Drizzle ORM |
| AI Providers | Claude SDK, Opencode, Kimi, Bedrock |
| Auth | Session-based JWT + httpOnly cookies |
| Tools/MCP | Composio |

---

## Current File Structure (Monorepo)

```
normie/
├── electron/                 # Electron main process
│   ├── src/main.ts          # Main process ( spawns backend)
│   └── src/preload.ts       # Preload script (auth API, chat API)
├── packages/
│   ├── types/               # @normie/types - Shared TypeScript types
│   └── utils/               # @normie/utils - Shared utilities
├── apps/
│   ├── web/                 # @normie/web - Frontend (Vite + React)
│   │   └── src/
│   │       ├── components/
│   │       ├── contexts/
│   │       ├── lib/
│   │       └── types/
│   └── server/              # @normie/server - Backend (Express + TypeScript)
│       ├── drizzle.config.ts # Drizzle Kit configuration
│       ├── drizzle/         # Migration files
│       └── src/
│           ├── index.ts     # Main server entry
│           ├── providers/   # AI providers (Claude, Opencode, Kimi, Bedrock)
│           ├── routes/      # API routes
│           ├── services/    # Business logic
│           ├── db/          # Database schema and connection
│           ├── prompts/     # System prompts
│           └── auth/        # Authentication module
├── .env
└── package.json
```

---

## Database Management (Drizzle ORM)

### Schema Changes
1. Edit `apps/server/src/db/schema.ts` - single source of truth
2. Run `pnpm --filter @normie/server db:push` to apply changes to database
3. NEVER edit `schema.sql` or run raw SQL migrations

### Available Scripts
```bash
pnpm --filter @normie/server db:push     # Push schema to DB (development)
pnpm --filter @normie/server db:generate # Generate migration files
pnpm --filter @normie/server db:studio   # Open Drizzle Studio GUI
```

### Schema File
- Location: `apps/server/src/db/schema.ts`
- All tables use Drizzle's `pgTable()` with proper TypeScript types
- Relations defined using `relations()` helper
- Indexes defined in table callbacks

---

## Authentication System

### Architecture
- **Session-based**: Sessions stored in `sessions` table
- **HTTP-only cookies**: `sessionId` (7 days) + `accessToken` (15 min)
- **JWT**: Short-lived access tokens for API authentication
- **Auto-refresh**: Client automatically refreshes via `/api/auth/refresh`

### Auth Flow
1. Login/Register → Creates session + sets cookies
2. API requests include cookies automatically
3. If accessToken expired → Client calls `/api/auth/refresh`
4. If session expired → User redirected to login

### Files
- `auth/index.ts` - Core auth functions (register, login, requireAuth middleware)
- `auth/session.ts` - Session management (create, get, delete)
- `auth/types.ts` - TypeScript types and Express Request extensions
- `routes/auth.ts` - Auth API endpoints

### Protected Routes
Use `requireAuth` middleware:
```typescript
router.get('/protected', requireAuth, async (req, res) => {
  const userId = req.userId; // Set by middleware
});
```

---

## Provider Pattern

All AI providers extend `BaseProvider` and yield normalized chunks:

```typescript
interface StreamChunk {
  type: 'session_init' | 'text' | 'tool_use' | 'tool_result' | 'done' | 'error' | 'aborted';
  provider: string;
  content?: string;
  session_id?: string;
  // ...
}
```

### Provider Files
- `providers/base-provider.ts` - Abstract base class with interfaces
- `providers/claude-provider.ts` - Claude SDK integration
- `providers/opencode-provider.ts` - Opencode SDK integration
- `providers/kimi-provider.ts` - Kimi API integration
- `providers/bedrock-provider.ts` - AWS Bedrock integration
- `providers/mcp-client.ts` - MCP tool client
- `providers/index.ts` - Registry and factory

### Adding a New Provider
1. Create `providers/xxx-provider.ts` extending `BaseProvider`
2. Implement `query()` async generator yielding `StreamChunk`
3. Register in `providers/index.ts`
4. Add models to `apps/web/src/lib/constants.ts`

---

## System Prompt Architecture

Two-layer system:

1. **Application Prompt** (`prompts/system.ts`) - Platform controlled
2. **User's SOUL.md** (stored in `workspace_files` table) - User customizable

Built by `services/context-builder.ts` → prepends Application Prompt to user's SOUL.md, MEMORY.md, AGENTS.md.

---

## Model Preference Persistence

User's preferred provider and model are persisted in localStorage and restored on app load.

### LocalStorage Keys

| Key | Purpose |
|-----|---------|
| `selectedProvider` | User's preferred provider (also used for current chat state) |
| `selectedModel` | User's preferred model (also used for current chat state) |

### Behavior

- **Creating a new chat** → Restores provider/model from localStorage preferences
- **Loading an existing chat** → Updates current state but does NOT overwrite preferences (state is memory-only)
- **Explicitly switching models/providers** → Updates localStorage preferences
- **Invalid preferences** (e.g., removed models) → Cleared automatically with fallback to defaults

### Important Distinction

When loading an old chat, the provider/model state changes to match that chat, but the localStorage preferences are NOT updated. This ensures:
1. Viewing old chats doesn't change your preferred model
2. Creating a new chat always uses your last explicitly selected model

### Validation Functions

```typescript
// Check if a model exists for a provider
isValidModel(provider: Provider, model: string): boolean

// Get preferred provider with validation (clears invalid values)
getPreferredProvider(): Provider

// Get preferred model with validation (clears invalid values)
getPreferredModel(provider: Provider): string
```

---

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/register` | POST | Create account |
| `/api/auth/login` | POST | Login |
| `/api/auth/logout` | POST | Logout |
| `/api/auth/refresh` | POST | Refresh tokens |
| `/api/auth/me` | GET | Get current user |
| `/api/chat` | POST | Stream chat (SSE) |
| `/api/abort` | POST | Cancel query |
| `/api/providers` | GET | List providers |
| `/api/workspaces/*` | - | Workspace CRUD |
| `/api/chats/*` | - | Chat CRUD |
| `/api/memories/*` | - | Memory management |

---

## Code Style

- **Files**: kebab-case (`base-provider.ts`)
- **Classes**: PascalCase (`BaseProvider`)
- **Functions**: camelCase (`getProvider`)
- **Log prefix**: `[ProviderName]` (e.g., `[Bedrock]`, `[Claude]`)
- **ESM imports**: Use `.js` extension for local imports (TypeScript requirement)
- **JWT import**: Use `import jwt from 'jsonwebtoken'` (not `import * as jwt`)

---

## Environment Variables

```bash
ANTHROPIC_API_KEY=       # Claude API key
COMPOSIO_API_KEY=        # Composio API key
KIMI_API_KEY=            # Kimi API key
BEDROCK_API_KEY=         # AWS Bedrock (via Mantle)
DATABASE_URL=            # PostgreSQL connection string (Neon)
JWT_SECRET=              # JWT signing secret
ENCRYPTION_KEY=          # 32-byte encryption key (optional)
PORT=3001                # Server port
```

---

## Database Tables

| Table | Purpose |
|-------|---------|
| `users` | User accounts |
| `sessions` | HTTP-only cookie sessions |
| `workspaces` | User workspaces |
| `workspace_files` | SOUL.md, MEMORY.md, AGENTS.md per workspace |
| `workspace_members` | Workspace membership |
| `workspace_invites` | Team invitations |
| `chats` | Chat sessions |
| `messages` | Chat messages |
| `memories` | Vector-stored memories (pgvector) |
| `daily_notes` | Daily notes per workspace |
| `user_api_keys` | User provider API keys |
| `user_preferences` | User settings |
| `refresh_tokens` | Legacy (being removed) |

---

## Development Commands

```bash
# Start development (Electron mode)
pnpm dev:electron

# Start development (Browser mode)
pnpm dev

# Build frontend
pnpm --filter @normie/web build

# Run database migrations
pnpm --filter @normie/server db:push

# TypeScript check
cd apps/server && npx tsc --noEmit
```

---

## Known Issues

1. ~~No monorepo structure~~ ✅ Done
2. ~~Backend is plain JS~~ ✅ Done (now TypeScript)
3. ~~Raw SQL migrations~~ ✅ Done (now Drizzle ORM)
4. ~~Auth system broken~~ ✅ Done (session-based auth)
5. No tests
6. Express instead of Hono (planned migration)
7. Frontend monolithic - needs modularization

---

## Migration History

### 2026-04-04: Monorepo + TypeScript Migration
- Migrated to pnpm workspaces monorepo structure
- Created `@normie/types` and `@normie/utils` packages
- Converted Electron main/preload to TypeScript
- Converted backend from JavaScript to TypeScript
- Removed raw SQL in favor of Drizzle ORM migrations
- Implemented session-based authentication with httpOnly cookies
- Fixed 24+ TypeScript files
