# Task List: Composio Integration - Phase 2

## Tool Execution & Status Management

**Design Doc:** `design-phase2.md`

**Status: ✅ COMPLETED**

---

## Backend Tasks

### 2.1 Connection Status Service

- [x] Create `apps/server/src/types/connection.ts`
  - Define `ConnectionInfo` interface
  - Define `ConnectionStatus` type
  - Define `StatusSyncResult` interface

- [x] Create `apps/server/src/services/connection-status.service.ts`
  - Define `ConnectionStatusCheck` interface
  - Define `ConnectionStatusManager` interface
  - Implement `createConnectionStatusManager(composioClient)` factory
  - Implement `checkStatus(db, workspaceId, toolkitSlug)` method:
    - Query DB for integration
    - Call Composio `connectedAccounts.retrieve()`
    - Update DB if status changed
    - Return current status
  - Implement `checkStatuses(db, workspaceId, toolkitSlugs)` for batch checking
  - Implement `markExpired(db, workspaceId, toolkitSlug, reason)` method
  - Implement `getCachedStatus(db, workspaceId, toolkitSlug)` for fast lookup
  - Add 5-second timeout for Composio API calls with fallback to cached status

### 2.2 Composio Error Handling

- [x] Create `apps/server/src/types/composio-errors.ts`
  - Define `ComposioErrorType` union
  - Define `ComposioToolError` interface
  - Export `createErrorToolResult(error)` function
  - Export `isReconnectableError(error)` function

- [x] Create `apps/server/src/pi/tools/composio-errors.ts`
  - Implement error classification logic from HTTP status/body:
    - 401/403 → `auth_error`
    - 429 → `rate_limited`
    - 500-503 → `service_unavailable`
    - 400 with validation → `validation_error`
  - Map error codes to user-friendly messages
  - Extract retryAfter from rate limit headers

### 2.3 Tool Execution Enhancement

- [x] Create `apps/server/src/pi/tools/composio-tool-wrapper.ts`
  - Define `WrappedToolOptions` interface
  - Implement `wrapToolWithStatusCheck(options)` function:
    - Check connection status before execution
    - Return `connection_required` if not ACTIVE
    - Execute tool if ACTIVE
    - Handle execution errors with classification
    - Mark integration EXPIRED on auth errors

- [x] Modify `apps/server/src/pi/tools/composio-tools.ts`
  - Define `ComposioToolExecuteContext` interface
  - Define `ComposioToolExecuteResult` interface
  - Implement `executeComposioAction(client, context, db)` function:
    - Execute via Composio `execute()` API
    - Track execution time
    - Return structured result with error classification
  - Implement `classifyComposioError(error)` function
  - Integrate with `wrapToolWithStatusCheck` in `buildComposioTools`

- [ ] Modify `apps/server/src/services/integration.service.ts`
  - Inject `ConnectionStatusManager` where needed
  - Update `getConnectionStatus` to use status manager

### 2.4 Pre-execution Flow Integration

- [x] Modify `apps/server/src/pi/index.ts`
  - Initialize `ConnectionStatusManager` on server start
  - Pass status manager to `buildWorkspaceTools`

---

## Testing Tasks

### 2.5 Unit Tests

- [ ] Create `apps/server/__tests__/services/connection-status.service.test.ts`
  - Test status checking with fresh data
  - Test status sync when Composio differs from DB
  - Test timeout fallback to cached status
  - Test batch status checking

- [ ] Create `apps/server/__tests__/pi/tools/composio-tool-wrapper.test.ts`
  - Test pre-execution status check blocking
  - Test execution proceeds when ACTIVE
  - Test auth error → expiry marking flow

- [ ] Create `apps/server/__tests__/pi/tools/composio-errors.test.ts`
  - Test error classification for each HTTP status
  - Test rate limit retryAfter extraction
  - Test createErrorToolResult output format

### 2.6 Property-Based Tests

- [ ] Create `apps/server/__tests__/properties/status-sync.test.ts`
  - **Property 1**: Status synchronization
  - Run 100 iterations minimum
  - Verify DB is updated within same logical boundary

- [ ] Create `apps/server/__tests__/properties/pre-execution-validation.test.ts`
  - **Property 2**: Pre-execution validation
  - Verify no Composio execute call when status !== ACTIVE

- [ ] Create `apps/server/__tests__/properties/auth-error-detection.test.ts`
  - **Property 3**: Auth error detection
  - Verify 401/403 marks integration EXPIRED and returns auth URL

---

## Integration Verification

### 2.7 Manual Testing Checklist

- [ ] Invoke Gmail tool with ACTIVE connection → succeeds
- [ ] Invoke tool with EXPIRED connection → returns connection_expired with auth URL
- [ ] Trigger rate limit by rapid requests → shows rate_limited error
- [ ] Simulate Composio API timeout → falls back to cached status
- [ ] Execute tool, get 401 error → integration auto-marked EXPIRED