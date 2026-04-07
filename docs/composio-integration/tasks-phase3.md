# Task List: Composio Integration - Phase 3

## Frontend UI & User Experience

**Design Doc:** `design-phase3.md`

**Status: ✅ COMPLETED**

---

## Frontend Tasks

### 3.1 Types Package Update

- [x] Modify `packages/types/src/index.ts`
  - Add `ComposioToolError` interface
  - Ensure `ConnectionToolResult` is properly exported
  - Verify `StreamChunk` includes all new types

### 3.2 Browser Integration

- [x] Create `apps/web/src/lib/browser.ts`
  - Implement `openExternalUrl(url: string): Promise<void>`
  - Check for Electron via `window.electron` or `window.require`
  - Use `shell.openExternal()` for Electron
  - Use `window.open()` for web with `_blank` target
  - Implement `isElectron(): boolean` helper

### 3.3 Toolkit Icons

- [x] Create `apps/web/src/components/icons/ToolkitIcons.tsx`
  - Install/verify lucide-react icons available
  - Create icon map for common toolkits:
    - Gmail (Mail icon)
    - Google Calendar (Calendar icon)
    - Slack (MessageSquare icon or custom)
    - GitHub (Github icon from lucide)
  - Implement `ToolkitIcon` component:
    - Accept `slug`, `size`, `className` props
    - Fall back to generic `Puzzle` icon for unknown toolkits
  - Export `TOOLKIT_ICONS` map for direct access

### 3.4 Connection Prompt Components

- [x] Create `apps/web/src/components/chat/ConnectionPrompt.tsx`
  - Import `ConnectionToolResult` type
  - Render layout:
    - Toolkit icon (large)
    - Toolkit name as heading
    - Description text
    - "What you'll be able to do:" + suggested actions list
    - `ConnectionPromptButton` for action
  - Handle both `connection_required` and `connection_expired` types
  - Use distinct styling for expired (warning colors)

- [x] Create `apps/web/src/components/chat/ConnectionPromptButton.tsx`
  - Accept `toolkitName`, `toolkitSlug`, `authUrl`, `variant` props
  - Primary variant: filled button with brand color
  - Secondary variant: outlined button
  - On click: call `openExternalUrl(authUrl)`
  - Show visual feedback (ripple, loading state optional)
  - Display appropriate text:
    - "Connect [Toolkit]" for new connections
    - "Reconnect [Toolkit]" for expired

### 3.5 Error Display Component

- [x] Create `apps/web/src/components/chat/ErrorToolResult.tsx`
  - Accept `error`, `toolName`, `isStreaming` props
  - Render different layouts by error type:
    - `rate_limited`: Show message + countdown if `retryAfter`
    - `service_unavailable`: Show service name + retry suggestion
    - `validation_error`: Show field-level errors if available
    - `permission_denied`: Show required scopes
    - `connection_required`/`connection_expired`: Delegate to `ConnectionPrompt`
  - Use appropriate icon/color per error type

### 3.6 Tool Result Viewer Enhancement

- [x] Modify `apps/web/src/components/ToolResultViewer.tsx`
  - Add type guards:
    - `isConnectionResult(result): result is ConnectionToolResult`
    - `isErrorResult(result): result is ComposioToolError`
  - Route to appropriate component:
    - Connection result → `ConnectionPrompt`
    - Error result → `ErrorToolResult`
    - Regular result → existing JSON/tree renderer

### 3.7 Compact Tool Call Enhancement

- [x] Modify `apps/web/src/components/CompactToolCall.tsx`
  - Detect connection results in `InlineToolCall` type
  - Render `ConnectionPrompt` inline instead of expandable result
  - Handle error states with `ErrorToolResult` in expanded view

### 3.8 Tool Labels Update

- [x] Modify `apps/web/src/lib/tool-labels.ts`
  - Add entry for `connect_toolkit`:
    - Label: "Connect"
    - Verb: "Connecting"
    - PastTense: "Connected"
  - Add entries for common Composio actions (optional, for better display)

### 3.9 Stream Handler Update

- [x] Modify `apps/web/src/hooks/useChatStream.ts`
  - Handle `connection_action` chunk type:
    - Add to tool results map or inline tool calls
    - Trigger re-render of connection prompt
  - Handle `tool_result` with connection/error types

---

## Testing Tasks

### 3.10 Unit Tests

- [ ] Create `apps/web/src/__tests__/lib/browser.test.ts`
  - Test `openExternalUrl` in mocked Electron environment
  - Test `openExternalUrl` in non-Electron environment
  - Test `isElectron` detection

- [ ] Create `apps/web/src/__tests__/components/ConnectionPrompt.test.tsx`
  - Test render with `connection_required` type
  - Test render with `connection_expired` type
  - Test button click calls `openExternalUrl`
  - Test toolkit icon mapping

- [ ] Create `apps/web/src/__tests__/components/ErrorToolResult.test.tsx`
  - Test render for each error type
  - Test rate limit countdown display
  - Test validation error field display

- [ ] Create `apps/web/src/__tests__/components/ToolResultViewer.test.tsx`
  - Test routing to `ConnectionPrompt` for connection results
  - Test routing to `ErrorToolResult` for error results
  - Test regular result rendering unchanged

---

## Visual/Accessibility Tasks

### 3.11 Styling

- [ ] Ensure connection prompt has sufficient visual hierarchy
- [ ] Use brand colors for known toolkits (Gmail red, Slack purple, etc.)
- [ ] Add hover/focus states for connection button
- [ ] Ensure error states use appropriate semantic colors (red for errors, yellow for warnings)

### 3.12 Accessibility

- [ ] Add `aria-label` to connection button
- [ ] Ensure connection prompt is keyboard navigable
- [ ] Add screen reader text for connection status
- [ ] Ensure color is not the only indicator (use icons + color)

---

## Integration Verification

### 3.13 Manual Testing Checklist

- [ ] Connection prompt renders with correct toolkit info
- [ ] Button click opens OAuth URL in system default browser
- [ ] Connection prompt for expired shows "Reconnect" text
- [ ] Rate limit error shows countdown timer
- [ ] Service unavailable error shows retry suggestion
- [ ] Validation errors show field-level details
- [ ] Keyboard navigation works for all interactive elements