# Stream Timeout & Stuck Detection Fix

## Problem

AI sering berhenti di tengah jalan karena:

1. Tidak ada timeout untuk keseluruhan stream
2. Tool execution bisa hang tanpa timeout
3. Event loop bisa stuck tanpa detection
4. Tidak ada watchdog untuk detect stuck streams

## Solution Implemented

### 1. Stream-Level Timeout (chat-stream.service.ts)

- **Overall stream timeout**: 120 detik (2 menit) untuk keseluruhan stream
- **Watchdog**: Mendeteksi jika tidak ada activity selama 60 detik
- **Heartbeat**: Ditingkatkan dari 15s ke 30s untuk long-running tools

```typescript
// Setup stream timeout (2 minutes for entire stream)
const streamTimeoutMs = 120000;
const streamTimeout = setTimeout(() => {
  console.error(
    `[STREAM] ⚠️ Stream timeout after ${streamTimeoutMs / 1000}s - aborting`,
  );
  abortController.abort();
}, streamTimeoutMs);

// Setup watchdog to detect stuck streams
const watchdog = startStreamWatchdog(res, 60000, () => {
  console.warn("[STREAM:Watchdog] Stream appears stuck - will abort soon");
});
```

### 2. Tool Execution Timeout (bedrock-mantle-provider.ts)

- **Tool timeout**: 30 detik per tool execution
- **Graceful error handling**: Timeout error dijelaskan dengan baik ke user

```typescript
// Tool execution timeout (30 seconds)
const toolTimeoutMs = 30000;

// Race between tool execution and timeout
const result = await Promise.race([
  tool.execute(toolCallId, args, signal),
  timeoutPromise,
]);
```

### 3. Stuck Stream Detection (pi/index.ts)

- **Activity tracking**: Track last activity time
- **60s threshold**: Error jika tidak ada events selama 60 detik
- **Reduced CPU usage**: Event loop timeout ditingkatkan dari 100ms ke 1s

```typescript
// Track last activity for stuck detection
let lastActivityTime = Date.now();
const stuckThresholdMs = 60000; // 60 seconds

// Check for stuck stream (no events for 60s)
const timeSinceActivity = Date.now() - lastActivityTime;
if (timeSinceActivity > stuckThresholdMs) {
  throw new Error(
    `Stream timeout - no response from model for ${Math.round(timeSinceActivity / 1000)}s`,
  );
}
```

### 4. Mantle Stream Protection (bedrock-mantle-provider.ts)

- **Chunk activity tracking**: Reset timer setiap kali ada chunk
- **Tool execution tracking**: Reset timer sebelum dan sesudah tool execution

```typescript
// Track last activity for stuck detection
let lastChunkTime = Date.now();
const stuckThresholdMs = 60000; // 60 seconds

// Reset on any activity
if (delta?.content) {
  lastChunkTime = Date.now(); // Reset stuck timer
  // ... yield chunk
}
```

## Timeouts Summary

| Component        | Timeout | Purpose                             |
| ---------------- | ------- | ----------------------------------- |
| Overall Stream   | 120s    | Maximum time for entire chat stream |
| Watchdog         | 60s     | Detect stuck streams (warning)      |
| Tool Execution   | 30s     | Maximum time per tool call          |
| Event Inactivity | 60s     | No events from Pi Agent             |
| Chunk Inactivity | 60s     | No chunks from Mantle API           |
| Heartbeat        | 30s     | Keep connection alive               |

## Benefits

1. **No more hanging streams**: Streams akan timeout jika stuck
2. **Better error messages**: User tahu kenapa stream berhenti
3. **Resource protection**: Server tidak akan stuck dengan hanging connections
4. **Reduced CPU usage**: Event loop lebih efisien (1s vs 100ms polling)
5. **Tool protection**: Long-running tools tidak akan hang forever

## Testing

Test scenarios:

1. ✅ Normal chat flow (should work as before)
2. ✅ Long tool execution (should timeout after 30s)
3. ✅ Model stops responding (should timeout after 60s)
4. ✅ Network issues (should detect and abort)
5. ✅ User abort (should cleanup properly)

## Notes

- Context compaction issue akan dikerjakan terpisah
- Timeout values bisa di-tune berdasarkan production metrics
- Watchdog hanya warning, tidak auto-abort (untuk debugging)
