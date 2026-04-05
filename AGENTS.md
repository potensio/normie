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
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, TanStack Query |
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
│   ├── src/main.ts          # Main process (spawns backend)
│   └── src/preload.ts       # Preload script (auth API, chat API)
├── packages/
│   ├── types/               # @normie/types - Shared TypeScript types
│   └── utils/               # @normie/utils - Shared utilities
├── apps/
│   ├── web/                 # @normie/web - Frontend (Vite + React)
│   │   └── src/
│   │       ├── components/
│   │       │   ├── chat/    # Chat-specific components (modular)
│   │       │   └── ui/      # Reusable UI components
│   │       ├── contexts/    # React contexts
│   │       ├── hooks/       # Feature-based hooks
│   │       ├── lib/
│   │       │   ├── api/     # Typed API client layer
│   │       │   └── storage.ts # LocalStorage helpers
│   │       ├── styles/      # Design tokens, global CSS
│   │       └── types/
│   └── server/              # @normie/server - Backend (Express + TypeScript)
│       ├── drizzle.config.ts # Drizzle Kit configuration
│       ├── drizzle/         # Migration files
│       └── src/
│           ├── index.ts     # Main server entry
│           ├── providers/   # AI providers (Claude, Opencode, Kimi, Bedrock)
│           ├── routes/      # API routes
│           │   ├── auth.ts
│           │   ├── chats.ts
│           │   ├── workspaces.ts
│           │   ├── memories.ts
│           │   ├── api-keys.ts
│           │   └── integrations.ts  # Composio workspace integrations
│           ├── services/    # Business logic
│           │   ├── context-builder.ts
│           │   ├── embeddings.ts
│           │   ├── memory-search.ts
│           │   └── title-generator.ts  # AI-powered chat titles
│           ├── db/          # Database schema and connection
│           ├── prompts/     # System prompts
│           └── auth/        # Authentication module
├── .env
└── package.json
```

---

## Frontend Architecture

### API Client Layer (`/apps/web/src/lib/api/`)

Centralized typed API client for all backend communication:

```
lib/api/
├── client.ts      # Base fetch wrapper with auth + error handling
├── auth.ts        # Auth API methods
├── chat.ts        # Chat API methods
├── workspace.ts   # Workspace API methods
└── index.ts       # Barrel exports
```

**Usage:**
```typescript
import { chatApi } from '@/lib/api';

const chats = await chatApi.list(workspaceId);
```

### Feature-Based Hooks (`/apps/web/src/hooks/`)

Hooks organized by feature for better separation of concerns:

| Hook | Purpose |
|------|---------|
| `useAuth` | Authentication state and actions |
| `useChats` | Chat list management with TanStack Query |
| `useChatStream` | Streaming chat messages |
| `usePreferences` | Provider/model preferences |
| `useSmartScroll` | Auto-scroll during streaming |
| `useWorkspaces` | Workspace management |

### Chat Components (`/apps/web/src/components/chat/`)

Modular component structure:

| Component | Purpose |
|-----------|---------|
| `ChatInput` | Message input with controls |
| `ChatSidebar` | Chat list and navigation |
| `MarkdownRenderer` | Rich markdown rendering with syntax highlighting |
| `MessageList` | Message display container |
| `StreamingText` | Flowtoken-style smooth streaming animation |
| `AnimatedStream` | Character-by-character animation |

---

## Backend Architecture

### Services Layer (`/apps/server/src/services/`)

| Service | Purpose |
|---------|---------|
| `context-builder.ts` | Builds system prompt from SOUL.md, MEMORY.md, AGENTS.md |
| `embeddings.ts` | Vector embeddings for semantic search |
| `memory-search.ts` | pgvector-powered memory retrieval |
| `title-generator.ts` | AI-powered chat title generation |

### Auto-Generated Chat Titles

- Triggers after first exchange (2 messages)
- Uses same AI provider as the chat
- Sends `title_update` SSE event to frontend
- Fallback: truncated user message (30 chars)

---

## TanStack Query Integration

### Query Client

Located at `/apps/web/src/lib/query-client.ts`

### Cache Keys Pattern

```typescript
const chatKeys = {
  all: ['chats'] as const,
  lists: () => [...chatKeys.all, 'list'] as const,
  list: (workspaceId: string) => [...chatKeys.lists(), workspaceId] as const,
  details: () => [...chatKeys.all, 'detail'] as const,
  detail: (id: string) => [...chatKeys.details(), id] as const,
};
```

### Query Configuration

- **Stale time**: 5 minutes for chat data
- **Cache invalidation**: Automatic on mutations
- **Prefetching**: On hover for instant navigation

---

## Composio Integration System

### Workspace-Isolated Integrations

Each workspace has isolated Composio integrations:

- Entity ID pattern: `ws_{workspaceId}_user_{userId}`
- Stored in `workspace_integrations` table
- Per-workspace connected accounts

### Integration Routes (`/apps/server/src/routes/integrations.ts`)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/integrations/toolkits` | GET | List available toolkits |
| `/api/integrations/:workspaceId` | GET | List workspace integrations |
| `/api/integrations/:workspaceId/connect` | POST | Initiate connection (get auth URL) |
| `/api/integrations/:workspaceId/disconnect` | POST | Disconnect integration |

### Entity Isolation

```typescript
// Workspace-scoped entity for Composio
const entityId = `ws_${workspaceId}_user_${userId}`;
```

---

## Tool Registry System

### Icon Mapping (`/apps/web/src/lib/tool-icons.ts`)

Tools are mapped to icons using a direct registry lookup:

```typescript
export const TOOL_REGISTRY: Record<string, ToolMeta> = {
  Read: { icon: FileText, category: 'file', label: 'Read file' },
  Write: { icon: FilePlus, category: 'file', label: 'Write file' },
  Bash: { icon: Terminal, category: 'shell', label: 'Execute command' },
  // ... more tools
};
```

**Categories:** `file`, `shell`, `search`, `browser`, `communication`, `data`, `utility`, `unknown`

---

## Design System

### Design Tokens (`/apps/web/src/styles/design-tokens.css`)

CSS custom properties for consistent styling:

- **Colors**: Purple scale, neutrals, glass effects
- **Typography**: Inter (primary), Playfair Display (accent)
- **Spacing**: Compact scale based on 15px base
- **Shadows**: Multiple elevation levels

### Tailwind Configuration

Extended with design tokens:

```typescript
// tailwind.config.js extends CSS variables
colors: {
  primary: 'var(--purple-500)',
  background: 'var(--background)',
  // ...
}
```

### Layout Patterns

- **Flex-based layouts** with `shrink-0` for fixed elements
- **`min-h-0` pattern** for nested flex scrolling
- **No `overflow-hidden`** on flex parents of scrollable children

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

### Storage Keys (see `/apps/web/src/lib/storage.ts`)

| Key | Purpose |
|-----|---------|
| `selectedProvider` | User's preferred provider |
| `selectedModel` | User's preferred model |
| `currentChatId` | Currently active chat |

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
| `/api/integrations/*` | - | Composio integrations |

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
| `workspace_integrations` | Composio integrations per workspace |
| `chats` | Chat sessions |
| `messages` | Chat messages |
| `memories` | Vector-stored memories (pgvector) |
| `daily_notes` | Daily notes per workspace |
| `user_api_keys` | User provider API keys |
| `user_preferences` | User settings |

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

## Streaming Architecture

### Flowtoken-Style Animation

The frontend uses a smooth streaming animation system:

1. **Backend sends small chunks** (1-10 characters at a time)
2. **Frontend renders incrementally** with consistent timing
3. **No fancy tricks needed** - simple React rendering suffices

Key insight from `useChatStream.ts`:
> "If your backend sends big chunks infrequently, NO frontend trick will help."

### SSE Events

| Event | Purpose |
|-------|---------|
| `session_init` | New conversation session started |
| `text` | Text chunk |
| `tool_use` | Tool call initiated |
| `tool_result` | Tool execution result |
| `title_update` | Chat title generated |
| `done` | Stream complete |
| `error` | Error occurred |
| `aborted` | User cancelled |

---

## Known Issues

1. ❌ No tests
2. ⚠️ Express instead of Hono (planned migration)

---

## Migration History

### 2025-04-05: UI & Architecture Improvements
- TanStack Query integration for data fetching
- Feature-based hooks refactoring
- Workspace-isolated Composio integrations
- AI-powered chat title generation
- Professional markdown rendering with syntax highlighting
- Design system with CSS tokens
- Flowtoken-style streaming animation

### 2025-04-04: Monorepo + TypeScript Migration
- Migrated to pnpm workspaces monorepo structure
- Created `@normie/types` and `@normie/utils` packages
- Converted Electron main/preload to TypeScript
- Converted backend from JavaScript to TypeScript
- Removed raw SQL in favor of Drizzle ORM migrations
- Implemented session-based authentication with httpOnly cookies
- Fixed 24+ TypeScript files