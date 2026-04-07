# Task List: Composio Integration - Phase 4

## Workspace Connection Management & Integration

**Design Doc:** `design-phase4.md`

**Status: ✅ COMPLETED**

---

## Backend Tasks

### 4.1 Response Types

- [x] Create `apps/server/src/types/integration-responses.ts`
  - Define `IntegrationDetail` interface
  - Define `ToolkitInfo` interface (may already exist)
  - Define `DisconnectRequest` interface
  - Define `DisconnectResponse` interface
  - Define `IntegrationListResponse` interface

### 4.2 Active Session Tracker

- [x] Create `apps/server/src/services/active-session-tracker.service.ts`
  - Define `ActiveToolSession` interface
  - Define `ActiveSessionTracker` interface
  - Implement `createActiveSessionTracker()` factory
  - Implement `registerSession(chatId, workspaceId, toolkits)` method
  - Implement `unregisterSession(chatId)` method
  - Implement `isToolkitInUse(workspaceId, toolkitSlug)` method
  - Implement `getSessionsUsingToolkit(workspaceId, toolkitSlug)` method
  - Use in-memory Map for storage (sufficient for single server)

### 4.3 Session Invalidation

- [x] Create `apps/server/src/pi/session-invalidation.ts`
  - Implement `invalidateToolkitTools(sessionManager, workspaceId, toolkitSlug)` function
  - Implement `isToolInvalidated(toolName, invalidatedToolkits)` function
  - Hook into tool execution to check invalidation

### 4.4 Integration Service Enhancement

- [x] Modify `apps/server/src/services/integration.service.ts`
  - Define `DisconnectOptions` interface
  - Define `DisconnectResult` interface
  - Update `disconnectToolkit` function signature:
    - Add `options` parameter
    - Check active sessions before disconnect
    - Return warning if sessions in use and not forced
    - Call Composio `connectedAccounts.delete()`
    - Delete DB record even if Composio fails
    - Log warning if Composio deletion fails
  - Integrate with `ActiveSessionTracker`

### 4.5 Routes Enhancement

- [x] Modify `apps/server/src/routes/integrations.ts`
  - Enhance `GET /:workspaceId` response:
    - Include toolkit metadata (name, description, logo)
    - Include connected by user info
    - Include `canDisconnect` based on user role
    - Include `isActiveInSessions` flag
  - Enhance `DELETE /:workspaceId/:toolkitSlug`:
    - Parse `force` query parameter
    - Check active sessions
    - Return warning if in use and not forced
    - Call disconnect service with options
  - Keep existing `requireWorkspaceAccess` middleware

### 4.6 Session Manager Integration

- [x] Modify `apps/server/src/pi/index.ts`
  - Create `ActiveSessionTracker` instance on server start
  - Pass tracker to `buildWorkspaceTools`
  - Register session when chat starts
  - Unregister session when chat ends
  - Wire up `invalidateToolkitTools` on disconnect

### 4.7 Chat Stream Integration

- [x] Modify `apps/server/src/services/chat-stream.service.ts`
  - After tool building, register active toolkits with session tracker
  - On stream end (success or error), unregister session
  - Handle abort case to unregister session

---

## Testing Tasks

### 4.8 Unit Tests

- [ ] Create `apps/server/__tests__/services/active-session-tracker.service.test.ts`
  - Test session registration and unregistration
  - Test `isToolkitInUse` returns correct status
  - Test `getSessionsUsingToolkit` returns correct sessions
  - Test multiple sessions with same toolkit

- [ ] Create `apps/server/__tests__/pi/session-invalidation.test.ts`
  - Test tool invalidation marks correct toolkits
  - Test `isToolInvalidated` returns correct result
  - Test invalidation doesn't affect other toolkits

- [ ] Create `apps/server/__tests__/services/integration.service-disconnect.test.ts`
  - Test disconnect with no active sessions
  - Test disconnect with active sessions returns warning
  - Test force disconnect proceeds despite active sessions
  - Test Composio delete failure still removes DB record

### 4.9 Property-Based Tests

- [ ] Create `apps/server/__tests__/properties/disconnect-cleanup.test.ts`
  - **Property 1**: Role enforcement
  - **Property 2**: Composio cleanup on disconnect
  - **Property 3**: DB record deletion guarantee
  - Run 100 iterations each

---

## Integration Verification

### 4.10 End-to-End Test Scenarios

- [ ] **Scenario 1: New User Connection Flow**
  - User sends "Send an email to John" (no Gmail connected)
  - AI offers connection with OAuth link
  - User completes OAuth in browser
  - User sends "Now send it"
  - AI executes Gmail tool successfully

- [ ] **Scenario 2: Expired Connection Recovery**
  - User has Gmail connected but expired
  - User sends "Check my emails"
  - Tool execution fails with auth error
  - AI offers reconnection link
  - User reconnects
  - AI retries request

- [ ] **Scenario 3: Rate Limiting**
  - User triggers bulk action
  - Rate limit hit after several calls
  - Error shown with retry guidance
  - No automatic retry

- [ ] **Scenario 4: Admin Disconnects Active Integration**
  - Two users have active Slack chats
  - Owner disconnects Slack
  - Warning shown about active sessions
  - Owner force disconnects
  - Subsequent Slack tool calls fail with clear error

---

## API Documentation

### 4.11 Update API Documentation

- [ ] Document `GET /integrations/:workspaceId` response format
- [ ] Document `DELETE /integrations/:workspaceId/:toolkitSlug` parameters and responses
- [ ] Document error codes and their meanings
- [ ] Add examples for common scenarios

---

## Performance Considerations

### 4.12 Optimization

- [ ] Cache toolkit metadata in memory (refresh daily)
- [ ] Batch Composio API calls where possible
- [ ] Consider Redis for session tracker if scaling to multiple servers

---

## Deployment Checklist

- [ ] Verify Composio API key is set in environment
- [ ] Run database migrations if any schema changes
- [ ] Test with each supported toolkit in staging
- [ ] Monitor Composio API rate limits in production
- [ ] Set up error tracking for Composio failures