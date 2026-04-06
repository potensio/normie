# Design Document: Compact Tool Call Display

## Overview

This design document outlines the architecture for improving tool call display in Normie, targeting non-technical users. The current implementation groups all tool calls at the top of assistant messages, exposing technical details in expandable cards. The new design will:

1. **Interleave tool calls with text** in stream order using a blocks-based message structure
2. **Display tools compactly** (1–2 lines) with clear status, action, and target
3. **Hide results by default**, expanding on click with pretty-printed formatting

The architecture follows established patterns:
- **Types Layer**: New `MessageBlock` union type in `@normie/types`
- **Hooks Layer**: Modified `useChatStream` to build blocks instead of accumulating text/tools separately
- **UI Layer**: New `CompactToolCall` component replacing `InlineToolCall`, plus `MessageBlocks` renderer

---

## Architecture

### Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         Stream Events                           │
│  { type: 'text' }  { type: 'tool_use' }  { type: 'tool_result' }│
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     useChatStream Hook                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  buildMessageBlocks()                                    │   │
│  │  - Appends TextBlock on 'text' chunk                     │   │
│  │  - Appends ToolBlock on 'tool_use' chunk                 │   │
│  │  - Updates ToolBlock status on 'tool_result' chunk       │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Message Blocks Array                       │
│  [TextBlock, ToolBlock, TextBlock, ToolBlock, TextBlock, ...]  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     MessageBlocks Renderer                      │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐      │
│  │ AnimatedStream│  │CompactToolCall│  │ AnimatedStream│ ...  │
│  └───────────────┘  └───────────────┘  └───────────────┘      │
└─────────────────────────────────────────────────────────────────┘
```

### Layer Description

| Layer | Owns | Does Not Own |
|-------|------|--------------|
| **Types** | `MessageBlock`, `TextBlock`, `ToolBlock`, `InlineToolCall` (extended) | Streaming logic, rendering |
| **Hooks** | Block construction, status updates, duration calculation | Display formatting, component rendering |
| **UI** | Compact display, expansion, pretty-printing | State management, streaming |

---

## Components and Interfaces

### Types Layer

```typescript
// packages/types/src/index.ts

// New: Block types for interleaved rendering
export type MessageBlock = TextBlock | ToolBlock;

export interface TextBlock {
  type: "text";
  content: string;
}

export interface ToolBlock {
  type: "tool";
  toolCall: InlineToolCall;
}

// Modified: InlineToolCall with duration and startTime
export interface InlineToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: "running" | "success" | "error";
  result?: unknown;
  startTime: number;      // Unix timestamp (ms) when tool started
  duration?: number;      // Duration in seconds, set on completion
  errorMessage?: string;  // Friendly error message for display
}

// Modified: Message with blocks instead of content + inlineToolCalls
export interface Message {
  id: string;
  role: "user" | "assistant";
  blocks?: MessageBlock[];      // New: interleaved blocks
  content?: string;             // Deprecated: for migration only
  reasoning?: string;
  // Removed: inlineToolCalls (now in blocks)
}
```

### Hooks Layer

```typescript
// apps/web/src/hooks/useChatStream.ts

interface UseChatStreamReturn {
  messages: Message[];
  isStreaming: boolean;
  // ... existing fields unchanged
}

// Internal helper - builds blocks from stream chunks
function buildMessageBlocks(
  blocks: MessageBlock[],
  chunk: StreamChunk,
  toolTimings: Map<string, { startTime: number }>
): MessageBlock[];
```

### UI Layer

```typescript
// apps/web/src/components/CompactToolCall.tsx

interface CompactToolCallProps {
  toolCall: InlineToolCall;
  isStreaming: boolean;
}

export function CompactToolCall({ toolCall, isStreaming }: CompactToolCallProps): React.ReactNode;
```

```typescript
// apps/web/src/components/MessageBlocks.tsx

interface MessageBlocksProps {
  blocks: MessageBlock[];
  isStreaming: boolean;
}

export function MessageBlocks({ blocks, isStreaming }: MessageBlocksProps): React.ReactNode;
```

```typescript
// apps/web/src/components/ToolResultViewer.tsx

interface ToolResultViewerProps {
  result: unknown;
  maxHeight?: number; // Default: 200 (px)
}

export function ToolResultViewer({ result, maxHeight = 200 }: ToolResultViewerProps): React.ReactNode;
```

```typescript
// apps/web/src/lib/tool-labels.ts

interface ToolLabel {
  verb: string;        // e.g., "Reading", "Running"
  pastTense: string;   // e.g., "Read", "Ran"
}

export function getToolLabel(toolName: string): ToolLabel;

export function getToolTarget(toolName: string, input: Record<string, unknown>): string;

export function truncateTarget(target: string, maxLength?: number): string; // Default: 40
```

---

## Data Models

### Domain Types

```typescript
// packages/types/src/index.ts (new types)

/** Union type for message content blocks */
export type MessageBlock = TextBlock | ToolBlock;

/** A text segment within a message */
export interface TextBlock {
  type: "text";
  content: string;
}

/** A tool execution block within a message */
export interface ToolBlock {
  type: "tool";
  toolCall: InlineToolCall;
}
```

### Extended InlineToolCall

```typescript
// packages/types/src/index.ts (modified)

export interface InlineToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  status: "running" | "success" | "error";
  result?: unknown;
  startTime: number;      // When the tool started (Unix ms)
  duration?: number;      // Duration in seconds (set on completion)
  errorMessage?: string;  // User-friendly error message
}
```

---

## Correctness Properties

### Property 1: Block Order Preservation

_For any_ sequence of stream events `[E1, E2, ..., En]`, the resulting `blocks` array SHALL maintain the same order as the events were received.

**Validates: Requirement 1.4**

### Property 2: Tool Duration Accuracy

_For any_ tool call that transitions from `running` to `success` or `error`, the `duration` field SHALL equal `(completionTime - startTime) / 1000`, rounded to one decimal place.

**Validates: Requirement 2.6, 2.7**

### Property 3: Target Truncation Bound

_For any_ tool target string `s` where `length(s) > 40`, `truncateTarget(s)` SHALL return a string of length 43 ending with `...`.

**Validates: Requirement 2.5**

### Property 4: Result Height Bound

_For any_ expanded tool result, the visible height SHALL not exceed 200px, with overflow handled via scrolling.

**Validates: Requirement 3.5**

### Property 5: Error Message Truncation

_For any_ error message string `s` where `length(s) > 80`, the displayed message SHALL have length 83 ending with `...`.

**Validates: Requirement 5.5**

### Traceability Matrix

| Property | Requirement(s) | Test Type |
|----------|----------------|-----------|
| Property 1: Block Order Preservation | Req 1.4 | Property-based |
| Property 2: Tool Duration Accuracy | Req 2.6, 2.7 | Unit |
| Property 3: Target Truncation Bound | Req 2.5 | Unit |
| Property 4: Result Height Bound | Req 3.5 | Integration |
| Property 5: Error Message Truncation | Req 5.5 | Unit |

---

## Error Handling

### Error Type Catalog

| Error Type | When It Occurs | Detection | Handling |
|------------|----------------|-----------|----------|
| **Tool network error** | Tool execution fails due to network | `error.code === 'ENETWORK'` or `error.message.includes('network')` | Display: "Network error, please check your connection" |
| **Tool timeout** | Tool execution exceeds timeout | `error.code === 'ETIMEDOUT'` | Display: "Operation timed out" |
| **Tool permission error** | Tool lacks required permissions | `error.code === 'EPERM'` or `error.message.includes('permission')` | Display: "Permission denied" |
| **Unknown tool error** | Any other tool failure | Catch-all after above checks | Display truncated error message (max 80 chars) |
| **Result parse error** | Result cannot be pretty-printed | `JSON.stringify` throws | Display raw result as string in `<pre>` tag |

### Error Classification Logic

```typescript
// apps/web/src/lib/error-messages.ts

export function classifyToolError(error: unknown): string {
  if (!error) return "Unknown error";

  const message = error instanceof Error ? error.message : String(error);

  if (message.toLowerCase().includes("network")) {
    return "Network error, please check your connection";
  }
  if (message.toLowerCase().includes("timeout")) {
    return "Operation timed out";
  }
  if (message.toLowerCase().includes("permission")) {
    return "Permission denied";
  }

  // Truncate unknown errors
  return message.length > 80 ? message.slice(0, 77) + "..." : message;
}
```

---

## Data Flow

### Streaming Flow (Happy Path)

1. User sends message → `useChatStream.sendMessage()` called
2. Stream emits `{ type: 'text', content: "I'll search..." }`
3. `useChatStream` appends `TextBlock { type: 'text', content: "I'll search..." }`
4. Stream emits `{ type: 'tool_use', name: 'search', input: { query: 'foo' }, id: 't1' }`
5. `useChatStream` appends `ToolBlock { type: 'tool', toolCall: { id: 't1', name: 'search', status: 'running', startTime: Date.now(), ... } }`
6. Stream emits `{ type: 'tool_result', tool_use_id: 't1', result: { files: [...] } }`
7. `useChatStream` updates the ToolBlock's `toolCall.status = 'success'`, sets `duration`, and `result`
8. Stream emits `{ type: 'text', content: "Found 3 files..." }`
9. `useChatStream` appends another `TextBlock`
10. Stream emits `{ type: 'done' }`
11. `isStreaming` set to `false`

### Rendering Flow

1. `MessageItem` receives `message.blocks`
2. `MessageBlocks` maps over blocks in order
3. For `TextBlock`: renders `AnimatedStream` (existing component)
4. For `ToolBlock`: renders `CompactToolCall`
5. `CompactToolCall` displays:
   - If `running`: `⏳ {verb} {target}...`
   - If `success`: `✓ {pastTense} {target} {duration}s`
   - If `error`: `✗ {pastTense} {target}` + error line
6. User clicks tool → `isExpanded` toggles → `ToolResultViewer` shows pretty-printed result

---

## Testing Strategy

### Unit Tests

| Component | Tests |
|-----------|-------|
| `truncateTarget` | Truncates at 40 chars, adds `...`, passes through short strings |
| `getToolLabel` | Returns correct labels for known tools, falls back to camelCase conversion |
| `classifyToolError` | Maps network/timeout/permission errors correctly, truncates unknown errors |
| Duration calculation | Correctly calculates and rounds to 1 decimal place |

### Property-Based Tests

**Property 1: Block Order Preservation**
```typescript
// Using fast-check
test.prop([fc.array(streamChunkArbitrary)])(
  "blocks preserve stream order",
  (chunks) => {
    const blocks = buildBlocksFromChunks(chunks);
    const toolEvents = chunks.filter(c => c.type === 'tool_use' || c.type === 'text');
    // Verify blocks order matches event order
  }
);
```

### Integration Tests

| Scenario | Test |
|----------|------|
| Tool result expansion | Click tool → result expands → click again → collapses |
| Result scroll | Result > 200px height → scroll container appears |
| Streaming interleaved | Verify tool blocks appear between text blocks during live stream |

---

## File Structure

```
apps/web/src/
├── components/
│   ├── chat/
│   │   ├── MessageItem.tsx        # [Modify] Render blocks instead of content
│   │   └── ...
│   ├── CompactToolCall.tsx        # [Create] Compact tool display component
│   ├── MessageBlocks.tsx          # [Create] Blocks renderer
│   ├── ToolResultViewer.tsx       # [Create] Pretty-printed result viewer
│   └── InlineToolCall.tsx         # [Delete] Replaced by CompactToolCall
├── hooks/
│   └── useChatStream.ts           # [Modify] Build blocks instead of content + inlineToolCalls
└── lib/
    ├── tool-labels.ts             # [Create] Tool label/target formatting
    ├── tool-icons.ts              # [Modify] Update for compact display
    └── error-messages.ts          # [Create] Error classification

packages/types/src/
└── index.ts                       # [Modify] Add MessageBlock, ToolBlock, TextBlock; extend InlineToolCall
```

| File | Action | Description |
|------|--------|-------------|
| `packages/types/src/index.ts` | Modify | Add `MessageBlock`, `TextBlock`, `ToolBlock`; extend `InlineToolCall` with `startTime`, `duration`, `errorMessage` |
| `apps/web/src/hooks/useChatStream.ts` | Modify | Build `blocks` array instead of `content` + `inlineToolCalls` |
| `apps/web/src/components/CompactToolCall.tsx` | Create | 1–2 line tool display with status, action, target, duration |
| `apps/web/src/components/MessageBlocks.tsx` | Create | Maps `blocks[]` to Components in order |
| `apps/web/src/components/ToolResultViewer.tsx` | Create | Pretty-printed result with max-height scroll |
| `apps/web/src/components/chat/MessageItem.tsx` | Modify | Render `MessageBlocks` instead of grouped tool calls + text |
| `apps/web/src/components/InlineToolCall.tsx` | Delete | Replaced by `CompactToolCall` |
| `apps/web/src/lib/tool-labels.ts` | Create | `getToolLabel`, `getToolTarget`, `truncateTarget` functions |
| `apps/web/src/lib/tool-icons.ts` | Modify | Simplify for compact display (remove category colors) |
| `apps/web/src/lib/error-messages.ts` | Create | `classifyToolError` function |

---

## Dependencies

No new packages required. All functionality uses existing dependencies:
- `framer-motion` — for expansion animations
- `react-syntax-highlighter` — for pretty-printed results (already installed)
- `lucide-react` — for status icons

---

## Out of Scope

- Progress bars on tool execution
- Live terminal embedding
- Diff views for file edits
- Tool call grouping/collapsing
- Tool call cancellation from UI
- Persistence of expanded/collapsed state