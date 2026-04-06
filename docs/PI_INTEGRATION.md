# Pi Agent Integration in Normie

This document explains how Normie integrates with the Pi Coding Agent framework.

## Overview

Normie uses Pi as its AI agent framework, providing two paths for AI interaction:

| Path | Description | Tools Support |
|------|-------------|---------------|
| **Pi Agent SDK** | Standard path via `createAgentSession()` | Full (tools, extensions, skills) |
| **Bedrock Mantle** | Custom provider for AWS Bedrock Mantle API | Full (tools added, no extensions/skills) |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Normie Backend                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐     ┌──────────────────────────────────┐  │
│  │   routes/chats.ts │────▶│         pi/index.ts              │  │
│  │   /stream API     │     │    runPiQuery()                  │  │
│  └──────────────────┘     └─────────────┬────────────────────┘  │
│                                         │                       │
│                           ┌─────────────┴─────────────┐         │
│                           │                           │         │
│                           ▼                           ▼         │
│               ┌───────────────────┐     ┌────────────────────┐  │
│               │  Bedrock Mantle?  │     │  Pi Agent SDK      │  │
│               │                   │     │  createAgentSession│  │
│               └─────────┬─────────┘     └─────────┬──────────┘  │
│                         │                         │             │
│                         ▼                         ▼             │
│            ┌────────────────────────┐  ┌─────────────────────┐  │
│            │ bedrock-mantle-        │  │  AgentSession       │  │
│            │ provider.ts            │  │  (Pi SDK native)    │  │
│            │ (custom OpenAI compat) │  │                     │  │
│            └────────────┬───────────┘  └──────────┬──────────┘  │
│                         │                         │             │
│                         └────────────┬────────────┘             │
│                                      │                          │
│                                      ▼                          │
│                          ┌───────────────────────�              │
│                          │   buildWorkspaceTools │              │
│                          │   - codingTools       │              │
│                          │   - webTools          │              │
│                          │   - composioTools     │              │
│                          └───────────────────────┘              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Configuration

### `~/.pi/agent/models.json` (User's Pi Config)

Pi supports custom providers via `models.json`. This is how Bedrock Mantle is configured for the standalone Pi TUI:

```json
{
  "providers": {
    "bedrock": {
      "name": "AWS Bedrock",
      "api": "openai-completions",
      "baseUrl": "https://bedrock-mantle.ap-southeast-3.api.aws/v1",
      "apiKey": "ABSKQmVkcm9ja0FQSUtleS0...",
      "compat": {
        "supportsDeveloperRole": false,
        "supportsReasoningEffort": false
      },
      "models": [
        {
          "id": "zai.glm-5",
          "name": "GLM-5",
          "contextWindow": 128000,
          "maxTokens": 4096,
          "reasoning": true
        },
        {
          "id": "moonshotai.kimi-k2.5",
          "name": "Kimi K2.5",
          "contextWindow": 128000,
          "maxTokens": 4096,
          "reasoning": false
        }
      ]
    }
  }
}
```

### `~/.pi/agent/settings.json` (User's Pi Settings)

```json
{
  "defaultProvider": "bedrock",
  "defaultModel": "zai.glm-5",
  "theme": "purple",
  "defaultThinkingLevel": "medium",
  "extensions": [
    "~/.pi/agent/extensions/custom-footer-auto.ts"
  ]
}
```

When running Pi as a TUI (terminal app), it reads these files and uses the configured provider.

### Normie's `pi/config.ts` (Server-Side Config)

Normie maintains its own configuration that works independently:

```typescript
// Environment variables
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
BEDROCK_API_KEY=ABSKQ...
BEDROCK_BASE_URL=https://bedrock-mantle.ap-southeast-3.api.aws/v1

// Provider aliases (mapping Normie names to Pi names)
export const PROVIDER_ALIAS: Record<string, string> = {
  bedrock: "amazon-bedrock",
  azure: "azure-openai-responses",
};
```

## Two Integration Paths

### Path 1: Pi Agent SDK (Standard)

Used for: Anthropic, OpenAI, Google, and other standard providers.

```typescript
// pi/index.ts
const result = await createAgentSession({
  authStorage,           // API keys injected
  model: piModel,        // Model from registry
  thinkingLevel: 'medium',
  tools: tools,          // codingTools, webTools
  customTools: [],
});

session = result.session;

// Subscribe to events
session.subscribe((event: AgentSessionEvent) => {
  // Handle: agent_start, message_update, tool_execution_start, tool_execution_end, agent_end
});

// Send prompt
await session.prompt(userMessage);
```

**Benefits:**
- Full Pi SDK features
- Extensions support (from `~/.pi/agent/extensions/`)
- Skills support (from `~/.pi/agent/skills/`)
- Session management (branching, compaction)
- Built-in tool orchestration

### Path 2: Bedrock Mantle (Custom Provider)

Used for: AWS Bedrock Mantle API (OpenAI-compatible endpoint for models like GLM-5, Kimi K2.5).

```typescript
// pi/index.ts - detects Mantle provider
if (isMantle) {
  const mantleConfig = {
    ...getBedrockMantleConfig(),
    model: piModel.id,
    tools,  // Tools passed to enable function calling
  };
  
  for await (const chunk of streamBedrockMantle(mantleConfig, messages, signal)) {
    yield chunk;
  }
}
```

The custom provider implements **agentic loop for tool calling**:

```typescript
// bedrock-mantle-provider.ts
while (iteration < maxIterations) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    body: JSON.stringify({
      model,
      messages,
      tools: toolDefinitions,  // OpenAI tool format
      tool_choice: 'auto',
    }),
  });

  // If model returns tool_calls
  if (finishReason === 'tool_calls') {
    for (const toolCall of toolCalls) {
      // Execute the tool
      const result = await executeToolCall(tool, args);
      
      // Add to conversation
      conversationMessages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: resultString,
      });
    }
    // Loop back to model with tool results
    continue;
  }

  // Model finished with text response
  yield { type: 'done' };
  return;
}
```

## Tools

### Built-in Tools (from Pi SDK)

```typescript
// pi/tools/index.ts
import { codingTools, readOnlyTools } from '@mariozechner/pi-coding-agent';

codingTools = [readTool, bashTool, editTool, writeTool];
readOnlyTools = [readTool, grepTool, findTool, lsTool];
```

| Tool | Description | Type |
|------|-------------|------|
| `bash` | Execute shell commands | coding tool |
| `read` | Read files (text & images) | coding tool |
| `write` | Create or overwrite files | coding tool |
| `edit` | Make precise file edits | coding tool |
| `grep` | Search within files | read-only tool |
| `find` | Find files by pattern | read-only tool |
| `ls` | List directory contents | read-only tool |

### Web Tools (Custom)

```typescript
// pi/tools/web-tools.ts
export const webSearchTool = { ... };  // Search via LangSearch
export const webFetchTool = { ... };   // Fetch content from URLs
```

### Composio Tools (Integration)

Dynamically loaded based on workspace integrations:

```typescript
// pi/tools/composio-tools.ts
const entityId = `ws_${workspaceId}_user_${userId}`;

const actions = await composioClient.actions.list({
  apps: [integration.toolkitSlug],
});

// Each action becomes a tool
for (const action of actions) {
  tools.push(createComposioTool(action, entityId, ...));
}
```

## Event Flow

### StreamChunk Events (Frontend SSE Format)

```typescript
interface StreamChunk {
  type: 
    | 'connected'      // Connection established
    | 'session_init'   // New session created
    | 'text'           // Text chunk
    | 'tool_use'       // Tool call started
    | 'tool_result'    // Tool execution result
    | 'title_update'   // Chat title generated
    | 'done'           // Stream complete
    | 'error'          // Error occurred
    | 'aborted';       // User cancelled
  
  content?: string;
  name?: string;       // Tool name
  input?: object;      // Tool input
  result?: unknown;    // Tool result
  // ...
}
```

### Translation Layer

```typescript
// pi/event-adapter.ts
class EventAdapter {
  translate(event: AgentEvent): StreamChunk | null {
    switch (event.type) {
      case 'message_update':
        // text_delta, thinking_delta, toolcall_start
      case 'tool_execution_start':
        // Log tool execution (for debugging)
      case 'tool_execution_end':
        // Emit tool_result
      case 'agent_end':
        // Emit done
    }
  }
}
```

## Comparison: Pi TUI vs Normie

| Aspect | Pi TUI (Standalone) | Normie (Embedded) |
|--------|---------------------|-------------------|
| Interface | Terminal UI | Electron/Web App |
| Config Location | `~/.pi/agent/` | Server-side + DB |
| Provider Config | `models.json` | Environment vars + DB |
| Extensions | Loaded from filesystem | Not loaded |
| Skills | Loaded from `~/.agents/skills/` | Loaded via skill system |
| Sessions | JSONL files in `~/.pi/agent/sessions/` | PostgreSQL DB |
| Multi-user | Single user | Multi-tenant (workspaces) |

## The Key Insight

**You ARE using Pi Agent** - even with Bedrock Mantle!

For the Braintree Mantle path, we don't use `createAgentSession()` from Pi SDK, but we implement the same agentic loop pattern that Pi would use internally:

1. Send prompt + tool definitions to API
2. Receive tool calls → execute tools
3. Send tool results back to API
4. Repeat until text response

This is exactly what Pi's `AgentSession` does internally for tool-capable models. We just implemented it directly for the Bedrock Mantle API since Pi SDK doesn't have built-in support for this custom endpoint.

## Future Improvements

1. **Use Pi's Custom Provider System**: Register Bedrock Mantle via `pi.registerProvider()` in an extension instead of custom implementation.

2. **Load Extensions**: Support loading extensions from `~/.pi/agent/extensions/` into Normie.

3. **Skills Integration**: Better integration with Pi's skill system.

4. **Session Compatibility**: Allow resuming Normie sessions in Pi TUI and vice versa.

## References

- [Pi README](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md)
- [Custom Providers Doc](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/custom-provider.md)
- [Custom Models Doc](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/models.md)
- [Pi SDK Doc](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/sdk.md)