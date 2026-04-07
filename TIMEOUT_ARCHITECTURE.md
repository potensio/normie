# Stream Timeout Architecture

## Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT REQUEST                           │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CHAT STREAM SERVICE                           │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Overall Stream Timeout: 120s                               │ │
│  │ ├─ Watchdog: Check activity every 10s                      │ │
│  │ ├─ Heartbeat: Send keepalive every 30s                     │ │
│  │ └─ Abort if no activity for 60s                            │ │
│  └────────────────────────────────────────────────────────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
                    ┌────────┴────────┐
                    │                 │
                    ▼                 ▼
        ┌───────────────────┐  ┌──────────────────┐
        │   PI AGENT SDK    │  │  MANTLE PROVIDER │
        └─────────┬─────────┘  └────────┬─────────┘
                  │                     │
                  ▼                     ▼
    ┌──────────────────────┐  ┌──────────────────────┐
    │ Event Loop Timeout   │  │ Chunk Activity Track │
    │ - Poll: 1s           │  │ - Stuck: 60s         │
    │ - Stuck: 60s         │  │ - Reset on chunk     │
    └──────────────────────┘  └──────────────────────┘
                  │                     │
                  └──────────┬──────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │   TOOL EXECUTION     │
                  │   Timeout: 30s       │
                  └──────────────────────┘
```

## Timeout Layers

### Layer 1: Stream Level (Outermost)

**Location**: `chat-stream.service.ts`
**Timeout**: 120 seconds
**Purpose**: Protect against entire stream hanging

```typescript
const streamTimeout = setTimeout(() => {
  abortController.abort();
}, 120000);
```

### Layer 2: Watchdog (Monitoring)

**Location**: `chat-stream.service.ts`
**Check Interval**: 10 seconds
**Threshold**: 60 seconds no activity
**Purpose**: Early warning for stuck streams

```typescript
const watchdog = startStreamWatchdog(res, 60000, () => {
  console.warn("Stream appears stuck");
});
```

### Layer 3: Event Loop (Pi Agent)

**Location**: `pi/index.ts`
**Poll Interval**: 1 second
**Stuck Threshold**: 60 seconds
**Purpose**: Detect when Pi Agent stops sending events

```typescript
const timeSinceActivity = Date.now() - lastActivityTime;
if (timeSinceActivity > 60000) {
  throw new Error("Stream timeout");
}
```

### Layer 4: Chunk Activity (Mantle)

**Location**: `bedrock-mantle-provider.ts`
**Check Interval**: Per iteration
**Stuck Threshold**: 60 seconds
**Purpose**: Detect when Mantle API stops sending chunks

```typescript
const timeSinceLastChunk = Date.now() - lastChunkTime;
if (timeSinceLastChunk > 60000) {
  throw new Error("Stream timeout");
}
```

### Layer 5: Tool Execution (Innermost)

**Location**: `bedrock-mantle-provider.ts`
**Timeout**: 30 seconds
**Purpose**: Prevent individual tools from hanging

```typescript
const result = await Promise.race([
  tool.execute(toolCallId, args, signal),
  timeoutPromise, // 30s
]);
```

## Activity Reset Points

Activity timers are reset at these points:

1. **Stream Level**: On any chunk sent to client
2. **Watchdog**: On any chunk sent to client
3. **Event Loop**: On any event from Pi Agent
4. **Chunk Activity**: On any chunk from Mantle API
5. **Tool Execution**: Before and after tool execution

## Error Propagation

```
Tool Timeout (30s)
    ↓
Tool Error Result (not thrown)
    ↓
Continue stream with error message
    ↓
If no more events for 60s
    ↓
Event Loop Timeout
    ↓
Stream Error
    ↓
Client receives error event
```

## Cleanup Sequence

When stream ends (success or error):

```typescript
// 1. Unregister session tracker
sessionTracker.unregisterSession(chatId);

// 2. Clear stream timeout
clearTimeout(streamTimeout);

// 3. Stop watchdog
watchdog.stop();

// 4. Stop heartbeat
stopHeartbeat(heartbeat);

// 5. End response
res.end();
```

## Configuration

All timeout values are configurable:

| Constant              | Value  | Location                                |
| --------------------- | ------ | --------------------------------------- |
| `streamTimeoutMs`     | 120000 | chat-stream.service.ts                  |
| `watchdogTimeoutMs`   | 60000  | chat-stream.service.ts                  |
| `heartbeatIntervalMs` | 30000  | chat-stream.service.ts                  |
| `toolTimeoutMs`       | 30000  | bedrock-mantle-provider.ts              |
| `stuckThresholdMs`    | 60000  | pi/index.ts, bedrock-mantle-provider.ts |
| `eventPollMs`         | 1000   | pi/index.ts                             |

## Monitoring & Logging

Each timeout layer logs warnings/errors:

```
[STREAM] ⚠️ Stream timeout after 120s - aborting
[STREAM:Watchdog] ⚠️ No activity for 60s - stream may be stuck
[PiAgent] ⚠️ Stream stuck - no events for 60s
[BedrockMantle] ⚠️ Stream stuck - no chunks for 60s
[Mantle:Tool] Tool execution timeout after 30s
```

## Benefits

1. **Multi-layer protection**: Multiple safety nets
2. **Graceful degradation**: Tool timeouts don't kill stream
3. **Clear error messages**: Users know what went wrong
4. **Resource protection**: No hanging connections
5. **Debugging friendly**: Detailed logs at each layer
