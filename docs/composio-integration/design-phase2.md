# Design Document: Composio Integration - Phase 2

## Tool Execution & Status Management

**Scope:** Requirements 3, 4 - Connection status tracking and secure tool execution.

---

## 1. Overview

This phase implements the execution layer: secure tool invocation with proper authentication routing and connection status management. When the AI invokes a Composio tool, the system must route the request through the correct `connectedAccountId`, handle authentication failures, and keep connection status synchronized between the local database and Composio.

Key architectural properties:
- **Pre-execution validation**: Check connection status before attempting execution
- **Status synchronization**: Keep DB in sync with Composio's actual connection state
- **Error classification**: Distinguish between auth errors, rate limits, and service errors

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Tool Execution Flow                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  AI invokes tool ───► Pre-execution Check ───► Composio execute()       │
│                            │                        │                    │
│                            ▼                        ▼                   │
│                     Check Status              ┌────────────┐            │
│                            │                  │  Result    │            │
│                            ▼                  └─────┬──────┘            │
│                     ┌──────────┐                   │                    │
│                     │ ACTIVE?  │                   ▼                    │
│                     └────┬─────┘         ┌─────────────────┐           │
│                          │               │ Classify Result │           │
│                    ┌─────┴─────┐         └────────┬────────┘           │
│                    ▼           ▼                   │                    │
│                   Yes         No            ┌──────┴──────┐            │
│                    │           │            ▼             ▼            │
│                    │      Return           Success       Error         │
│                    │      connection_        │             │            │
│                    │      required           │      ┌──────┴──────┐    │
│                    │                          │      ▼             ▼    │
│                    │                          │   Auth        Other    │
│                    │                          │   Error       Error    │
│                    │                          │      │             │    │
│                    │                          │      ▼             ▼    │
│                    │                          │  Mark         Return   │
│                    │                          │  EXPIRED      error    │
│                    │                          │      │             │    │
│                    ▼                          │      ▼             │    │
│              Execute via ─────────────────────┴──► Sync          │    │
│              Composio                          │  Status        │    │
│                                                 │               │    │
│                                                 └───────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Components and Interfaces

### 3.1 Enhanced Composio Tool Executor

```typescript
// apps/server/src/pi/tools/composio-tools.ts (modifications)

export interface ComposioToolExecuteContext {
  action: string;
  entityId: string;
  connectedAccountId: string;
  params: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface ComposioToolExecuteResult {
  success: boolean;
  data?: unknown;
  error?: {
    type: 'auth_error' | 'rate_limit' | 'service_error' | 'validation_error' | 'unknown';
    message: string;
    details?: Record<string, unknown>;
  };
  executionTime: number;
}

/**
 * Execute a Composio action with pre-validation and error handling.
 */
export async function executeComposioAction(
  client: Composio,
  context: ComposioToolExecuteContext,
  db: DbClient
): Promise<ComposioToolExecuteResult>;

/**
 * Classify error from Composio execution.
 */
export function classifyComposioError(error: unknown): ComposioToolExecuteResult['error'];
```

### 3.2 Connection Status Manager

```typescript
// apps/server/src/services/connection-status.service.ts

import type { DbClient } from './integration.service.js';

export interface ConnectionStatusCheck {
  isConnected: boolean;
  status: 'ACTIVE' | 'EXPIRED' | 'FAILED' | 'PENDING' | 'NOT_CONNECTED';
  connectedAccountId: string | null;
  toolkitSlug: string;
  lastChecked: Date;
}

export interface ConnectionStatusManager {
  /**
   * Get current connection status, checking Composio API.
   * Updates DB if status has changed.
   */
  checkStatus(
    db: DbClient,
    workspaceId: string,
    toolkitSlug: string
  ): Promise<ConnectionStatusCheck>;

  /**
   * Batch check statuses for multiple integrations.
   */
  checkStatuses(
    db: DbClient,
    workspaceId: string,
    toolkitSlugs: string[]
  ): Promise<Map<string, ConnectionStatusCheck>>;

  /**
   * Mark integration as expired (after auth error).
   */
  markExpired(
    db: DbClient,
    workspaceId: string,
    toolkitSlug: string,
    reason?: string
  ): Promise<void>;

  /**
   * Get cached status without API call (faster, may be stale).
   */
  getCachedStatus(
    db: DbClient,
    workspaceId: string,
    toolkitSlug: string
  ): Promise<ConnectionStatusCheck | null>;
}

export function createConnectionStatusManager(
  composioClient: Composio
): ConnectionStatusManager;
```

### 3.3 Tool Wrapper with Status Check

```typescript
// apps/server/src/pi/tools/composio-tool-wrapper.ts

import type { AgentTool, AgentToolResult } from '@mariozechner/pi-agent-core';

export interface WrappedToolOptions {
  baseTool: AgentTool;
  workspaceId: string;
  toolkitSlug: string;
  connectedAccountId: string;
  db: DbClient;
  statusManager: ConnectionStatusManager;
}

/**
 * Wrap a Composio tool with pre-execution status check.
 * Returns connection_required if status is not ACTIVE.
 */
export function wrapToolWithStatusCheck(
  options: WrappedToolOptions
): AgentTool;
```

### 3.4 Error Result Types

```typescript
// apps/server/src/types/composio-errors.ts

export type ComposioErrorType =
  | 'connection_required'
  | 'connection_expired'
  | 'rate_limited'
  | 'service_unavailable'
  | 'validation_error'
  | 'permission_denied';

export interface ComposioToolError {
  type: ComposioErrorType;
  toolkitSlug: string;
  toolkitName: string;
  message: string;
  authUrl?: string; // For connection_required/expired
  retryAfter?: number; // For rate_limited (seconds)
  details?: Record<string, unknown>;
}

/**
 * Create appropriate tool result for error.
 */
export function createErrorToolResult(
  error: ComposioToolError
): AgentToolResult<unknown>;

/**
 * Check if error requires reconnection.
 */
export function isReconnectableError(error: unknown): boolean;
```

---

## 4. Data Models

### 4.1 Domain Types (modifications)

```typescript
// apps/server/src/db/schema.ts (existing table, show relevant columns)

export const workspaceIntegrations = pgTable('workspace_integrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  toolkitSlug: varchar('toolkit_slug', { length: 100 }).notNull(),
  connectedAccountId: varchar('connected_account_id', { length: 100 }).notNull(),
  connectionStatus: varchar('connection_status', { length: 20 }).default('ACTIVE'),
  // Status values: ACTIVE, EXPIRED, FAILED, PENDING
  metadata: jsonb('metadata').default({}).$type<{
    entityId?: string;
    redirectUrl?: string;
    connectedAt?: string;
    lastError?: string;
    lastErrorAt?: string;
  }>(),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
});
```

### 4.2 Derived Types

```typescript
// apps/server/src/types/connection.ts

export interface ConnectionInfo {
  id: string;
  workspaceId: string;
  toolkitSlug: string;
  toolkitName: string;
  status: ConnectionStatus;
  connectedAccountId: string;
  connectedAt: Date;
  connectedBy: string;
  lastError?: string;
}

export type ConnectionStatus = 'ACTIVE' | 'EXPIRED' | 'FAILED' | 'PENDING' | 'NOT_CONNECTED';

export interface StatusSyncResult {
  toolkitSlug: string;
  previousStatus: ConnectionStatus;
  newStatus: ConnectionStatus;
  changed: boolean;
}
```

---

## 5. Correctness Properties

### Property 1: Status Synchronization

_For any_ connection status check that returns a different status than stored in the database, the System SHALL update the database within the same transaction boundary.

**Validates: Requirement 3.3**

### Property 2: Pre-execution Validation

_For any_ Composio tool execution attempt where `connectionStatus !== 'ACTIVE'`, the System SHALL return a `connection_required` or `connection_expired` result without calling the Composio execute API.

**Validates: Requirement 4.3**

### Property 3: Auth Error Detection

_For any_ Composio execution that returns HTTP 401 or 403, the System SHALL classify the error as `auth_error`, mark the integration as `EXPIRED`, and include a fresh OAuth URL in the result.

**Validates: Requirement 4.3**

### Property 4: Status Check Timeout

_For any_ connection status check via Composio API that exceeds 5 seconds, the System SHALL fall back to the cached database status and log a warning.

**Validates: Non-functional (Reliability)**

---

## 6. Error Handling

### 6a. Error Classification Matrix

| HTTP Status | Error Body Pattern | Classified As | Action |
|-------------|-------------------|---------------|--------|
| 401 | `unauthorized`, `invalid_token` | `auth_error` | Mark EXPIRED, return auth URL |
| 403 | `forbidden`, `insufficient_scope` | `permission_denied` | Return error with scope info |
| 429 | `rate_limit`, `too_many_requests` | `rate_limited` | Return retryAfter hint |
| 500-503 | Any | `service_unavailable` | Suggest retry later |
| 400 | `invalid_parameter`, `validation` | `validation_error` | Return field errors for AI retry |

### 6b. Error Recovery Flow

```
Tool Execution
      │
      ▼
 Check Status ──── Not ACTIVE ──► Return connection_required
      │
      │ ACTIVE
      ▼
 Execute API
      │
  ────┴────
  │       │
  ▼       ▼
Success  Error
  │       │
  ▼       ▼
Return  Classify Error
result    │
          ├──── auth_error ────► Mark EXPIRED, return auth URL
          ├──── rate_limit ────► Return retry hint
          ├──── validation ────► Return field errors
          └──── other ────────► Return generic error
```

---

## 7. Data Flow

### 7.1 Successful Tool Execution Flow

1. AI invokes `GMAIL_SEND_EMAIL` with `{ to: 'john@example.com', subject: 'Meeting', body: '...' }`
2. `wrapToolWithStatusCheck` intercepts execution
3. Calls `statusManager.checkStatus(db, workspaceId, 'gmail')`
4. Status is `ACTIVE`, connectedAccountId retrieved
5. Calls `composioClient.execute({ action: 'GMAIL_SEND_EMAIL', params, entityId, connectedAccountId })`
6. Composio returns success with message ID
7. Returns `{ success: true, data: { messageId: '...' } }`
8. AI receives result and continues conversation

### 7.2 Expired Connection Flow

1. AI invokes `GMAIL_SEND_EMAIL`
2. `wrapToolWithStatusCheck` calls `statusManager.checkStatus()`
3. Composio API returns status `EXPIRED`
4. `statusManager.markExpired()` updates DB
5. Returns `connection_expired` error with fresh OAuth URL
6. AI receives error, apologizes and offers reconnection link

### 7.3 Auth Error During Execution Flow

1. AI invokes `GMAIL_SEND_EMAIL`
2. Status check shows `ACTIVE`
3. Execution proceeds
4. Composio returns HTTP 401: `{ error: 'token_revoked' }`
5. `classifyComposioError` detects `auth_error`
6. `statusManager.markExpired()` updates DB
7. Generates fresh OAuth URL via `connectedAccounts.create()`
8. Returns `connection_expired` with auth URL
9. Frontend displays reconnection prompt

---

## 8. Testing Strategy

### 8a. Unit Tests

- `connection-status.service.ts`: Status checking, caching, expiration marking
- `composio-tool-wrapper.ts`: Wrapper logic, status check branching
- `composio-errors.ts`: Error classification from various HTTP responses

### 8b. Property-Based Tests

```typescript
// apps/server/__tests__/properties/status-sync.test.ts

test('Property 1: Status synchronization', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        workspaceId: fc.uuid(),
        toolkitSlug: fc.constantFrom('gmail', 'slack'),
        storedStatus: fc.constantFrom('ACTIVE', 'EXPIRED', 'PENDING'),
        actualStatus: fc.constantFrom('ACTIVE', 'EXPIRED', 'FAILED'),
      }),
      async (params) => {
        // Given: Stored status differs from actual
        // When: checkStatus is called
        // Then: DB is updated to actual status
        // And: Response reflects actual status
      }
    ),
    { numRuns: 100 }
  );
});
```

### 8c. Integration Tests

- Mock Composio API returning various status codes
- Test full execution flow with status checks
- Test auth error → expiry marking → fresh URL generation

---

## 9. File Structure

```
apps/server/src/
├── services/
│   ├── connection-status.service.ts  # [Create] Status checking/management
│   └── integration.service.ts        # [Modify] Use status manager
├── pi/
│   └── tools/
│       ├── composio-tools.ts         # [Modify] Add executeComposioAction
│       ├── composio-tool-wrapper.ts  # [Create] Status-check wrapper
│       └── composio-errors.ts        # [Create] Error classification/mapping
└── types/
    ├── composio-errors.ts            # [Create] Error types
    └── connection.ts                 # [Create] Connection info types
```

| File | Action | Description |
|------|--------|-------------|
| `apps/server/src/services/connection-status.service.ts` | Create | Connection status checking, caching, sync logic |
| `apps/server/src/services/integration.service.ts` | Modify | Use connection status manager |
| `apps/server/src/pi/tools/composio-tools.ts` | Modify | Add `executeComposioAction` with error handling |
| `apps/server/src/pi/tools/composio-tool-wrapper.ts` | Create | Wrap tools with pre-execution status check |
| `apps/server/src/pi/tools/composio-errors.ts` | Create | Error classification and result creation |
| `apps/server/src/types/composio-errors.ts` | Create | Error type definitions |
| `apps/server/src/types/connection.ts` | Create | Connection info type definitions |

---

## 10. Dependencies

No new dependencies for Phase 2.