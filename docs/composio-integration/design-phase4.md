# Design Document: Composio Integration - Phase 4

## Workspace Connection Management & Integration

**Scope:** Requirement 8 - Workspace-level connection management including disconnect, permissions, and session integration.

---

## 1. Overview

This phase finalizes the integration by implementing workspace-level connection management, permission controls, and ensuring proper cleanup when connections are removed. It also covers the end-to-end integration testing across all phases.

Key architectural properties:
- **Role-based permissions**: Only owners/admins can manage connections
- **Cleanup cascade**: Disconnecting removes Composio account and invalidates active tools
- **In-use detection**: Warn if disconnecting a toolkit currently in use

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Connection Management Flow                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  List Integrations ◄─── GET /integrations/:workspaceId                  │
│        │                                                                 │
│        ▼                                                                 │
│  ┌─────────────┐                                                        │
│  │ Show list   │                                                        │
│  │ - Status    │                                                        │
│  │ - Created by│                                                        │
│  │ - Date      │                                                        │
│  └──────┬──────┘                                                        │
│         │                                                                │
│         ▼                                                                │
│  Disconnect clicked                                                      │
│         │                                                                │
│         ▼                                                                │
│  ┌─────────────────┐                                                    │
│  │ Role Check      │                                                    │
│  │ owner/admin?    │                                                    │
│  └────────┬────────┘                                                    │
│           │                                                              │
│     ┌─────┴─────┐                                                        │
│     ▼           ▼                                                        │
│    Yes         No                                                        │
│     │           │                                                        │
│     ▼           ▼                                                        │
│  Proceed    403 Forbidden                                               │
│     │                                                                   │
│     ▼                                                                   │
│  DELETE /integrations/:workspaceId/:toolkitSlug                         │
│     │                                                                   │
│     ▼                                                                   │
│  ┌─────────────────┐                                                    │
│  │ Check active    │                                                    │
│  │ chat sessions?  │                                                    │
│  └────────┬────────┘                                                    │
│           │                                                              │
│     ┌─────┴─────┐                                                        │
│     ▼           ▼                                                        │
│    Yes         No                                                        │
│     │           │                                                        │
│     ▼           ▼                                                        │
│  Warn user   Proceed                                                    │
│  or cancel   with delete                                                │
│              │                                                           │
│              ▼                                                           │
│        Delete from Composio                                             │
│              │                                                           │
│              ▼                                                           │
│        Delete from DB                                                   │
│              │                                                           │
│              ▼                                                           │
│        Invalidate tools                                                 │
│        in active sessions                                               │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Components and Interfaces

### 3.1 Integration List API Enhancement

```typescript
// apps/server/src/routes/integrations.ts (modifications)

/**
 * GET /integrations/:workspaceId
 * Enhanced to include toolkit metadata and connection details.
 */
interface IntegrationListResponse {
  integrations: Array<{
    id: string;
    toolkitSlug: string;
    toolkitName: string;
    toolkitDescription?: string;
    toolkitLogo?: string;
    connectionStatus: ConnectionStatus;
    connectedAccountId: string;
    connectedAt: string;
    connectedBy: string;
    connectedByName: string; // Display name
    lastError?: string;
  }>;
}

/**
 * DELETE /integrations/:workspaceId/:toolkitSlug
 * Enhanced with force flag and active session check.
 */
interface DisconnectRequest {
  force?: boolean; // Disconnect even if in use
}

interface DisconnectResponse {
  success: boolean;
  warning?: string; // If sessions were using this toolkit
}
```

### 3.2 Active Session Tracker

```typescript
// apps/server/src/services/active-session-tracker.service.ts

export interface ActiveToolSession {
  chatId: string;
  workspaceId: string;
  toolkitsInUse: Set<string>;
  startedAt: Date;
}

export interface ActiveSessionTracker {
  /**
   * Register a chat session with its active toolkits.
   */
  registerSession(
    chatId: string,
    workspaceId: string,
    toolkits: string[]
  ): void;

  /**
   * Unregister a session when chat ends.
   */
  unregisterSession(chatId: string): void;

  /**
   * Check if a toolkit is in use by any active session.
   */
  isToolkitInUse(workspaceId: string, toolkitSlug: string): boolean;

  /**
   * Get sessions using a specific toolkit.
   */
  getSessionsUsingToolkit(
    workspaceId: string,
    toolkitSlug: string
  ): ActiveToolSession[];
}

export function createActiveSessionTracker(): ActiveSessionTracker;
```

### 3.3 Disconnect Service Enhancement

```typescript
// apps/server/src/services/integration.service.ts (modifications)

export interface DisconnectOptions {
  force?: boolean;
  checkActiveSessions?: boolean;
}

export interface DisconnectResult {
  success: boolean;
  deletedFromComposio: boolean;
  deletedFromDb: boolean;
  warning?: {
    activeSessions: number;
    chatIds: string[];
  };
}

/**
 * Enhanced disconnect with active session check.
 */
export async function disconnectToolkit(
  db: DbClient,
  workspaceId: string,
  toolkitSlug: string,
  options?: DisconnectOptions
): Promise<DisconnectResult>;
```

### 3.4 Session Tool Invalidation

```typescript
// apps/server/src/pi/session-invalidation.ts

/**
 * Invalidate tools for a specific toolkit in an active session.
 * Called when a connection is disconnected.
 */
export function invalidateToolkitTools(
  sessionManager: NormieSessionManager,
  workspaceId: string,
  toolkitSlug: string
): void;

/**
 * Check if a tool call should be rejected due to invalidation.
 */
export function isToolInvalidated(
  toolName: string,
  invalidatedToolkits: Set<string>
): boolean;
```

---

## 4. Data Models

### 4.1 Domain Types (existing)

```typescript
// apps/server/src/db/schema.ts (no changes needed)

// workspaceIntegrations already has all needed fields:
// - toolkitSlug, connectedAccountId, connectionStatus
// - createdBy, createdAt, updatedAt
```

### 4.2 Response Types

```typescript
// apps/server/src/types/integration-responses.ts

export interface IntegrationDetail {
  id: string;
  workspaceId: string;
  toolkit: ToolkitInfo;
  status: ConnectionStatus;
  connectedAccountId: string;
  connectedAt: Date;
  connectedBy: {
    id: string;
    displayName: string | null;
    email: string;
  };
  canDisconnect: boolean; // Based on user role
  isActiveInSessions: boolean;
}

export interface ToolkitInfo {
  slug: string;
  name: string;
  description?: string;
  logo?: string;
  categories?: string[];
}
```

---

## 5. Correctness Properties

### Property 1: Role Enforcement

_For any_ disconnect request from a user with role `member` or `viewer`, the System SHALL reject the request with `ForbiddenError` without making any API calls to Composio.

**Validates: Requirement 8.4**

### Property 2: Composio Cleanup on Disconnect

_For any_ successful disconnect operation, the System SHALL call `connectedAccounts.delete()` on Composio BEFORE deleting the database record, ensuring the connected account is removed from Composio.

**Validates: Requirement 8.3**

### Property 3: DB Record Deletion Guarantee

_For any_ disconnect where Composio deletion fails (network error, not found), the System SHALL still delete the database record to maintain consistency, logging a warning.

**Validates: Requirement 8.3**

### Property 4: Active Session Warning

_For any_ disconnect attempt for a toolkit in use by active chat sessions, the System SHALL return a warning with the list of affected chat IDs unless `force: true` is specified.

**Validates: Requirement 8.5**

---

## 6. Data Flow

### 6.1 List Integrations Flow

1. User navigates to workspace settings → Integrations tab
2. `GET /integrations/:workspaceId` called
3. Backend queries `workspaceIntegrations` for workspace
4. For each integration:
   - Get toolkit metadata from Composio `toolkits.retrieve(slug)` (cached)
   - Get user info for `createdBy`
   - Check active sessions for `isActiveInSessions`
5. Return enriched list with permission flags
6. Frontend renders list with status badges and disconnect buttons

### 6.2 Disconnect Flow (happy path)

1. Owner clicks "Disconnect" on Gmail integration
2. `DELETE /integrations/:workspaceId/gmail` called
3. Check user role → `owner` → allowed
4. Check active sessions → none using gmail
5. Call `composio.connectedAccounts.delete(connectedAccountId)`
6. Delete `workspaceIntegration` record from DB
7. Return `{ success: true }`

### 6.3 Disconnect Flow (in use)

1. Owner clicks "Disconnect" on Slack integration
2. Role check passes
3. Active session check → 2 chats using slack tools
4. Without `force: true`, return warning:
   ```json
   {
     "success": false,
     "warning": {
       "activeSessions": 2,
       "chatIds": ["chat-1", "chat-2"]
     }
   }
   ```
5. User confirms by clicking "Force Disconnect"
6. `DELETE /integrations/:workspaceId/slack?force=true` called
7. Proceeds with disconnect
8. Invalidate tools in active sessions
9. Return `{ success: true, warning: { ... } }`

---

## 7. Testing Strategy

### 7a. Unit Tests

- `active-session-tracker.service.ts`: Session registration, toolkit tracking
- `integration.service.ts`: Disconnect logic with various scenarios
- `session-invalidation.ts`: Tool invalidation behavior

### 7b. Integration Tests

- Full disconnect flow with Composio mock
- Role-based rejection for member/viewer
- Active session warning emission

### 7c. Property-Based Tests

```typescript
// apps/server/__tests__/properties/disconnect-cleanup.test.ts

test('Property 3: DB record deletion guarantee', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        workspaceId: fc.uuid(),
        toolkitSlug: fc.constantFrom('gmail', 'slack'),
        composioDeleteSucceeds: fc.boolean(),
      }),
      async (params) => {
        // Given: Integration exists in DB
        // When: disconnectToolkit called
        // And: Composio delete fails
        // Then: DB record is still deleted
      }
    ),
    { numRuns: 100 }
  );
});
```

---

## 8. File Structure

```
apps/server/src/
├── routes/
│   └── integrations.ts              # [Modify] Enhanced list/disconnect APIs
├── services/
│   ├── integration.service.ts       # [Modify] Disconnect with session check
│   └── active-session-tracker.service.ts # [Create] Track active toolkits
├── pi/
│   ├── session-invalidation.ts      # [Create] Invalidate tools on disconnect
│   └── index.ts                     # [Modify] Wire session tracker
└── types/
    └── integration-responses.ts     # [Create] API response types
```

| File | Action | Description |
|------|--------|-------------|
| `apps/server/src/routes/integrations.ts` | Modify | Enhanced list response, force disconnect, active session check |
| `apps/server/src/services/integration.service.ts` | Modify | Disconnect with session tracking integration |
| `apps/server/src/services/active-session-tracker.service.ts` | Create | Track which toolkits are in use by active sessions |
| `apps/server/src/pi/session-invalidation.ts` | Create | Invalidate tools when connection removed |
| `apps/server/src/pi/index.ts` | Modify | Wire session tracker initialization |
| `apps/server/src/types/integration-responses.ts` | Create | API response type definitions |

---

## 9. Dependencies

No new dependencies for Phase 4.

---

## 10. End-to-End Integration Test Scenarios

### Scenario 1: New User Connection Flow

1. User sends "Send an email to John"
2. AI detects email intent, checks Gmail connection → not found
3. AI invokes `connect_toolkit` for Gmail
4. User clicks OAuth link, completes in browser
5. Connection status updates to ACTIVE
6. User sends "Now send it"
7. AI invokes `GMAIL_SEND_EMAIL` successfully

### Scenario 2: Expired Connection Recovery

1. User sends "What's on my calendar tomorrow?"
2. AI invokes `GOOGLE_CALENDAR_LIST_EVENTS`
3. Execution fails with auth error
4. Integration marked as EXPIRED
5. AI receives error, offers reconnection link
6. User reconnects, status back to ACTIVE
7. AI retries the request successfully

### Scenario 3: Rate Limiting

1. User sends "Email everyone on my team" (bulk email)
2. AI invokes `GMAIL_SEND_EMAIL` multiple times rapidly
3. Composio returns rate limit error after 10 emails
4. AI receives `rate_limited` error with retryAfter
5. AI apologizes and tells user to wait
6. No automatic retry (prevent spam)

### Scenario 4: Admin Disconnects Active Integration

1. Two users have active chats using Slack tools
2. Workspace owner clicks "Disconnect Slack"
3. Warning shown: "2 active chats using Slack"
4. Owner confirms force disconnect
5. Composio account deleted
6. DB record deleted
7. Active chats' Slack tools invalidated
8. Next Slack tool call in those chats fails with clear error