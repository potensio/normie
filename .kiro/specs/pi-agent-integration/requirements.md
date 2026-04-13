# Requirements Document: Pi Agent Integration

## Introduction

This document specifies requirements for replacing Normie's custom provider abstraction layer with the Pi Agent SDK. The integration will eliminate approximately 1,200 lines of custom provider code while adding support for 15+ LLM providers, conversation branching, mid-conversation model switching, and crash-safe JSONL session storage. The Pi Agent SDK provides a production-proven architecture used by OpenClaw (160K+ stars) with built-in context compaction and unified streaming interfaces.

## Glossary

- **Pi_Agent_SDK**: The @mariozechner/pi-agent-core package providing agent loop with tool execution
- **Pi_AI**: The @mariozechner/pi-ai package providing unified LLM API across 15+ providers
- **Pi_Coding_Agent**: The @mariozechner/pi-coding-agent package providing full agent runtime with built-in file tools
- **Session_Manager**: Pi Agent's JSONL-based session storage system with tree structure support
- **Legacy_Provider**: The current BaseProvider-based abstraction (Claude, Opencode, Kimi, Bedrock, MCP)
- **Stream_Chunk**: Normalized SSE event format used by Normie frontend
- **Composio**: Tool integration platform providing workspace-isolated actions
- **Entity_ID**: Composio's workspace isolation identifier (format: ws*{workspaceId}\_user*{userId})
- **Conversation_Branch**: Alternative conversation path from a specific message in the tree
- **JSONL_Session**: Append-only JSON Lines file storing conversation history
- **Context_Compaction**: Automatic message history reduction when approaching token limits
- **Model_Switching**: Changing LLM provider/model mid-conversation without losing history
- **Tool_Adapter**: Wrapper converting Composio actions to Pi Agent tool format
- **Event_Translator**: Component mapping Pi Agent events to Normie's StreamChunk format
- **Workspace_Isolation**: Per-workspace tool scoping using Composio entity IDs

## Requirements

### Requirement 1: Pi Agent SDK Integration

**User Story:** As a developer, I want to integrate Pi Agent SDK packages, so that the application can leverage production-proven agent architecture.

#### Acceptance Criteria

1. THE System SHALL install @mariozechner/pi-ai package for unified LLM API
2. THE System SHALL install @mariozechner/pi-agent-core package for agent loop functionality
3. THE System SHALL install @mariozechner/pi-coding-agent package for built-in file tools
4. WHEN the server starts, THE System SHALL initialize Pi_Agent_SDK with workspace root configuration
5. THE System SHALL configure Pi_Agent_SDK to use JSONL session storage in .pi/sessions directory

### Requirement 2: Legacy Provider Removal

**User Story:** As a developer, I want to remove custom provider code, so that the codebase is simplified and maintainable.

#### Acceptance Criteria

1. THE System SHALL delete apps/server/src/providers/base-provider.ts
2. THE System SHALL delete apps/server/src/providers/claude-provider.ts
3. THE System SHALL delete apps/server/src/providers/opencode-provider.ts
4. THE System SHALL delete apps/server/src/providers/kimi-provider.ts
5. THE System SHALL delete apps/server/src/providers/bedrock-provider.ts
6. THE System SHALL remove in-memory session Map from provider implementations
7. THE System SHALL preserve apps/server/src/providers/mcp-client.ts for Composio integration

### Requirement 3: Session Manager Wrapper

**User Story:** As a developer, I want a wrapper for Pi's SessionManager, so that session lifecycle is managed consistently.

#### Acceptance Criteria

1. THE System SHALL create apps/server/src/pi/session-manager.ts module
2. THE Session_Manager SHALL initialize JSONL storage in .pi/sessions directory
3. WHEN a chat is created, THE Session_Manager SHALL create a new JSONL session file
4. WHEN a chat is resumed, THE Session_Manager SHALL load existing JSONL session by chat ID
5. WHEN a message is added, THE Session_Manager SHALL append to JSONL file atomically
6. THE Session_Manager SHALL maintain conversation tree structure for branching support
7. FOR ALL session operations, appending to JSONL then reading SHALL produce equivalent conversation history (round-trip property)

### Requirement 4: Composio Tool Adapter

**User Story:** As a user, I want Composio integrations to work with Pi Agent, so that workspace-isolated tools remain functional.

#### Acceptance Criteria

1. THE System SHALL create apps/server/src/pi/tools/composio-tools.ts module
2. WHEN a workspace has Composio integrations, THE Tool_Adapter SHALL convert Composio actions to Pi Agent tool format
3. WHEN a tool is invoked, THE Tool_Adapter SHALL use workspace-specific Entity_ID for isolation
4. THE Tool_Adapter SHALL preserve Composio action schemas in Pi Agent tool definitions
5. WHEN a Composio action executes, THE Tool_Adapter SHALL return results in Pi Agent tool result format
6. IF a Composio action fails, THEN THE Tool_Adapter SHALL return error details in Pi Agent error format

### Requirement 5: Web Tools Integration

**User Story:** As a user, I want web search and fetch capabilities, so that the agent can access internet information.

#### Acceptance Criteria

1. THE System SHALL create apps/server/src/pi/tools/web-tools.ts module
2. THE System SHALL implement WebSearch tool using Pi Agent tool interface
3. THE System SHALL implement WebFetch tool using Pi Agent tool interface
4. WHEN WebSearch is invoked, THE System SHALL return search results in structured format
5. WHEN WebFetch is invoked, THE System SHALL return webpage content with metadata

### Requirement 6: Event Translation Layer

**User Story:** As a developer, I want Pi Agent events translated to StreamChunk format, so that the frontend requires minimal changes.

#### Acceptance Criteria

1. THE System SHALL create apps/server/src/pi/event-adapter.ts module
2. WHEN Pi Agent emits a text event, THE Event_Translator SHALL convert it to StreamChunk with type 'text'
3. WHEN Pi Agent emits a tool call event, THE Event_Translator SHALL convert it to StreamChunk with type 'tool_use'
4. WHEN Pi Agent emits a tool result event, THE Event_Translator SHALL convert it to StreamChunk with type 'tool_result'
5. WHEN Pi Agent emits a completion event, THE Event_Translator SHALL convert it to StreamChunk with type 'done'
6. WHEN Pi Agent emits an error event, THE Event_Translator SHALL convert it to StreamChunk with type 'error'
7. THE Event_Translator SHALL preserve provider name in all StreamChunk events
8. THE Event_Translator SHALL preserve session_id in session_init StreamChunk events

### Requirement 7: Multi-Provider Support

**User Story:** As a user, I want access to 15+ LLM providers, so that I can choose the best model for each task.

#### Acceptance Criteria

1. THE System SHALL support all providers available in Pi_AI package
2. THE System SHALL expose provider list via GET /api/providers endpoint
3. WHEN a user selects a provider, THE System SHALL validate provider availability through Pi_AI
4. THE System SHALL maintain provider configuration in user preferences
5. THE System SHALL support provider-specific model selection

### Requirement 8: Model Switching API

**User Story:** As a user, I want to switch models mid-conversation, so that I can use different models for different parts of the conversation.

#### Acceptance Criteria

1. THE System SHALL create PATCH /api/chats/:chatId/model endpoint
2. WHEN a model switch is requested, THE System SHALL validate the new provider and model
3. WHEN a model switch is requested, THE System SHALL preserve conversation history
4. WHEN a model switch is requested, THE System SHALL update chat metadata with new provider and model
5. WHEN the next message is sent, THE System SHALL use the new provider and model
6. THE System SHALL record model switches in JSONL session metadata

### Requirement 9: Conversation Branching API

**User Story:** As a user, I want to branch conversations, so that I can explore alternative approaches without losing the original conversation.

#### Acceptance Criteria

1. THE System SHALL create POST /api/chats/:chatId/branch endpoint
2. WHEN a branch is requested, THE System SHALL accept a message ID as the branch point
3. WHEN a branch is created, THE System SHALL create a new chat record with copied history up to branch point
4. WHEN a branch is created, THE System SHALL create a new JSONL session file with branched history
5. WHEN a branch is created, THE System SHALL return the new chat ID
6. THE System SHALL maintain parent-child relationship in chat metadata

### Requirement 10: Session Tree API

**User Story:** As a developer, I want to retrieve conversation tree structure, so that the frontend can display branch relationships.

#### Acceptance Criteria

1. THE System SHALL create GET /api/chats/:chatId/tree endpoint
2. WHEN tree structure is requested, THE System SHALL return all branches from the root conversation
3. THE System SHALL include branch points (message IDs) in tree structure
4. THE System SHALL include chat metadata for each branch
5. THE System SHALL order branches chronologically by creation time

### Requirement 11: Database Schema Migration

**User Story:** As a developer, I want simplified chat schema, so that Pi Agent manages session state internally.

#### Acceptance Criteria

1. THE System SHALL remove sessionId column from chats table
2. THE System SHALL remove sessionProvider column from chats table
3. THE System SHALL add parentChatId column to chats table for branch tracking
4. THE System SHALL add branchPointMessageId column to chats table for branch point reference
5. THE System SHALL add sessionFilePath column to chats table for JSONL file location
6. THE System SHALL create database migration using Drizzle ORM

### Requirement 12: Crash-Safe Session Storage

**User Story:** As a user, I want sessions to survive crashes, so that I never lose conversation history.

#### Acceptance Criteria

1. WHEN a message is added, THE Session_Manager SHALL append to JSONL file before responding
2. WHEN the application crashes, THE Session_Manager SHALL preserve all appended messages
3. WHEN the application restarts, THE Session_Manager SHALL load sessions from JSONL files
4. THE Session_Manager SHALL use atomic file operations for JSONL appends
5. IF a JSONL file is corrupted, THEN THE Session_Manager SHALL load valid messages up to corruption point

### Requirement 13: Context Compaction Integration

**User Story:** As a user, I want automatic context management, so that conversations don't fail when approaching token limits.

#### Acceptance Criteria

1. WHEN conversation history approaches token limit, THE System SHALL trigger Pi Agent's context compaction
2. THE System SHALL use Pi Agent's default compaction strategy
3. WHEN context is compacted, THE System SHALL preserve system prompt and recent messages
4. WHEN context is compacted, THE System SHALL record compaction event in JSONL session
5. THE System SHALL configure token limit thresholds per provider

### Requirement 14: Workspace Isolation Preservation

**User Story:** As a user, I want workspace-scoped tools, so that actions only affect the intended workspace.

#### Acceptance Criteria

1. WHEN tools are loaded for a chat, THE System SHALL filter tools by workspace ID
2. WHEN a Composio tool is invoked, THE System SHALL use Entity_ID for the chat's workspace
3. THE System SHALL prevent cross-workspace tool access
4. WHEN workspace integrations change, THE System SHALL reload available tools for that workspace

### Requirement 15: Streaming Performance Parity

**User Story:** As a user, I want streaming performance equal to or better than current implementation, so that the user experience is not degraded.

#### Acceptance Criteria

1. WHEN streaming a response, THE System SHALL emit text chunks at intervals of 50ms or less
2. WHEN streaming a response, THE System SHALL maintain chunk sizes between 1-10 characters
3. THE System SHALL measure and log streaming latency for performance monitoring
4. THE System SHALL achieve first-token latency within 500ms of Legacy_Provider baseline

### Requirement 16: Error Handling and Logging

**User Story:** As a developer, I want comprehensive error handling, so that issues can be diagnosed and resolved quickly.

#### Acceptance Criteria

1. WHEN Pi Agent initialization fails, THE System SHALL log error details and fall back gracefully
2. WHEN a tool execution fails, THE System SHALL log error and return user-friendly message
3. WHEN JSONL file operations fail, THE System SHALL log error and attempt recovery
4. THE System SHALL log all provider switches with timestamp and user ID
5. THE System SHALL log all conversation branches with parent and child chat IDs
6. THE System SHALL use consistent log prefix format: [PiAgent], [SessionManager], [ToolAdapter]

### Requirement 17: Configuration Management

**User Story:** As a developer, I want centralized Pi Agent configuration, so that settings are consistent and maintainable.

#### Acceptance Criteria

1. THE System SHALL create apps/server/src/pi/config.ts module
2. THE System SHALL load Pi Agent configuration from environment variables
3. THE System SHALL provide default values for all configuration options
4. THE System SHALL validate configuration on server startup
5. IF configuration is invalid, THEN THE System SHALL log error and prevent server startup

### Requirement 18: Tool Registry Integration

**User Story:** As a developer, I want Pi Agent tools registered in Normie's tool registry, so that frontend displays correct tool icons.

#### Acceptance Criteria

1. WHEN Pi Agent tools are loaded, THE System SHALL map tool names to Normie's TOOL_REGISTRY
2. THE System SHALL assign default icons to unmapped Pi Agent tools
3. THE System SHALL preserve existing tool icon mappings for Composio tools
4. THE System SHALL expose tool metadata via GET /api/tools endpoint

### Requirement 19: Testing and Validation

**User Story:** As a developer, I want integration tests, so that Pi Agent integration is verified to work correctly.

#### Acceptance Criteria

1. THE System SHALL provide integration test for session creation and message appending
2. THE System SHALL provide integration test for Composio tool adapter with workspace isolation
3. THE System SHALL provide integration test for event translation from Pi Agent to StreamChunk
4. THE System SHALL provide integration test for model switching mid-conversation
5. THE System SHALL provide integration test for conversation branching
6. THE System SHALL provide integration test for JSONL session recovery after simulated crash
