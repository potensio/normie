# Current File Organization

This document maps the existing codebase structure for reference during refactoring.

---

## Root Structure

```
normie/
├── apps/
│   ├── server/              # Backend (Express 5 + TypeScript)
│   └── web/                 # Frontend (React + Vite)
├── packages/
│   ├── types/               # @normie/types - Shared TypeScript types
│   └── utils/               # @normie/utils - Shared utilities
├── electron/                # Electron main/preload scripts
├── docs/                    # Documentation
├── drizzle/                 # Legacy migrations (now in apps/server/drizzle/)
└── scripts/                 # Build/dev scripts
```

---

## Backend Structure (`apps/server/src/`)

```
apps/server/src/
├── index.ts                 # Express app + routes registration
├── migrate.ts               # DB migration script
│
├── auth/                    # Authentication module
│   ├── index.ts             # Auth functions (register, login, requireAuth)
│   ├── session.ts           # Session management
│   ├── api-keys.ts          # API key encryption/decryption
│   └── types.ts             # Express Request extensions
│
├── db/                      # Database layer
│   ├── index.ts             # Drizzle client
│   ├── init.ts              # DB initialization + vector setup
│   └── schema.ts            # All table definitions + relations
│
├── routes/                  # API endpoints
│   ├── auth.ts              # /api/auth/* (314 lines)
│   ├── chats.ts             # /api/chats/* (863 lines) ⚠️ LARGE
│   ├── workspaces.ts        # /api/workspaces/* (417 lines)
│   ├── memories.ts          # /api/memories/* (366 lines)
│   ├── api-keys.ts          # /api/api-keys/* (67 lines)
│   └── integrations.ts      # /api/integrations/* (243 lines)
│
├── pi/                      # Pi Agent integration (NEW SYSTEM)
│   ├── index.ts             # Main entry point (595 lines) ⚠️ LARGE
│   ├── config.ts            # Provider configuration (196 lines)
│   ├── credentials.ts       # Credential resolution (299 lines)
│   ├── event-adapter.ts     # SSE event translation (329 lines)
│   ├── session-manager.ts   # Session persistence (394 lines)
│   ├── model-registry.ts    # Model info (DELETED?)
│   └── tools/
│       ├── index.ts         # Tool builder (228 lines)
│       ├── composio-tools.ts # Composio integrations (287 lines)
│       └── web-tools.ts     # Web browsing tools (403 lines)
│
├── providers/               # LEGACY - deprecated
│   ├── index.ts             # Stub that throws errors
│   └── bedrock-mantle-provider.ts # Still used by pi/index.ts
│
├── services/                # Business logic services
│   ├── context-builder.ts   # System prompt + history builder
│   ├── embeddings.ts        # Vector embeddings (pgvector)
│   ├── memory-search.ts     # Semantic memory search
│   └── title-generator.ts   # AI-powered chat titles
│
└── prompts/
    └── system.ts            # Default system prompt
```

### Backend Line Counts

| Directory | Lines | Notes |
|-----------|-------|-------|
| routes/   | ~2,270 | Needs middleware extraction |
| pi/       | ~2,831 | Core agent logic |
| auth/     | ~350   | Clean |
| db/       | ~400   | Clean |
| services/ | ~300   | Clean |

---

## Frontend Structure (`apps/web/src/`)

```
apps/web/src/
├── App.tsx                  # Root component
├── main.tsx                 # Entry point
├── Diagnostic.tsx           # Debug component
│
├── components/
│   ├── chat/                # Chat-specific components
│   │   ├── ChatSidebar.tsx      # 451 lines ⚠️ LARGE
│   │   ├── ChatInput.tsx        # 349 lines
│   │   ├── MarkdownRenderer.tsx # 370 lines
│   │   ├── MessageList.tsx      # 51 lines
│   │   ├── MessageItem.tsx      # 122 lines
│   │   ├── StreamingText.tsx    # 87 lines
│   │   ├── AnimatedStream.tsx   # 74 lines
│   │   └── ...                   # Other chat components
│   │
│   ├── settings/            # Provider settings components
│   │   ├── ProvidersTab.tsx
│   │   ├── BedrockProvider.tsx
│   │   ├── OAuthProvider.tsx
│   │   └── ...
│   │
│   ├── ui/                  # Reusable UI components
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Modal.tsx
│   │   └── ...
│   │
│   ├── AuthModal.tsx
│   ├── RightSidebar.tsx
│   ├── SettingsModal.tsx
│   └── ThinkingBlock.tsx
│
├── contexts/
│   ├── AuthContext.tsx      # Auth state + actions
│   └── ChatContext.tsx      # Chat state orchestrator
│
├── hooks/                   # Feature-based hooks
│   ├── index.ts             # Barrel exports
│   ├── useAuth.ts           # Login, logout, register
│   ├── useChats.ts          # Chat list, navigation, CRUD
│   ├── useChatStream.ts     # Streaming messages
│   ├── usePreferences.ts    # Provider/model preferences
│   ├── useProviders.ts      # Available providers
│   ├── useWorkspaces.ts     # Workspace management
│   ├── useApiKeys.ts        # API key management
│   └── useSmartScroll.ts    # Auto-scroll behavior
│
├── lib/
│   ├── api/                 # API client layer
│   │   ├── client.ts        # Base fetch wrapper
│   │   ├── auth.ts          # Auth API
│   │   ├── chat.ts          # Chat API
│   │   ├── workspace.ts     # Workspace API
│   │   ├── providers.ts     # Providers API
│   │   └── index.ts         # Barrel exports
│   │
│   ├── constants.ts         # Provider/model constants
│   ├── providers-config.ts  # Provider metadata
│   ├── query-client.ts      # TanStack Query client
│   ├── storage.ts           # localStorage helpers
│   ├── tool-icons.ts        # Tool icon mapping
│   └── utils.ts             # Utility functions
│
├── pages/
│   └── AuthPage.tsx         # Login/register page
│
├── styles/
│   └── design-tokens.css    # CSS custom properties
│
└── types/
    ├── index.ts             # Frontend-specific types
    └── electron.d.ts        # Electron API types
```

### Frontend Line Counts

| Directory | Lines | Notes |
|-----------|-------|-------|
| components/chat/ | ~1,705 | ChatSidebar needs split |
| hooks/ | ~600 | Clean, well-organized |
| lib/api/ | ~300 | Clean |
| contexts/ | ~200 | Clean |

---

## Shared Packages

### `@normie/types` (`packages/types/src/`)

```
packages/types/src/
└── index.ts                 # All shared types
```

**Key exports:**
- `Provider`, `PiProvider` - Provider types
- `PiModel`, `PiProviderInfo` - Model catalog
- `Message`, `Chat` - Chat types
- `StreamChunk` - SSE event types
- `User`, `Workspace` - Domain types

### `@normie/utils` (`packages/utils/src/`)

```
packages/utils/src/
└── index.ts                 # All shared utilities
```

**Key exports:**
- `generateId()` - UUID v4
- `formatRelativeTime()` - Time formatting
- `transformApiChat()` - API response transformer
- `extractBrowserUrl()` - Browser session URL extraction

---

## Electron (`electron/src/`)

```
electron/src/
├── main.ts                  # Main process (spawns backend)
└── preload.ts               # Preload script (exposes APIs)
```

**Exposed APIs:**
- `window.electronAPI.getCurrentUser()`
- `window.electronAPI.abortCurrentRequest()`
- Cookie management helpers

---

## Database Schema

All 12 tables defined in `apps/server/src/db/schema.ts`:

| Table | Purpose |
|-------|---------|
| `users` | User accounts |
| `sessions` | HTTP-only cookie sessions |
| `refreshTokens` | Legacy - to be removed |
| `userApiKeys` | User provider API keys |
| `userPreferences` | User settings |
| `workspaces` | User workspaces |
| `workspaceMembers` | Workspace membership |
| `workspaceFiles` | SOUL.md, MEMORY.md, AGENTS.md |
| `workspaceInvites` | Team invitations |
| `workspaceIntegrations` | Composio connections |
| `chats` | Chat sessions |
| `messages` | Chat messages |
| `memories` | Vector-stored memories |
| `dailyNotes` | Daily notes per workspace |

---

## Key Architecture Patterns

### 1. Streaming Architecture
```
Frontend (useChatStream.ts)
    ↓ SSE
Backend (routes/chats.ts → /:chatId/stream)
    ↓
Pi Agent (pi/index.ts → runPiQuery)
    ↓
Provider (pi/providers/mantle.ts OR AgentSession)
    ↓
SSE Events → StreamChunk → Frontend
```

### 2. Authentication Flow
```
Login → Create Session (DB) → Set sessionId cookie
      → Generate JWT → Set accessToken cookie
      → Return user
      
API Request → requireAuth middleware
            → Validate session + JWT
            → Attach userId to req
```

### 3. Credential Resolution
```
User sends request with provider
    ↓
resolveCredentials(userId, provider)
    ↓
Check user_api_keys table (user's own key)
    ↓ If not found
Check process.env (owner-configured key)
    ↓
Return ResolvedCredentials
```