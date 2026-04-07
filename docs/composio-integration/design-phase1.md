# Design Document: Composio Integration - Phase 1

## Tool Discovery & Connection Suggestion System

**Scope:** Requirements 1, 2, 6 - Dynamic tool discovery, AI-initiated connection suggestions, and inline connection flow.

---

## 1. Overview

This phase implements the foundation for Composio integration: dynamic tool discovery from connected integrations and the AI's ability to suggest connections for unconnected toolkits.

The architecture extends the existing tool building system with a new `connect_toolkit` meta-tool that allows the AI to initiate OAuth flows directly from chat conversations. When a user requests an action requiring an unconnected toolkit (e.g., "Send an email"), the AI can invoke this meta-tool to generate and present an authorization URL.

Key architectural properties:
- **Non-breaking**: Existing tool building for connected integrations remains unchanged
- **Always-available**: The `connect_toolkit` tool is present in every session regardless of connection state
- **Intent-aware**: Keyword-based intent detection maps user messages to likely toolkits

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Chat Request Flow                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  User Message ──────► Intent Detector ──────► Tool Selection             │
│  "Send email"          (optional)              │                         │
│                           │                    │                         │
│                           ▼                    ▼                         │
│                    Toolkit Suggested?    ┌──────────────┐               │
│                           │              │ Has Active   │               │
│                           │              │ Connection?  │               │
│                           │              └──────┬───────┘               │
│                           │                     │                        │
│                     No ◄──┴──► Yes        ┌────┴────┐                   │
│                     (no hint)             │         │                   │
│                                           ▼         ▼                   │
│                                        Yes        No                    │
│                                           │         │                   │
│                                           ▼         ▼                   │
│                                    Execute     Invoke                    │
│                                    Tool      connect_toolkit             │
│                                                          │              │
│                                                          ▼              │
│                                              ┌─────────────────────┐    │
│                                              │ Composio API        │    │
│                                              │ connectedAccounts   │    │
│                                              │ .create()           │    │
│                                              └──────────┬──────────┘    │
│                                                         │               │
│                                                         ▼               │
│                                              ┌─────────────────────┐    │
│                                              │ Return:              │    │
│                                              │ - toolkitName        │    │
│                                              │ - authUrl            │    │
│                                              │ - connectedAccountId │    │
│                                              └─────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Layer Description

| Layer | Owns | Does Not Own |
|-------|------|--------------|
| **Tool Builder** | Constructing `AgentTool[]` from integrations + meta-tools | Execution, persistence |
| **Intent Detector** | Keyword → toolkit mapping | OAuth flow, tool execution |
| **Integration Service** | Composio API calls, DB operations | Tool definitions, UI |
| **Chat Stream Service** | Orchestrating the full flow | Direct Composio calls |

---

## 3. Components and Interfaces

### 3.1 Intent Detector

```typescript
// apps/server/src/services/intent-detector.ts

export interface IntentDetectionResult {
  detected: boolean;
  toolkitSlug: string | null;
  confidence: 'high' | 'medium' | 'low';
  matchedKeywords: string[];
}

export interface IntentDetectorConfig {
  enabled: boolean;
  minConfidence: 'high' | 'medium' | 'low';
}

/**
 * Detect toolkit intent from user message.
 * Uses keyword-based matching against known toolkit patterns.
 */
export function detectToolkitIntent(
  message: string,
  config?: IntentDetectorConfig
): IntentDetectionResult | null;
```

### 3.2 Toolkit Keyword Mappings

```typescript
// apps/server/src/services/toolkit-keywords.ts

export interface ToolkitKeywordMapping {
  toolkitSlug: string;
  toolkitName: string;
  keywords: string[];
  description: string;
  actions: string[]; // Example actions for UI display
}

/**
 * Known toolkit mappings for intent detection.
 * Ordered by likelihood (most common first).
 */
export const TOOLKIT_KEYWORD_MAPPINGS: ToolkitKeywordMapping[] = [
  {
    toolkitSlug: 'gmail',
    toolkitName: 'Gmail',
    keywords: ['email', 'mail', 'gmail', 'send email', 'e-mail'],
    description: 'Send and manage emails',
    actions: ['Send email', 'Search emails', 'Get unread count']
  },
  {
    toolkitSlug: 'google_calendar',
    toolkitName: 'Google Calendar',
    keywords: ['calendar', 'schedule', 'meeting', 'event', 'appointment'],
    description: 'Manage calendar events',
    actions: ['Create event', 'List events', 'Find free time']
  },
  {
    toolkitSlug: 'slack',
    toolkitName: 'Slack',
    keywords: ['slack', 'channel', 'dm', 'message team'],
    description: 'Send Slack messages',
    actions: ['Send message', 'List channels', 'Get user info']
  },
  {
    toolkitSlug: 'github',
    toolkitName: 'GitHub',
    keywords: ['github', 'repo', 'repository', 'issue', 'pr', 'pull request'],
    description: 'Manage GitHub repos and issues',
    actions: ['Create issue', 'List repos', 'Create PR']
  },
  // ... additional toolkits
];

/**
 * Find matching toolkit from message keywords.
 */
export function findToolkitByKeyword(message: string): ToolkitKeywordMapping | null;
```

### 3.3 Connect Toolkit Tool

```typescript
// apps/server/src/pi/tools/connect-toolkit-tool.ts

import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';
import { Type } from '@sinclair/typebox';

export interface ConnectToolkitParams {
  toolkitSlug: string;
  reason: string;
}

export interface ConnectToolkitResult {
  success: boolean;
  toolkitName: string;
  toolkitSlug: string;
  authUrl: string | null;
  connectedAccountId: string | null;
  status: 'connection_initiated' | 'already_connected' | 'error';
  message: string;
}

export interface ConnectToolkitToolDeps {
  workspaceId: string;
  userId: string;
  db: DbClient;
}

/**
 * Create the connect_toolkit meta-tool.
 * This tool is ALWAYS available in sessions, allowing the AI to
 * proactively offer connections for unconnected toolkits.
 */
export function createConnectToolkitTool(deps: ConnectToolkitToolDeps): AgentTool;
```

### 3.4 Enhanced Tool Builder

```typescript
// apps/server/src/pi/tools/index.ts (modifications)

export interface ToolBuilderOptions extends ComposioToolConfig {
  includeCodingTools?: boolean;
  readOnlyMode?: boolean;
  includeWebTools?: boolean;
  includeComposioTools?: boolean;
  includeConnectToolkit?: boolean;  // NEW: Always-available connection tool
  customTools?: AgentTool[];
}

/**
 * Build complete tool set for a workspace.
 * Now includes connect_toolkit by default.
 */
export async function buildWorkspaceTools(options: ToolBuilderOptions): Promise<AgentTool[]>;
```

### 3.5 Connection Tool Result Type

```typescript
// packages/types/src/index.ts (additions)

export interface ConnectionToolResult {
  type: 'connection_required' | 'connection_expired' | 'connection_initiated';
  toolkitSlug: string;
  toolkitName: string;
  authUrl: string;
  connectedAccountId: string;
  message: string;
  expiresAt?: string;
}

// Add to StreamChunk union
export type StreamChunk =
  | { type: 'connected'; message: string }
  | { type: 'text'; content: string; provider?: string; isReasoning?: boolean }
  | { type: 'tool_call'; toolCallId: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; toolCallId: string; result: unknown; isError?: boolean }
  | { type: 'connection_action'; data: ConnectionToolResult }  // NEW
  | { type: 'done'; provider?: string }
  | { type: 'error'; message: string; provider?: string }
  | { type: 'aborted'; provider?: string }
  | { type: 'session_init'; session_id: string; provider?: string }
  | { type: 'title_update'; title: string };
```

---

## 4. Data Models

### 4.1 Domain Types (unchanged)

```typescript
// apps/server/src/db/schema.ts (existing - no changes needed)

// workspaceIntegrations table already has:
// - id, workspaceId, toolkitSlug, connectedAccountId
// - connectionStatus, metadata, createdBy, createdAt, updatedAt
```

### 4.2 Derived Types

```typescript
// apps/server/src/types/toolkit.ts (new file)

export interface ToolkitInfo {
  slug: string;
  name: string;
  description?: string;
  logo?: string;
  categories?: string[];
  isConnected?: boolean;
  connectionStatus?: 'ACTIVE' | 'EXPIRED' | 'FAILED' | 'PENDING' | 'NOT_CONNECTED';
}

export interface ToolkitWithConnection extends ToolkitInfo {
  connectedAccountId?: string;
  connectedAt?: Date;
  connectedBy?: string;
}

export interface IntentContext {
  message: string;
  workspaceId: string;
  connectedToolkits: string[];
  suggestedToolkit?: string;
}
```

---

## 5. Correctness Properties

### Property 1: Connect Tool Always Present

_For any_ chat session initialization, the tool set SHALL contain `connect_toolkit` regardless of connection state.

**Validates: Requirement 2.1, 6.3**

### Property 2: No Duplicate Connection Records

_For any_ `connect_toolkit` invocation for a toolkit that already has a `workspaceIntegration` record, the System SHALL update the existing record (upsert) rather than create a duplicate.

**Validates: Requirement 5.4**

### Property 3: Entity ID Isolation

_For any_ connection initiated via `connect_toolkit`, the `entityId` SHALL be uniquely scoped to `{workspaceId}_{userId}` such that connections from different workspaces are isolated.

**Validates: Requirement 4.1**

### Property 4: Intent Detection Confidence Threshold

_For any_ intent detection with `confidence: 'low'`, the System SHALL NOT auto-suggest a toolkit and instead rely on the AI's natural language understanding.

**Validates: Requirement 6.6**

---

## 6. Error Handling

### 6a. Error Type Catalog

| Error Type | When It Occurs | Detection | Handling |
|------------|----------------|-----------|----------|
| `COMPOSIO_UNAVAILABLE` | Composio API timeout/error | `fetch` throws or returns 5xx | Return error tool result with retry message |
| `TOOLKIT_NOT_FOUND` | Invalid `toolkitSlug` passed to `connect_toolkit` | Composio returns 404 for toolkit | Return error with available toolkits list |
| `AUTH_CONFIG_MISSING` | No auth config for toolkit in Composio | `authConfigs.list()` returns empty | Return error with admin contact suggestion |
| `OAUTH_GENERATION_FAILED` | `connectedAccounts.create()` fails | API returns error | Return error with manual retry guidance |
| `DUPLICATE_CONNECTION` | Connection already in progress | DB has `PENDING` status record | Return existing `authUrl` from DB |

### 6b. Error Recovery Flow

```
[*] → Check DB for existing → Found PENDING? → Return existing authUrl
         │
         ▼ No PENDING
    Call Composio API
         │
    ┌────┴────┐
    ▼         ▼
 Success    Failure
    │         │
    ▼         ▼
 Upsert    Retry once
 DB         │
    │    ┌───┴───┐
    ▼    ▼       ▼
 Return  Success  Return
 result    │      error
           ▼
        Upsert DB
```

---

## 7. Data Flow

### 7.1 Connection Suggestion Flow (Unconnected Toolkit)

1. User sends message: "Send an email to John about the meeting"
2. `intent-detector.ts` analyzes message, detects `gmail` keywords with `high` confidence
3. `buildWorkspaceTools()` builds tools, checking `workspaceIntegrations` for `gmail`
4. Gmail NOT found in connected integrations
5. AI receives prompt + tools including `connect_toolkit`
6. AI determines email intent cannot be fulfilled, invokes `connect_toolkit` with `{ toolkitSlug: 'gmail', reason: 'send email' }`
7. `connect_toolkit.execute()`:
   - Checks DB for existing `gmail` integration → none found
   - Calls `getComposioClient().connectedAccounts.create()` with `entityId: ws_{workspaceId}_user_{userId}`
   - Receives `connectedAccountId` and `redirectUrl`
   - Upserts `workspaceIntegrations` with status `PENDING`
8. Returns `ConnectionToolResult` with `authUrl`
9. `EventAdapter` translates to `{ type: 'connection_action', data: {...} }`
10. Frontend receives stream chunk, renders connection prompt with clickable link
11. User clicks link → Electron opens default browser via `shell.openExternal()`

### 7.2 Already Connected Flow

1. User sends message: "Send an email to John"
2. Intent detection suggests `gmail`
3. `buildWorkspaceTools()` finds `gmail` in `workspaceIntegrations` with status `ACTIVE`
4. `buildComposioTools()` fetches Gmail actions and builds tools with embedded `connectedAccountId`
5. AI receives tools including `GMAIL_SEND_EMAIL`, `GMAIL_SEARCH_EMAILS`, etc.
6. AI invokes `GMAIL_SEND_EMAIL` with parameters
7. Tool executes via Composio `execute()` API
8. Returns result to AI, AI continues conversation

---

## 8. Testing Strategy

### 8a. Unit Tests

- `intent-detector.ts`: Test keyword matching for each toolkit, confidence levels, edge cases
- `toolkit-keywords.ts`: Test `findToolkitByKeyword()` with various message formats
- `connect-toolkit-tool.ts`: Test parameter validation, error handling

### 8b. Property-Based Tests

```typescript
// apps/server/__tests__/properties/connect-tool-uniqueness.test.ts

import * as fc from 'fast-check';

test('Property 2: No duplicate connection records', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        workspaceId: fc.uuid(),
        toolkitSlug: fc.constantFrom('gmail', 'slack', 'github'),
        userId: fc.uuid(),
      }),
      async (params) => {
        // Given: Two consecutive connect_toolkit calls for same toolkit
        // When: Both execute without connection completing
        // Then: Only one workspaceIntegration record exists
      }
    ),
    { numRuns: 100 }
  );
});
```

### 8c. Integration Tests

- Full flow: User message → Intent detection → Tool building → `connect_toolkit` invocation → OAuth URL generation
- Error scenarios: Composio API unavailable, invalid toolkit slug, auth config missing

---

## 9. File Structure

```
apps/server/src/
├── services/
│   ├── intent-detector.ts          # [Create] Keyword-based intent detection
│   ├── toolkit-keywords.ts         # [Create] Toolkit keyword mappings
│   └── integration.service.ts      # [Modify] Add connection helpers
├── pi/
│   └── tools/
│       ├── connect-toolkit-tool.ts # [Create] connect_toolkit meta-tool
│       ├── composio-tools.ts       # [Modify] Pass workspaceId to check connections
│       └── index.ts                # [Modify] Include connect_toolkit by default
└── types/
    └── toolkit.ts                  # [Create] Toolkit-related types

packages/types/src/
└── index.ts                        # [Modify] Add ConnectionToolResult type

apps/web/src/
├── components/
│   └── chat/
│       └── ConnectionPrompt.tsx    # [Create] UI for connection actions
└── lib/
    └── tool-labels.ts              # [Modify] Handle connect_toolkit labeling
```

| File | Action | Description |
|------|--------|-------------|
| `apps/server/src/services/intent-detector.ts` | Create | Keyword-based intent detection logic |
| `apps/server/src/services/toolkit-keywords.ts` | Create | Static toolkit keyword mappings |
| `apps/server/src/services/integration.service.ts` | Modify | Add `initiateConnection()` helper |
| `apps/server/src/pi/tools/connect-toolkit-tool.ts` | Create | `connect_toolkit` meta-tool implementation |
| `apps/server/src/pi/tools/composio-tools.ts` | Modify | Add connection status check before building |
| `apps/server/src/pi/tools/index.ts` | Modify | Include `connect_toolkit` in default tools |
| `apps/server/src/types/toolkit.ts` | Create | Toolkit-related TypeScript types |
| `packages/types/src/index.ts` | Modify | Add `ConnectionToolResult` to `StreamChunk` |
| `apps/web/src/components/chat/ConnectionPrompt.tsx` | Create | UI component for connection prompts |
| `apps/web/src/lib/tool-labels.ts` | Modify | Add labeling for `connect_toolkit` |

---

## 10. Dependencies

| Package | Version | Why |
|---------|---------|-----|
| `@composio/core` | Already installed | Composio SDK |
| `@sinclair/typebox` | Already installed | Tool parameter schemas |

No new dependencies required for Phase 1.