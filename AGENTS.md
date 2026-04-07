# AGENTS.md

## 1. Stack

| Layer    | Tech                                                            |
| -------- | --------------------------------------------------------------- |
| Desktop  | Electron 39                                                     |
| Frontend | React 18, TypeScript, Vite, Tailwind, TanStack Query            |
| Backend  | Express 5, Node.js ESM, TypeScript                              |
| Database | PostgreSQL (Neon), pgvector, Drizzle ORM                        |
| AI       | Pi Agent (`@mariozechner/pi-ai`, `@mariozechner/pi-agent-core`) |
| Auth     | Session-based JWT + httpOnly cookies                            |

---

## 2. Project Map

```
apps/
├── web/src/           # Frontend
│   ├── components/    # UI (ui/, chat/, settings/)
│   ├── hooks/         # useAuth, useChats, useChatStream, useProviders...
│   ├── lib/           # api/, constants.ts, providers-config.ts, storage.ts
│   └── contexts/      # AuthContext, ChatContext
│
└── server/src/        # Backend
    ├── index.ts       # Express entry, routes registration
    ├── routes/        # auth.ts, chats.ts, workspaces.ts, memories.ts, skills.ts
    ├── services/      # chat-stream.service.ts, chat.service.ts, context-builder.ts
    ├── providers/     # bedrock-mantle-provider.ts (Pi Agent)
    ├── db/            # schema.ts (Drizzle tables)
    ├── middleware/    # errors.ts (AppError classes), resource-access.ts
    └── pi/            # Pi Agent integration, credentials, tools

packages/
├── types/src/index.ts # Shared types: StreamChunk, Message, Chat, Provider...
└── utils/             # Shared utilities

electron/src/          # Electron main/preload
```

---

## 3. Code Patterns & Conventions

**Files:** kebab-case (`chat-stream.service.ts`)
**Classes:** PascalCase (`AppError`)
**Functions:** camelCase (`getProvider`)
**Log prefix:** `[ProviderName]` (e.g., `[Mantle]`)

**ESM imports:** Use `.js` extension for local imports:

```ts
import { foo } from "./bar.js"; // TypeScript requirement
```

**API Client:** Centralized in `apps/web/src/lib/api/`

```ts
import { chatApi } from "@/lib/api";
const chats = await chatApi.list(workspaceId);
```

**TanStack Query keys:**

```ts
const chatKeys = {
  all: ["chats"],
  list: (ws: string) => [...chatKeys.all, "list", ws],
  detail: (id: string) => [...chatKeys.all, "detail", id],
};
```

---

## 4. Error Handling Contract

**Throw specific errors from `middleware/errors.ts`:**

```ts
import {
  NotFoundError,
  ForbiddenError,
  ValidationError,
} from "../middleware/index.js";

if (!chat) throw new NotFoundError("Chat");
if (!membership) throw new ForbiddenError("Access denied");
if (!message) throw new ValidationError("Message required");
```

**Error classes:** `AppError`, `NotFoundError`, `UnauthorizedError`, `ForbiddenError`, `ValidationError`, `ConflictError`, `ServiceUnavailableError`

**Route handler:** Use `asyncHandler` wrapper:

```ts
router.get(
  "/x",
  asyncHandler(async (req, res) => {
    // errors auto-caught and passed to errorHandler
  }),
);
```

---

## 5. Testing Rules

- **Tests: Currently none** (noted as known issue)
- When adding tests: Place in `apps/server/__tests__/` or `apps/web/src/__tests__/`

---

## 6. DB Operation Rules

**Schema:** Single source of truth in `apps/server/src/db/schema.ts`

**Migrations:** Use Drizzle, NEVER raw SQL

```bash
pnpm db:push      # Push schema to DB (dev)
pnpm db:generate  # Generate migration files
pnpm db:studio    # Drizzle Studio GUI
```

**Tables:** `users`, `sessions`, `workspaces`, `workspace_files`, `workspace_members`, `workspace_integrations`, `workspace_skills`, `chats`, `messages`, `memories`, `daily_notes`, `user_api_keys`, `user_preferences`

---

## 7. Git Operation Rules

**NEVER (without explicit request):**

- `git add`, `git commit`, `git push`, `git merge`, `git rebase`, `git reset`

**ALWAYS ALLOWED (read-only):**

- `git status`, `git diff`, `git log`

**ONLY IF EXPLICITLY ASKED:**

- Staging, committing, branching, merging

## 8. Env & Config Rules

**Location:** `.env` at project root

**Key variables:**

```
DATABASE_URL=       # PostgreSQL (Neon)
JWT_SECRET=         # JWT signing
ENCRYPTION_KEY=     # 32-byte key (optional)
PORT=3001

# AI Providers (BYOK)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
BEDROCK_API_KEY=
# ... (see .env.example for full list)

COMPOSIO_API_KEY=   # Tool Router (optional)
```

**Server loads env before imports:**

```ts
dotenv.config({ path: path.join(__dirname, "..", "..", "..", ".env") });
```

---

## 9. Pi Agent Session Management

**Architecture:** Pi Agent handles conversation memory through its built-in session manager.

**Session Storage:**

- Location: `.pi/sessions/{workspaceId}/{chatId}.jsonl`
- Format: JSONL (JSON Lines) for append-only, crash-safe persistence
- Managed by: `NormieSessionManager` wrapper around Pi's `SessionManager`

**How It Works:**

1. Each chat gets a unique session file
2. Pi Agent automatically loads conversation history from the session file
3. New messages are appended to the session file
4. No need to manually pass message history - Pi Agent handles it

**Key Files:**

- `apps/server/src/pi/session-manager.ts` - Session file management
- `apps/server/src/pi/index.ts` - Creates session manager and passes to Pi Agent
- `apps/server/src/services/context-builder.ts` - Builds system context only (not message history)

**Database vs Session Files:**

- **Database (`messages` table):** User-facing message display, search, export
- **Session files (`.pi/sessions/`):** AI conversation memory, managed by Pi Agent
- Both are kept in sync, but serve different purposes

**Important:** Don't manually load message history from DB to pass to Pi Agent - it's redundant and was the old workaround before proper session management was implemented.

---

## 10. Stream Timeout & Reliability

**Problem:** AI streams could hang indefinitely without timeout protection.

**Solution:** Multi-layer timeout protection (see `STREAM_TIMEOUT_FIX.md` for details)

**Timeout Layers:**

| Layer          | Timeout | Purpose                 |
| -------------- | ------- | ----------------------- |
| Stream         | 120s    | Overall stream timeout  |
| Watchdog       | 60s     | Detect stuck streams    |
| Event Loop     | 60s     | Pi Agent activity       |
| Chunk Activity | 60s     | Mantle API activity     |
| Tool Execution | 30s     | Individual tool timeout |

**Key Files:**

- `apps/server/src/services/chat-stream.service.ts` - Stream & watchdog
- `apps/server/src/providers/bedrock-mantle-provider.ts` - Tool & chunk timeouts
- `apps/server/src/pi/index.ts` - Event loop timeout

**Debugging:**

- Check logs for `[STREAM:Watchdog]`, `[PiAgent]`, `[BedrockMantle]` warnings
- All timeouts are configurable (search for `Ms` constants)
- Tool timeouts are graceful (stream continues with error message)

---

## 11. Documentation Rules

**NEVER create documentation files unless explicitly requested:**

- **NO `.md` files** (design docs, READMEs, changelogs, architecture docs, etc.)
- **NO documentation PRs** or inline documentation beyond code comments
- **NO wiki pages** or external documentation platforms

**Exception - ONLY if explicitly asked:**

- When user says: "create doc", "write documentation", "bikin dokumentasi", "buat README", etc.
- When user shares a requirements/spec document and asks to translate it into a design doc

**Code comments are allowed and encouraged:**

- Inline comments explaining complex logic
- JSDoc for public APIs
- TODO/FIXME comments
