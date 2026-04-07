# Requirements Document: Composio Integration for AI-Powered Tool Execution

## Introduction

This document specifies requirements for integrating Composio into the Normie desktop application, enabling AI assistants to execute real-world actions (sending emails, creating calendar events, posting to Slack, etc.) through natural language conversations.

The integration operates at the **workspace level**, where all workspace members share the same connected accounts. When users request actions that require an unconnected tool (e.g., "Send an email to John"), the AI proactively offers to initiate the OAuth connection flow, returning an authorization URL directly in the chat interface.

The current codebase has foundational pieces in place (database schema, integration service, tool builders). This document focuses on completing the **end-to-end flow**: from user request → AI tool selection → connection handling (unconnected case) → execution → user feedback.

---

## Glossary

| Term | Definition |
|------|------------|
| **Toolkit** | A Composio integration category (e.g., `gmail`, `slack`, `github`, `google_calendar`). Each toolkit contains multiple actions. |
| **Action** | A specific operation within a toolkit (e.g., `GMAIL_SEND_EMAIL`, `SLACK_SEND_MESSAGE`). Actions become AI tools. |
| **Connected Account** | An OAuth-authenticated connection between a workspace and a toolkit. Stored in Composio and referenced by `connectedAccountId`. |
| **Entity ID** | A unique identifier for workspace-user isolation. Format: `ws_{workspaceId}_user_{userId}`. Used by Composio for multi-tenant isolation. |
| **Pi Agent** | The AI orchestration layer that manages model communication, tool execution, and session state. |
| **AgentTool** | A tool definition compatible with Pi Agent SDK, containing name, parameters schema, and execute function. |

---

## Requirements

### Requirement 1: Dynamic Tool Discovery from Connected Integrations

**User Story:** As a user, I want the AI to automatically know what actions it can perform based on my workspace's connected integrations, so that I don't have to explicitly configure available tools.

#### Acceptance Criteria

1. WHEN a chat session starts THEN the System SHALL query `workspaceIntegrations` for all ACTIVE connections in the workspace
2. WHEN active integrations exist THEN the System SHALL fetch available actions from Composio for each connected toolkit and build `AgentTool` definitions
3. WHEN no integrations exist for a workspace THEN the System SHALL still provide built-in tools (coding, web) but no Composio actions
4. WHEN tool building fails for one integration THEN the System SHALL log the error and continue with other integrations without failing the chat session
5. WHEN tools are built THEN the System SHALL include each tool's `connectedAccountId` in its execution context for proper routing

---

### Requirement 2: AI-Initiated Connection Suggestions for Unconnected Tools

**User Story:** As a user, when I request an action that requires an unconnected tool, I want the AI to recognize this and offer to initiate the connection, so I can seamlessly enable the capability without leaving the chat.

#### Acceptance Criteria

1. WHEN the AI determines a user's intent requires a specific toolkit (e.g., Gmail for email) AND that toolkit is NOT connected THEN the System SHALL return a `connection_required` tool result with the toolkit info
2. WHEN a `connection_required` result is returned THEN the System SHALL generate an OAuth authorization URL via `connectedAccounts.create()` with the proper `entityId` and `redirectUri`
3. WHEN generating the OAuth URL THEN the System SHALL open it in the user's default browser (not embedded/in-app)
4. WHEN the OAuth URL is generated THEN the System SHALL display a chat message containing:
   - The toolkit name and description
   - A clickable authorization link
   - Instruction text ("Click to connect your [Toolkit] account")
5. WHEN the OAuth URL generation fails THEN the System SHALL return an error message with guidance for manual retry
6. WHEN the user completes OAuth in the browser THEN the Composio callback SHALL update the `connectedAccount` status to ACTIVE

---

### Requirement 3: Connection Status Tracking and Refresh

**User Story:** As a user, I want the system to accurately track whether my integrations are connected and functional, so the AI doesn't attempt actions with expired credentials.

#### Acceptance Criteria

1. WHEN a new `workspaceIntegration` record is created THEN the System SHALL store `connectedAccountId`, `toolkitSlug`, `connectionStatus`, and `createdBy`
2. WHEN checking connection status before tool execution THEN the System SHALL query Composio's `connectedAccounts.retrieve()` for the current status
3. WHEN the Composio status differs from the stored status THEN the System SHALL update `workspaceIntegrations.connectionStatus` in the database
4. WHEN `connectionStatus` is `EXPIRED` THEN the System SHALL treat the integration as disconnected and offer reconnection
5. WHEN `connectionStatus` is `FAILED` THEN the System SHALL suggest reconnecting and log the failure reason

---

### Requirement 4: Tool Execution with Workspace-Scoped Authentication

**User Story:** As a user, I want tool executions to use my workspace's connected account securely, so that actions are performed with proper authorization and isolation from other workspaces.

#### Acceptance Criteria

1. WHEN a Composio tool is executed THEN the System SHALL use the `execute()` method with the correct `entityId`, `connectedAccountId`, and action parameters
2. WHEN execution succeeds THEN the System SHALL return the result to the AI as a structured tool result containing the action response data
3. WHEN execution fails due to authentication error THEN the System SHALL mark the integration as `EXPIRED` and return a `connection_expired` result suggesting reconnection
4. WHEN execution fails due to rate limiting THEN the System SHALL return a `rate_limited` result with retry guidance
5. WHEN execution fails due to invalid parameters THEN the System SHALL return an error result with parameter validation details for the AI to correct
6. WHEN the abort signal is triggered during execution THEN the System SHALL cancel the pending Composio request and return an `aborted` result

---

### Requirement 5: In-Chat Tool Result Display for Connection Actions

**User Story:** As a user, I want connection-related tool results to be displayed clearly in the chat, so I understand what's happening and can take action.

#### Acceptance Criteria

1. WHEN a `connection_required` result is received THEN the System SHALL render a distinct UI component showing:
   - Toolkit name and icon
   - "Connect your account" message
   - A clickable link that opens the OAuth URL in the default browser
2. WHEN the user clicks the OAuth link THEN the System SHALL use Electron's `shell.openExternal()` to open the URL in the default browser
3. WHEN a `connection_expired` result is received THEN the System SHALL render a "Reconnect" message with a fresh OAuth link
4. WHEN a connection is initiated THEN the System SHALL NOT create a duplicate `workspaceIntegration` record if one already exists (use upsert)
5. WHEN OAuth is completed in the browser THEN the System SHALL NOT automatically refresh the chat UI (user may manually verify connection status)

---

### Requirement 6: Inline Connection Flow from Chat Request

**User Story:** As a user, I want to say "Send an email to John about the meeting" and have the AI guide me through Gmail connection if needed, so I can accomplish tasks without pre-configuration.

#### Acceptance Criteria

1. WHEN the AI receives a message that maps to a toolkit action (intent classification) THEN the System SHALL check if that toolkit is connected for the workspace
2. WHEN the toolkit IS connected THEN the System SHALL proceed with tool execution using the connected account
3. WHEN the toolkit is NOT connected THEN the System SHALL generate a `connection_required` response that includes:
   - The detected toolkit name
   - An explanation of what the AI will be able to do once connected
   - The OAuth authorization link
4. WHEN multiple toolkits could satisfy the request (e.g., Gmail vs Outlook for email) AND none are connected THEN the System SHALL suggest the most common option (Gmail) with an explanation
5. WHEN the user responds to the connection suggestion with "yes" or "connect" THEN the System SHALL have already provided the link (no additional API call needed)
6. WHEN the AI is unsure which toolkit the user wants AND multiple options exist THEN the System SHALL ask for clarification before offering connection

---

### Requirement 7: Error Handling and Recovery in Tool Execution

**User Story:** As a user, when a tool execution fails, I want clear feedback and actionable guidance, so I can either fix the issue or understand what went wrong.

#### Acceptance Criteria

1. WHEN tool execution fails due to invalid action parameters THEN the System SHALL return an error result with specific field-level errors for the AI to correct and retry
2. WHEN tool execution fails due to service unavailability (e.g., Gmail API down) THEN the System SHALL return a `service_unavailable` result with the service name and suggest retrying later
3. WHEN tool execution fails due to permission scope changes (e.g., Gmail app needs re-auth for new scopes) THEN the System SHALL return a `reauth_required` result with a fresh OAuth URL
4. WHEN the AI receives an error result THEN the System SHALL allow the AI to attempt self-correction (fix parameters) before surfacing the error to the user
5. WHEN self-correction fails after 2 attempts THEN the System SHALL surface the error to the user with human-readable explanation
6. WHEN a tool error is surfaced to the user THEN the System SHALL include the error type, message, and suggested next step in the chat display

---

### Requirement 8: Workspace-Level Connection Management

**User Story:** As a workspace member, I want to see and manage the integrations connected to my workspace, so I understand what capabilities are available and can control access.

#### Acceptance Criteria

1. WHEN a user connects a toolkit THEN the System SHALL create a `workspaceIntegration` record with `createdBy` set to the initiating user
2. WHEN a user views workspace integrations THEN the System SHALL display the toolkit name, connection status, connected date, and connected by user
3. WHEN a workspace owner or admin disconnects a toolkit THEN the System SHALL:
   - Delete the connected account from Composio via `connectedAccounts.delete()`
   - Delete the `workspaceIntegration` record from the database
   - Invalidate the tools for that toolkit in active chat sessions
4. WHEN a viewer role user attempts to modify integrations THEN the System SHALL reject the action with a `ForbiddenError`
5. WHEN a toolkit is disconnected WHILE a chat is using a tool from that toolkit THEN the System SHALL fail the execution with `connection_not_found` error

---

## Scope Boundaries

### In Scope
- Dynamic tool discovery from connected Composio integrations
- AI-initiated connection flow with OAuth URL generation
- Workspace-level connection management (single connected account per toolkit per workspace)
- Tool execution with proper entity isolation
- Error handling and user feedback for connection/authentication issues
- In-chat display of connection actions and results

### Out of Scope
- Dedicated Integration Settings page UI (future requirement)
- Per-user connections within a workspace (each workspace member uses the same connection)
- Real-time connection status updates via WebSocket polling
- Tool call persistence to database (separate requirement)
- Automatic token refresh for expiring OAuth sessions (handled by Composio)
- Multi-tenant team workspaces (future requirement)

---

## Non-Functional Requirements

### Performance
- Tool discovery and building SHALL complete within 2 seconds for up to 10 connected integrations
- Individual tool execution SHALL timeout after 30 seconds with a configurable limit
- OAuth URL generation SHALL complete within 1 second

### Security
- OAuth flows SHALL use PKCE where supported by the provider
- `connectedAccountId` and `entityId` SHALL never be exposed to the frontend except through tool results
- Tool execution results SHALL be sanitized to remove sensitive credentials before display

### Reliability
- Failed tool building for one integration SHALL NOT prevent other integrations from loading
- The system SHALL gracefully handle Composio API downtime by falling back to built-in tools only
- Connection status checks SHALL have a 5-second timeout with fallback to cached status

---

## Technical Notes

### Intent-to-Toolkit Mapping
The system needs a way to map user intents to appropriate toolkits when no connection exists. Options:
1. **Keyword-based detection**: "email" → Gmail, "calendar" → Google Calendar, "slack" → Slack
2. **Embedding-based semantic matching**: Match user message to toolkit descriptions
3. **LLM classification**: Ask the model to classify intent before tool selection

The simplest approach is **keyword-based detection** combined with the AI's ability to naturally suggest the right toolkit based on conversation context.

### Connection Tool Architecture
To enable the AI to suggest connections, we need a special tool:

```typescript
{
  name: "connect_toolkit",
  description: "Initiate OAuth connection for a specific toolkit",
  parameters: {
    toolkitSlug: string,  // e.g., "gmail", "slack"
    reason: string        // Why connection is needed (shown to user)
  },
  execute: async (params) => {
    // Generate OAuth URL via Composio
    // Return { type: "connection_required", toolkitName, authUrl }
  }
}
```

This tool is ALWAYS available (even without connections) and allows the AI to proactively offer connection links.