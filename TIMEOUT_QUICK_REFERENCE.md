# Stream Timeout Quick Reference

## 🚨 Problem Solved

AI berhenti di tengah jalan karena tidak ada timeout protection.

## ✅ Solution

Multi-layer timeout protection dengan 5 layers:

## 📊 Timeout Values

| Layer             | Timeout | What It Does                    |
| ----------------- | ------- | ------------------------------- |
| 🔴 Stream         | 120s    | Kills entire stream if too long |
| 🟡 Watchdog       | 60s     | Warns if no activity            |
| 🟠 Event Loop     | 60s     | Detects Pi Agent stuck          |
| 🟢 Chunk Activity | 60s     | Detects Mantle API stuck        |
| 🔵 Tool Execution | 30s     | Prevents tool hang              |

## 🔧 Files Changed

1. **apps/server/src/services/chat-stream.service.ts**
   - Added stream timeout (120s)
   - Added watchdog (60s)
   - Increased heartbeat (15s → 30s)

2. **apps/server/src/providers/bedrock-mantle-provider.ts**
   - Added tool execution timeout (30s)
   - Added chunk activity tracking (60s)

3. **apps/server/src/pi/index.ts**
   - Added event activity tracking (60s)
   - Improved event loop (100ms → 1s polling)

## 🧪 Testing Checklist

- [ ] Normal chat works
- [ ] Long tool execution (>30s) times out gracefully
- [ ] Model stops responding → timeout after 60s
- [ ] Network issues → detected and aborted
- [ ] User abort → cleanup properly

## 🐛 Debugging

### Stream stuck?

Check logs for:

```
[STREAM:Watchdog] ⚠️ No activity for Xs - stream may be stuck
```

### Tool hanging?

Check logs for:

```
[Mantle:Tool] Tool execution timeout after 30s
```

### Pi Agent not responding?

Check logs for:

```
[PiAgent] ⚠️ Stream stuck - no events for 60s
```

### Mantle API not responding?

Check logs for:

```
[BedrockMantle] ⚠️ Stream stuck - no chunks for 60s
```

## 🎯 Key Improvements

1. **No more infinite hangs** ✅
2. **Better error messages** ✅
3. **Resource protection** ✅
4. **Reduced CPU usage** ✅ (1s vs 100ms polling)
5. **Tool protection** ✅

## 📝 Notes

- All timeouts are configurable (search for `Ms` constants)
- Watchdog only warns, doesn't abort (for debugging)
- Tool timeouts are graceful (stream continues with error)
- Context compaction issue deferred to separate work

## 🚀 Next Steps

If you still see stuck streams:

1. Check logs for which layer detected it
2. Adjust timeout values if needed
3. Check network/API issues
4. Verify Pi Agent is working correctly

## 💡 Pro Tips

- **Increase tool timeout** if you have slow tools:

  ```typescript
  const toolTimeoutMs = 60000; // 60s instead of 30s
  ```

- **Decrease stream timeout** for faster failure:

  ```typescript
  const streamTimeoutMs = 60000; // 60s instead of 120s
  ```

- **Disable watchdog warnings** if too noisy:
  ```typescript
  // Comment out the watchdog setup
  // const watchdog = startStreamWatchdog(...)
  ```
