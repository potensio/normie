# Composio Meta-Tools Implementation

## Overview

Successfully implemented Composio's meta-tools pattern to provide AI awareness of 1000+ integrations while keeping token usage minimal.

## What Changed

### Before (Direct Tool Loading)

- Loaded 1000+ tool definitions upfront
- Token usage: ~55K tokens just for tool definitions
- AI had all tools in context but at massive token cost
- Required listing all toolkits explicitly

### After (Meta-Tools Pattern)

- Provides 3 meta-tools for discovery, auth, and execution
- Token usage: <1K tokens for meta-tools
- AI discovers tools on-demand based on user intent
- Supports all 1000+ integrations without listing them

## The 3 Meta-Tools

### 1. composio_search_tools

**Purpose:** Discover relevant tools based on natural language queries

**Usage:**

```typescript
composio_search_tools({
  queries: ["create github issue", "send email via gmail"],
});
```

**Returns:**

- 5-10 most relevant tools per query
- Tool schemas with parameters
- Connection status (connected/not connected)
- Toolkit information

**Implementation:** `apps/server/src/pi/tools/composio-tools.ts:createSearchToolsMetaTool()`

### 2. composio_manage_connections

**Purpose:** Handle OAuth authentication and connection status

**Usage:**

```typescript
// Check status
composio_manage_connections({
  toolkits: ["github", "gmail"],
  action: "check_status",
});

// Get connection URL
composio_manage_connections({
  toolkits: ["github"],
  action: "get_connection_url",
});
```

**Returns:**

- Connection status for each toolkit
- OAuth URLs when needed
- Connected account IDs
- User-friendly connection instructions

**Implementation:** `apps/server/src/pi/tools/composio-tools.ts:createManageConnectionsMetaTool()`

### 3. composio_execute_tool

**Purpose:** Execute tools discovered via composio_search_tools

**Usage:**

```typescript
composio_execute_tool({
  tool: "GITHUB_CREATE_ISSUE",
  parameters: {
    owner: "myorg",
    repo: "myrepo",
    title: "Bug: Login fails",
    body: "Description of the bug...",
  },
});
```

**Returns:**

- Tool execution results
- Helpful error messages with connection guidance
- Execution time and status

**Implementation:** `apps/server/src/pi/tools/composio-tools.ts:createExecuteToolMetaTool()`

## AI Workflow

### Example: Creating a GitHub Issue

**User:** "Create a GitHub issue for the login bug"

**AI Workflow:**

1. **Discovery Phase**

   ```
   AI → composio_search_tools({ queries: ["create github issue"] })
   ← Returns: GITHUB_CREATE_ISSUE tool with schema
   ```

2. **Execution Attempt**

   ```
   AI → composio_execute_tool({
     tool: "GITHUB_CREATE_ISSUE",
     parameters: {...}
   })
   ← Error: Connection required
   ```

3. **Authentication Phase**

   ```
   AI → composio_manage_connections({
     toolkits: ["github"],
     action: "get_connection_url"
   })
   ← Returns: OAuth URL
   AI → User: "Please connect your GitHub account: [URL]"
   ```

4. **Retry After Connection**
   ```
   User connects account
   AI → composio_execute_tool({
     tool: "GITHUB_CREATE_ISSUE",
     parameters: {...}
   })
   ← Success: Issue #42 created
   ```

## System Prompt Updates

Updated `apps/server/src/prompts/system.ts` to guide AI on using meta-tools:

**Key Additions:**

- Explanation of the 3 meta-tools
- Workflow examples
- Guidelines for discovery-first approach
- Instructions for handling authentication errors
- Emphasis on proactive tool discovery

**Guidelines for AI:**

- ALWAYS use composio_search_tools first to discover tools
- DON'T assume tool names - search for them
- DON'T say "I cannot access X" - search for tools first
- When auth is needed, use composio_manage_connections
- Present connection links clearly to users
- After user connects, retry the operation

## Token Efficiency Comparison

| Approach           | Tools in Context | Token Usage | Discovery |
| ------------------ | ---------------- | ----------- | --------- |
| **Direct Loading** | 1000+ tools      | ~55K tokens | Static    |
| **Meta-Tools**     | 3 meta-tools     | <1K tokens  | Dynamic   |

**Savings:** ~54K tokens per conversation = ~98% reduction

## Supported Integrations

The meta-tools pattern provides access to 1000+ integrations including:

- **Email & Communication:** Gmail, Outlook, Slack, Discord, Teams, Telegram, Zoom
- **Development:** GitHub, GitLab, Bitbucket, CircleCI, Jenkins
- **Calendar:** Google Calendar, Outlook Calendar, Calendly
- **Project Management:** Jira, Linear, Asana, Trello, Monday, ClickUp
- **Documentation:** Notion, Confluence, Coda, Airtable
- **CRM:** HubSpot, Salesforce, Pipedrive, Zendesk, Intercom
- **Storage:** Google Drive, Dropbox, OneDrive, Box
- **Social Media:** Twitter/X, LinkedIn, Facebook, Instagram
- **Finance:** Stripe, PayPal, QuickBooks
- **Analytics:** Google Analytics, Mixpanel, Amplitude, Datadog
- **Marketing:** Mailchimp, SendGrid, Twilio
- **HR:** Greenhouse, Lever, BambooHR
- **Design:** Figma, Canva
- **And 980+ more...**

## Files Modified

1. **apps/server/src/pi/tools/composio-tools.ts**
   - Replaced direct tool loading with meta-tools implementation
   - Added 3 meta-tool creators
   - Added toolkit extraction logic
   - Kept backward compatibility functions (marked as deprecated)

2. **apps/server/src/prompts/system.ts**
   - Updated system prompt with meta-tools guidance
   - Added workflow examples
   - Added integration categories
   - Emphasized discovery-first approach

3. **AGENTS.md**
   - Added section 10: Composio Integration (Meta-Tools Pattern)
   - Documented the 3 meta-tools
   - Explained token efficiency
   - Provided workflow examples

## Testing

To test the implementation:

1. **Test Discovery:**

   ```
   User: "What integrations do you have access to?"
   Expected: AI uses composio_search_tools to discover available integrations
   ```

2. **Test Execution (Connected):**

   ```
   User: "Create a GitHub issue"
   Expected: AI searches for tool, executes it successfully
   ```

3. **Test Authentication Flow:**

   ```
   User: "Send an email via Gmail" (not connected)
   Expected: AI attempts execution, gets auth error, provides connection link
   ```

4. **Test Multi-Step Workflow:**
   ```
   User: "Schedule a meeting and send a Slack notification"
   Expected: AI discovers both tools, handles auth for each, executes in sequence
   ```

## Benefits

1. **Token Efficiency:** 98% reduction in token usage for tool definitions
2. **Scalability:** Supports 1000+ integrations without context bloat
3. **Flexibility:** AI discovers tools based on user intent, not predefined lists
4. **User Experience:** Seamless OAuth flow with clear connection instructions
5. **Maintainability:** No need to update tool lists as Composio adds new integrations

## Future Enhancements

1. **Caching:** Cache search results to reduce API calls
2. **Smart Suggestions:** Suggest relevant integrations based on workspace context
3. **Batch Operations:** Support executing multiple tools in parallel
4. **Connection Management UI:** Build frontend for managing connections
5. **Usage Analytics:** Track which integrations are most used

## Conclusion

The meta-tools pattern successfully provides AI awareness of 1000+ integrations while keeping token usage minimal. The AI can now discover, authenticate, and execute tools dynamically based on user intent, providing a seamless experience for users.
