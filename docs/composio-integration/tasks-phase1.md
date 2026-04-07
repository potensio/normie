# Task List: Composio Integration - Phase 1

## Tool Discovery & Connection Suggestion System

**Design Doc:** `design-phase1.md`

**Status: ✅ COMPLETED**

---

## Backend Tasks

### 1.1 Intent Detection System

- [x] Create `apps/server/src/services/toolkit-keywords.ts`
  - Define `ToolkitKeywordMapping` interface
  - Add keyword mappings for priority toolkits (Gmail, Google Calendar, Slack, GitHub)
  - Export `TOOLKIT_KEYWORD_MAPPINGS` array
  - Implement `findToolkitByKeyword(message)` function

- [x] Create `apps/server/src/services/intent-detector.ts`
  - Define `IntentDetectionResult` interface
  - Define `IntentDetectorConfig` interface with confidence threshold
  - Implement `detectToolkitIntent(message, config)` function
  - Handle case where no intent detected (return null)
  - Filter results by minimum confidence level

### 1.2 Connect Toolkit Tool

- [x] Create `apps/server/src/types/toolkit.ts`
  - Define `ToolkitInfo` interface
  - Define `ToolkitWithConnection` interface
  - Define `IntentContext` interface

- [x] Create `apps/server/src/pi/tools/connect-toolkit-tool.ts`
  - Define `ConnectToolkitParams` interface
  - Define `ConnectToolkitResult` interface
  - Define `ConnectToolkitToolDeps` interface
  - Implement `createConnectToolkitTool(deps)` function
  - Tool should:
    - Accept `toolkitSlug` and `reason` parameters
    - Check if integration already exists in DB
    - Generate OAuth URL via Composio `connectedAccounts.create()`
    - Upsert `workspaceIntegrations` record with PENDING status
    - Return connection result with authUrl

- [x] Modify `apps/server/src/services/integration.service.ts`
  - Add `initiateConnection(db, workspaceId, userId, toolkitSlug)` helper
  - Extract OAuth URL generation logic for reuse

- [x] Modify `apps/server/src/pi/tools/index.ts`
  - Add `includeConnectToolkit` option to `ToolBuilderOptions`
  - Default `includeConnectToolkit` to `true`
  - Call `createConnectToolkitTool()` and add to tools array if enabled

- [ ] Modify `apps/server/src/pi/tools/composio-tools.ts`
  - Update `buildComposioTools` to check connection status before building
  - Skip building tools for non-ACTIVE integrations
  - Log when tools are skipped due to non-ACTIVE status

### 1.3 Types Package

- [x] Modify `packages/types/src/index.ts`
  - Add `ConnectionToolResult` interface
  - Add `connection_action` to `StreamChunk` union type

---

## Frontend Tasks

### 1.4 Browser Integration

- [x] Create `apps/web/src/lib/browser.ts`
  - Implement `openExternalUrl(url)` function
  - Use Electron's `shell.openExternal()` if available
  - Fall back to `window.open()` for web
  - Implement `isElectron()` helper

### 1.5 Toolkit Icons

- [x] Create `apps/web/src/components/icons/ToolkitIcons.tsx`
  - Define `ToolkitIconProps` interface
  - Import icons for common toolkits (Gmail, Slack, GitHub, etc.)
  - Implement `ToolkitIcon` component with fallback
  - Export `TOOLKIT_ICONS` map

### 1.6 Connection Prompt Component

- [x] Create `apps/web/src/components/chat/ConnectionPrompt.tsx`
  - Define `ConnectionPromptProps` interface
  - Render toolkit icon, name, description
  - Show suggested actions (what AI will be able to do)
  - Include `ConnectionPromptButton` component

- [x] Create `apps/web/src/components/chat/ConnectionPromptButton.tsx`
  - Define `ConnectionPromptButtonProps` interface
  - Implement clickable button that calls `openExternalUrl`
  - Support `primary` and `secondary` variants
  - Visual feedback on hover/click

### 1.7 Stream Handler Update

- [x] Modify `apps/web/src/hooks/useChatStream.ts`
  - Handle `connection_action` chunk type
  - Pass connection data to message renderer
  - Track pending connections in state (optional)

---

## Testing Tasks

### 1.8 Unit Tests

- [ ] Create `apps/server/__tests__/services/toolkit-keywords.test.ts`
  - Test `findToolkitByKeyword` with various messages
  - Test partial keyword matching
  - Test no-match case

- [ ] Create `apps/server/__tests__/services/intent-detector.test.ts`
  - Test intent detection with different confidence levels
  - Test filtering by minimum confidence
  - Test multi-keyword messages

- [ ] Create `apps/server/__tests__/pi/tools/connect-toolkit-tool.test.ts`
  - Test tool parameter validation
  - Test successful connection initiation
  - Test already-connected case
  - Test Composio API error handling

### 1.9 Property-Based Tests

- [ ] Create `apps/server/__tests__/properties/connect-tool-uniqueness.test.ts`
  - **Property 2**: No duplicate connection records
  - Run 100 iterations minimum
  - Test upsert behavior on repeated calls

---

## Integration Verification

### 1.10 Manual Testing Checklist

- [ ] User sends "Send an email to John" with no Gmail connected
- [ ] AI invokes `connect_toolkit` and returns OAuth link
- [ ] Link opens in default browser (not Electron window)
- [ ] User completes OAuth, connection shows in DB
- [ ] User sends "Send an email" again, Gmail tools now available
- [ ] AI successfully executes `GMAIL_SEND_EMAIL`