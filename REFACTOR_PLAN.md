# Frontend Refactoring Plan

## Overview
Refactor the frontend to use TanStack Query for data fetching, proper separation of concerns, and a clean, testable architecture.

## Target Structure

```
apps/web/src/
├── main.tsx                    # Entry point with providers
├── App.tsx                     # Main app component (routing logic)
│
├── lib/
│   ├── query-client.ts         # TanStack Query client config
│   ├── constants.ts            # App constants (providers, models)
│   ├── utils.ts                # Utility functions
│   └── storage.ts              # localStorage helpers (NEW)
│
├── hooks/                      # Custom hooks (data fetching + UI)
│   ├── index.ts
│   ├── useChats.ts             # Chat queries & mutations
│   ├── useWorkspaces.ts        # Workspace queries & mutations
│   ├── useAuth.ts              # Auth state & operations hook (NEW)
│   ├── useChatStream.ts        # Streaming logic hook (NEW)
│   └── usePreferences.ts       # Provider/model preferences (NEW)
│
├── contexts/                   # Only for cross-cutting state
│   ├── AuthContext.tsx         # Simplified - only auth state
│   └── ChatContext.tsx         # Simplified - streaming state only
│
├── components/
│   ├── ui/                     # Reusable UI primitives (NEW)
│   │   ├── Button.tsx
│   │   ├── Dropdown.tsx
│   │   ├── Modal.tsx
│   │   └── Input.tsx
│   │
│   ├── chat/                   # Chat-specific components
│   │   ├── ChatInput.tsx
│   │   ├── ChatSidebar.tsx
│   │   ├── MessageList.tsx
│   │   ├── MessageItem.tsx     # Extracted from MessageList
│   │   ├── InlineToolCall.tsx
│   │   └── ThinkingBlock.tsx
│   │
│   ├── workspace/              # Workspace components
│   │   └── WorkspaceDropdown.tsx
│   │
│   ├── settings/               # Settings components
│   │   └── SettingsModal.tsx
│   │
│   └── auth/                   # Auth components
│       └── AuthModal.tsx
│
├── pages/                      # Page-level components (NEW)
│   ├── HomePage.tsx            # Home view (no active chat)
│   └── ChatPage.tsx            # Active chat view
│
└── types/
    ├── index.ts                # Shared types (re-export from @normie/types)
    └── electron.d.ts           # Electron API types
```

---

## Phase 1: Foundation (Setup & Hooks)

### Task 1.1: Create localStorage helpers
**File:** `lib/storage.ts`

Create centralized localStorage helpers:
- `getPreferredProvider()` / `setPreferredProvider()`
- `getPreferredModel()` / `setPreferredModel()`
- `getCurrentChatId()` / `setCurrentChatId()`
- Clear invalid values on get

### Task 1.2: Complete TanStack Query hooks
**Files:** `hooks/useChats.ts`, `hooks/useWorkspaces.ts`

Already started. Complete with:
- Proper error handling
- Optimistic updates where applicable
- Cache invalidation patterns

### Task 1.3: Create preference hooks
**File:** `hooks/usePreferences.ts`

Handle provider/model selection:
- Read from localStorage
- Provide setters that update localStorage
- Auto-clear invalid values

### Task 1.4: Create auth hook
**File:** `hooks/useAuth.ts`

Wrap AuthContext with TanStack Query for:
- Login/Register mutations
- Session check on mount
- Workspace switching with cache invalidation

---

## Phase 2: Context Simplification

### Task 2.1: Refactor ChatContext
**File:** `contexts/ChatContext.tsx`

Extract everything except:
- `currentChat` (active chat state)
- `messages` (current messages)
- `todos` / `toolCalls` (streaming state)
- `isStreaming` / `isLoading`
- Streaming methods (sendMessage, stopStreaming)

Move to hooks:
- Chats list → `useChats`
- Provider/model → `usePreferences`
- localStorage → `lib/storage`

### Task 2.2: Refactor AuthContext
**File:** `contexts/AuthContext.tsx`

Simplify to only:
- `user` state
- `currentWorkspace` state
- `workspaces` state (from useWorkspaces hook)
- Switch workspace method

Move to hooks:
- Login/Register → `useAuth` hook with mutations
- Workspace creation → `useWorkspaces`

---

## Phase 3: Component Restructuring

### Task 3.1: Create UI primitives
**Files:** `components/ui/*.tsx`

Extract reusable components:
- `Dropdown.tsx` - Base dropdown with outside click handling
- `Modal.tsx` - Base modal with portal
- Button, Input as needed

### Task 3.2: Refactor dropdown components
**Files:** `ModelDropdown.tsx`, `ProviderDropdown.tsx`, `WorkspaceDropdown.tsx`

Use:
- Base `Dropdown` component
- `usePreferences` hook
- `useWorkspaces` hook

### Task 3.3: Extract MessageItem
**File:** `components/chat/MessageItem.tsx`

Extract from MessageList to simplify testing.

### Task 3.4: Organize components into folders
Move existing components into organized structure:
- chat/ → ChatInput, ChatSidebar, MessageList, etc.
- workspace/ → WorkspaceDropdown
- settings/ → SettingsModal
- auth/ → AuthModal

---

## Phase 4: Page Components & App Simplification

### Task 4.1: Create HomePage
**File:** `pages/HomePage.tsx`

Extract home view logic from App.tsx.

### Task 4.2: Create ChatPage
**File:** `pages/ChatPage.tsx`

Extract chat view logic from App.tsx.

### Task 4.3: Simplify App.tsx
Remove inline JSX, use page components.

---

## Phase 5: Streaming Hook

### Task 5.1: Create useChatStream hook
**File:** `hooks/useChatStream.ts`

Extract streaming logic from ChatContext:
- SSE parsing
- Message accumulation
- Tool call tracking
- Error handling

This hook can be used in ChatContext or directly in ChatPage.

---

## Execution Order for Subagents

Each task is designed to be independently executable:

| Phase | Task | Dependencies | Estimated Time |
|-------|------|--------------|----------------|
| 1.1 | storage.ts | None | 15 min |
| 1.3 | usePreferences.ts | 1.1 | 20 min |
| 1.2 | useChats/useWorkspaces | None | 30 min |
| 1.4 | useAuth.ts | None | 25 min |
| 2.1 | ChatContext refactor | 1.1, 1.2, 1.3 | 45 min |
| 2.2 | AuthContext refactor | 1.4 | 30 min |
| 3.1 | UI primitives | None | 30 min |
| 3.2 | Dropdown refactor | 3.1, 1.3 | 25 min |
| 3.3 | MessageItem extract | None | 20 min |
| 3.4 | Component reorganization | None | 15 min |
| 4.1-4.3 | Page components | 2.1, 2.2 | 30 min |
| 5.1 | useChatStream | 2.1 | 40 min |

---

## Testing Strategy

After each phase:
1. Run `pnpm --filter @normie/web exec tsc --noEmit`
2. Smoke test in browser
3. Check workspace switching works
4. Check chat creation/loading works

## Success Criteria

- [ ] No file over 200 lines (except ChatContext which can be ~250)
- [ ] All data fetching via TanStack Query hooks
- [ ] Contexts only handle local state, not data fetching
- [ ] Components organized by feature
- [ ] UI primitives reusable
- [ ] TypeScript compiles with no errors
- [ ] Workspace switching works reliably