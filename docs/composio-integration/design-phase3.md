# Design Document: Composio Integration - Phase 3

## Frontend UI & User Experience

**Scope:** Requirements 5, 7 - In-chat connection prompts, tool result display, and error handling UX.

---

## 1. Overview

This phase implements the frontend components for displaying connection-related tool results and errors. Users will see clear, actionable prompts when a toolkit needs to be connected, when a connection has expired, or when a tool execution fails.

Key architectural properties:
- **Distinct visual treatment**: Connection prompts clearly differentiated from regular tool results
- **Electron integration**: OAuth links open in default browser via `shell.openExternal()`
- **Error hierarchy**: Different UI for recoverable errors (connection needed) vs non-recoverable (service down)

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Frontend Tool Result Display                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  StreamChunk ──────► Type Router ──────► Component Render                │
│                           │                                              │
│                           ▼                                              │
│                     ┌─────────────┐                                      │
│                     │ chunk.type  │                                      │
│                     └──────┬──────┘                                      │
│                            │                                             │
│         ┌──────────────────┼──────────────────┐                         │
│         ▼                  ▼                  ▼                         │
│    tool_result      connection_action      tool_result                  │
│    (regular)             (new)            (error)                       │
│         │                  │                  │                         │
│         ▼                  ▼                  ▼                         │
│  CompactToolCall    ConnectionPrompt    ErrorToolResult                 │
│    (existing)        (new)                (new)                         │
│                            │                                             │
│                            ▼                                             │
│                     User clicks link                                     │
│                            │                                             │
│                            ▼                                             │
│                   shell.openExternal(url)                                │
│                            │                                             │
│                            ▼                                             │
│                     Default browser opens                                │
│                     OAuth page loads                                     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Components and Interfaces

### 3.1 ConnectionPrompt Component

```typescript
// apps/web/src/components/chat/ConnectionPrompt.tsx

import type { ConnectionToolResult } from '@normie/types';

export interface ConnectionPromptProps {
  data: ConnectionToolResult;
  onConnect?: (toolkitSlug: string) => void;
}

/**
 * Display connection prompt with toolkit info and OAuth link.
 * Handles both new connections and reconnections.
 */
export function ConnectionPrompt({ data, onConnect }: ConnectionPromptProps): JSX.Element;
```

### 3.2 ConnectionPromptButton Component

```typescript
// apps/web/src/components/chat/ConnectionPromptButton.tsx

export interface ConnectionPromptButtonProps {
  toolkitName: string;
  toolkitSlug: string;
  authUrl: string;
  variant?: 'primary' | 'secondary';
  onConnect?: () => void;
}

/**
 * Clickable button that opens OAuth URL in default browser.
 * Uses Electron's shell.openExternal for cross-platform support.
 */
export function ConnectionPromptButton({
  toolkitName,
  toolkitSlug,
  authUrl,
  variant,
  onConnect
}: ConnectionPromptButtonProps): JSX.Element;
```

### 3.3 ErrorToolResult Component

```typescript
// apps/web/src/components/chat/ErrorToolResult.tsx

import type { ComposioToolError } from '@normie/types';

export interface ErrorToolResultProps {
  error: ComposioToolError;
  toolName: string;
  isStreaming?: boolean;
}

/**
 * Display tool execution error with appropriate guidance.
 * Handles rate limits, service errors, and validation errors.
 */
export function ErrorToolResult({
  error,
  toolName,
  isStreaming
}: ErrorToolResultProps): JSX.Element;
```

### 3.4 Enhanced ToolResultViewer

```typescript
// apps/web/src/components/ToolResultViewer.tsx (modifications)

import type { ConnectionToolResult, ComposioToolError } from '@normie/types';

export interface ToolResultViewerProps {
  result: unknown;
  maxHeight?: number;
  toolName?: string;
}

/**
 * Enhanced to detect connection results and errors,
 * delegating to specialized components.
 */
export function ToolResultViewer({
  result,
  maxHeight,
  toolName
}: ToolResultViewerProps): JSX.Element;

// Internal helper
function isConnectionResult(result: unknown): result is ConnectionToolResult;
function isErrorResult(result: unknown): result is ComposioToolError;
```

### 3.5 Electron Shell Integration

```typescript
// apps/web/src/lib/browser.ts

/**
 * Open URL in default browser.
 * Uses Electron's shell in desktop app, window.open fallback for web.
 */
export function openExternalUrl(url: string): Promise<void>;

/**
 * Check if running in Electron environment.
 */
export function isElectron(): boolean;
```

### 3.6 Toolkit Icons

```typescript
// apps/web/src/components/icons/ToolkitIcons.tsx

export interface ToolkitIconProps {
  slug: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Render toolkit-specific icon with fallback.
 */
export function ToolkitIcon({ slug, size, className }: ToolkitIconProps): JSX.Element;

// Predefined icons for common toolkits
export const TOOLKIT_ICONS: Record<string, React.ComponentType<{ className?: string }>>;
```

---

## 4. Data Models

### 4.1 Frontend Types

```typescript
// packages/types/src/index.ts (additions)

export interface ConnectionToolResult {
  type: 'connection_required' | 'connection_expired' | 'connection_initiated';
  toolkitSlug: string;
  toolkitName: string;
  authUrl: string;
  connectedAccountId: string;
  message: string;
  suggestedActions?: string[]; // What the AI will be able to do
}

export interface ComposioToolError {
  type: 'connection_required' | 'connection_expired' | 'rate_limited' 
      | 'service_unavailable' | 'validation_error' | 'permission_denied';
  toolkitSlug: string;
  toolkitName: string;
  message: string;
  authUrl?: string;
  retryAfter?: number;
  details?: Record<string, unknown>;
}

// Extend StreamChunk
export type StreamChunk =
  | { type: 'connected'; message: string }
  | { type: 'text'; content: string; provider?: string; isReasoning?: boolean }
  | { type: 'tool_call'; toolCallId: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; toolCallId: string; result: unknown; isError?: boolean }
  | { type: 'connection_action'; data: ConnectionToolResult }
  | { type: 'done'; provider?: string }
  | { type: 'error'; message: string; provider?: string }
  | { type: 'aborted'; provider?: string }
  | { type: 'session_init'; session_id: string; provider?: string }
  | { type: 'title_update'; title: string };
```

---

## 5. Correctness Properties

### Property 1: Browser Opening Behavior

_For any_ OAuth URL clicked from a connection prompt, the System SHALL open the URL in the user's default external browser (not an embedded webview or new app window).

**Validates: Requirement 5.2**

### Property 2: Connection Prompt Distinctness

_For any_ `connection_action` stream chunk received, the System SHALL render a visually distinct component from regular tool results, including a clickable button with clear action text.

**Validates: Requirement 5.1**

### Property 3: Retry After Enforcement

_For any_ `rate_limited` error with `retryAfter` set, the System SHALL disable retry UI elements until the specified duration has elapsed.

**Validates: Requirement 7.2**

---

## 6. Data Flow

### 6.1 Connection Prompt Render Flow

1. `chat-stream.service.ts` receives `connection_action` type from tool execution
2. Sends SSE event: `{ type: 'connection_action', data: { type: 'connection_required', toolkitName: 'Gmail', authUrl: 'https://...', ... } }`
3. Frontend `useChatStream` hook receives chunk
4. Passes to `MessageRenderer` → `ToolResultRenderer`
5. `ToolResultRenderer` detects `chunk.type === 'connection_action'`
6. Renders `ConnectionPrompt` component with toolkit name, description, actions, and button
7. User clicks "Connect Gmail" button
8. `ConnectionPromptButton` calls `openExternalUrl(authUrl)`
9. `openExternalUrl` calls `window.electron.shell.openExternal(url)` or `window.open(url)`
10. Default browser opens with OAuth page

### 6.2 Error Display Flow

1. Tool execution fails with rate limit
2. Backend returns `{ type: 'tool_result', result: { type: 'rate_limited', toolkitName: 'Gmail', message: '...', retryAfter: 60 } }`
3. Frontend receives chunk in `InlineToolCall` list
4. `CompactToolCall` renders with error status
5. User expands to see `ErrorToolResult` component
6. Shows "Rate limit reached for Gmail. Please wait 60 seconds before retrying."
7. Optional: countdown timer shows remaining time

---

## 7. Testing Strategy

### 7a. Unit Tests

- `ConnectionPrompt`: Render with various toolkits, verify button click calls `openExternalUrl`
- `ErrorToolResult`: Render with different error types, verify appropriate messaging
- `ToolResultViewer`: Test routing to correct sub-component based on result type
- `browser.ts`: Test `openExternalUrl` in both Electron and non-Electron contexts

### 7b. Integration Tests

- Full flow: Receive `connection_action` SSE → Render prompt → Click button → Verify browser opened
- Error scenarios: Various error types render correctly with actionable guidance

### 7c. Visual Regression Tests

- Snapshot test `ConnectionPrompt` for each supported toolkit (Gmail, Slack, GitHub, etc.)
- Snapshot test `ErrorToolResult` for each error type

---

## 8. File Structure

```
apps/web/src/
├── components/
│   ├── chat/
│   │   ├── ConnectionPrompt.tsx       # [Create] Connection prompt UI
│   │   ├── ConnectionPromptButton.tsx # [Create] OAuth button component
│   │   └── ErrorToolResult.tsx        # [Create] Error display component
│   ├── icons/
│   │   └── ToolkitIcons.tsx           # [Create] Toolkit icon components
│   ├── CompactToolCall.tsx            # [Modify] Handle connection results
│   └── ToolResultViewer.tsx           # [Modify] Route to specialized components
├── hooks/
│   └── useChatStream.ts               # [Modify] Handle connection_action type
└── lib/
    ├── browser.ts                     # [Create] Browser-opening utilities
    └── tool-labels.ts                 # [Modify] Label connection actions

packages/types/src/
└── index.ts                           # [Modify] Add ConnectionToolResult, ComposioToolError
```

| File | Action | Description |
|------|--------|-------------|
| `apps/web/src/components/chat/ConnectionPrompt.tsx` | Create | Main connection prompt component |
| `apps/web/src/components/chat/ConnectionPromptButton.tsx` | Create | OAuth button with Electron integration |
| `apps/web/src/components/chat/ErrorToolResult.tsx` | Create | Tool error display component |
| `apps/web/src/components/icons/ToolkitIcons.tsx` | Create | Toolkit-specific icons |
| `apps/web/src/components/CompactToolCall.tsx` | Modify | Detect and route connection results |
| `apps/web/src/components/ToolResultViewer.tsx` | Modify | Add routing for connection/error types |
| `apps/web/src/hooks/useChatStream.ts` | Modify | Handle `connection_action` chunk type |
| `apps/web/src/lib/browser.ts` | Create | External URL opening utilities |
| `apps/web/src/lib/tool-labels.ts` | Modify | Add labels for `connect_toolkit` |
| `packages/types/src/index.ts` | Modify | Add new types to StreamChunk |

---

## 9. Dependencies

| Package | Version | Why |
|---------|---------|-----|
| `lucide-react` | Already installed | Icons for UI |
| `framer-motion` | Already installed | Animations |

No new dependencies required for Phase 3.