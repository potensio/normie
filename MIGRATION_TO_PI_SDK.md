# Migration to Pi Agent SDK - Complete Guide

## 🎯 Executive Summary

**Problem**: AI berhenti di tengah jalan setelah 10 tool calls karena artificial iteration limit di custom Bedrock Mantle provider.

**Root Cause**: Custom implementation di `apps/server/src/providers/bedrock-mantle-provider.ts` memiliki `maxIterations = 10`.

**Solution**: Migrate ke Pi Agent SDK menggunakan `ModelRegistry.registerProvider()` - **PROVEN to work with 25+ tool calls tanpa iteration limit**.

---

## 📊 POC Results

### Test Scenario

Prompt: "What time is it? Then calculate 123 _ 456. Then calculate the result + 1000. Then calculate that result _ 2."

### Results Comparison

| Metric               | Custom Mantle Provider  | Pi Agent SDK (ModelRegistry)  |
| -------------------- | ----------------------- | ----------------------------- |
| **Tool Calls**       | 10 (then stops)         | **25 (continues until done)** |
| **Completion**       | ❌ Incomplete           | ✅ Complete                   |
| **Who decides stop** | We do (iteration limit) | Model does                    |
| **Code complexity**  | ~500 lines              | ~10 lines                     |
| **Maintenance**      | High                    | Low                           |
| **Iteration limit**  | Hardcoded 10            | None (SDK handles)            |

### POC Output

```
Total tool calls: 25
Total text chunks: 66
Response length: 2580 chars
Final Answer: 114,176 ✅
```

**Conclusion**: Model successfully completed all tasks without artificial limits.

---

## 🏗️ Architecture Comparison

### Current Architecture (Problematic)

```
User Request
    ↓
runPiQuery()
    ↓
isMantle? → YES
    ↓
streamBedrockMantle() [CUSTOM]
    ↓
while (iteration < 10) {  ← PROBLEM!
    - Make API call
    - Handle tool calls
    - iteration++
}
    ↓
Iteration 10 → STOP (even if model wants to continue)
```

### New Architecture (SDK-based)

```
User Request
    ↓
runPiQuery()
    ↓
ModelRegistry.registerProvider('bedrock', {...})
    ↓
createAgentSession({
    model: bedrockModel,
    tools: [...],
})
    ↓
SDK handles EVERYTHING:
    - Tool loop (no iteration limit!)
    - Streaming
    - Error handling
    - Context management
    ↓
Model decides when to stop
```

---

## 🔧 Implementation Guide

### Step 1: Register Bedrock Provider

**File**: `apps/server/src/pi/index.ts`

```typescript
import { ModelRegistry } from "@mariozechner/pi-coding-agent";

// Create ModelRegistry with auth storage
const modelRegistry = ModelRegistry.inMemory(authStorage);

// Register custom Bedrock provider
modelRegistry.registerProvider("bedrock", {
  baseUrl: process.env.BEDROCK_BASE_URL!,
  apiKey: process.env.BEDROCK_API_KEY!,
  api: "openai-completions",
  authHeader: true,
  models: [
    {
      id: "zai.glm-5",
      name: "GLM-5",
      api: "openai-completions",
      reasoning: true,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 4096,
    },
    {
      id: "moonshotai.kimi-k2.5",
      name: "Kimi K2.5",
      api: "openai-completions",
      reasoning: false,
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 4096,
    },
  ],
});

// Get model from registry
const model = modelRegistry.find("bedrock", "zai.glm-5");
```

### Step 2: Remove Custom Mantle Provider

**Delete**: `apps/server/src/providers/bedrock-mantle-provider.ts`

This file contains:

- Custom tool loop with iteration limit
- Manual SSE streaming
- Manual context management
- ~500 lines of code that SDK handles automatically

### Step 3: Update runPiQuery()

**File**: `apps/server/src/pi/index.ts`

**Before** (with custom Mantle):

```typescript
export async function* runPiQuery(options: RunPiQueryOptions) {
  // ... setup code ...

  // Check if Bedrock Mantle
  const isMantle = isMantleProvider(piProvider);

  if (isMantle) {
    // ❌ Custom implementation with iteration limit
    for await (const chunk of streamBedrockMantle(...)) {
      yield chunk;
    }
    return; // Exit early
  }

  // ✅ Use SDK for other providers
  const result = await createAgentSession({...});
  // ... stream events ...
}
```

**After** (SDK for all providers):

```typescript
export async function* runPiQuery(options: RunPiQueryOptions) {
  // ... setup code ...

  // Create ModelRegistry
  const modelRegistry = ModelRegistry.inMemory(authStorage);

  // Register Bedrock if needed
  if (provider === "bedrock") {
    modelRegistry.registerProvider("bedrock", {
      baseUrl: process.env.BEDROCK_BASE_URL!,
      apiKey: credentials.apiKey!,
      api: "openai-completions",
      authHeader: true,
      models: BEDROCK_MODELS, // Define separately
    });
  }

  // Get model from registry
  const model = modelRegistry.find(provider, modelId);

  // ✅ Use SDK for ALL providers (including Bedrock)
  const result = await createAgentSession({
    authStorage,
    model,
    tools,
    thinkingLevel: "medium",
  });

  // Stream events (same for all providers)
  for await (const event of result.session.events()) {
    const chunk = translateSessionEvent(event, eventAdapter);
    if (chunk) yield chunk;
  }
}
```

### Step 4: Define Bedrock Models

**File**: `apps/server/src/pi/bedrock-models.ts` (NEW)

```typescript
export const BEDROCK_MODELS = [
  {
    id: "zai.glm-5",
    name: "GLM-5",
    api: "openai-completions" as const,
    reasoning: true,
    input: ["text" as const],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 4096,
  },
  {
    id: "moonshotai.kimi-k2.5",
    name: "Kimi K2.5",
    api: "openai-completions" as const,
    reasoning: false,
    input: ["text" as const],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 4096,
  },
  {
    id: "openai.gpt-oss-120b",
    name: "GPT OSS 120B",
    api: "openai-completions" as const,
    reasoning: false,
    input: ["text" as const],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 4096,
  },
];
```

### Step 5: Update Config

**File**: `apps/server/src/pi/config.ts`

Remove Mantle-specific logic:

```typescript
// ❌ Remove this
function isMantleProvider(provider: string): boolean {
  return provider === "amazon-bedrock";
}

// ❌ Remove PROVIDER_ALIAS for bedrock
export const PROVIDER_ALIAS: Record<string, string> = {
  // Remove: 'bedrock': 'amazon-bedrock',
  // ... other aliases
};
```

---

## 📝 Migration Checklist

### Phase 1: Preparation

- [x] Run POC to verify ModelRegistry works
- [x] Document current architecture
- [x] Identify all files that need changes
- [ ] Create backup branch

### Phase 2: Implementation

- [ ] Create `apps/server/src/pi/bedrock-models.ts`
- [ ] Update `apps/server/src/pi/index.ts`:
  - [ ] Import ModelRegistry
  - [ ] Add registerProvider logic
  - [ ] Remove isMantle check
  - [ ] Remove streamBedrockMantle call
- [ ] Delete `apps/server/src/providers/bedrock-mantle-provider.ts`
- [ ] Update `apps/server/src/pi/config.ts`:
  - [ ] Remove isMantleProvider
  - [ ] Remove bedrock from PROVIDER_ALIAS
- [ ] Update imports in affected files

### Phase 3: Testing

- [ ] Test Bedrock models (zai.glm-5, kimi-k2.5)
- [ ] Test with multiple tool calls (>10)
- [ ] Test with long-running tasks
- [ ] Test error handling
- [ ] Test abort/cancel
- [ ] Verify other providers still work (Anthropic, OpenAI, etc)

### Phase 4: Cleanup

- [ ] Remove unused imports
- [ ] Update documentation
- [ ] Remove timeout workarounds (if any)
- [ ] Update AGENTS.md

---

## 🧪 Testing Strategy

### Test Case 1: Multiple Tool Calls

```typescript
// Prompt that requires >10 tool calls
const prompt = `
Read file A, then file B, then file C.
Calculate X, then Y, then Z.
Write results to files.
Verify all files exist.
`;

// Expected: All tasks complete without stopping at 10
```

### Test Case 2: Long Running Task

```typescript
// Prompt with complex file operations
const prompt = `
Extract all text from PDF.
Analyze the content.
Generate summary.
Create visualization.
`;

// Expected: Completes all steps
```

### Test Case 3: Error Recovery

```typescript
// Prompt that might cause tool errors
const prompt = `
Read non-existent file.
Then continue with other tasks.
`;

// Expected: Handles error gracefully, continues
```

---

## 🔍 Verification

### Before Migration

```bash
# Test current implementation
curl -X POST http://localhost:3001/api/chats/test/stream \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Complex task requiring many tool calls",
    "provider": "bedrock",
    "model": "zai.glm-5"
  }'

# Expected: Stops after 10 tool calls
```

### After Migration

```bash
# Test new implementation
curl -X POST http://localhost:3001/api/chats/test/stream \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Complex task requiring many tool calls",
    "provider": "bedrock",
    "model": "zai.glm-5"
  }'

# Expected: Completes all tool calls
```

---

## 📊 Benefits

### Code Quality

- **-500 lines**: Delete custom Mantle provider
- **+50 lines**: Add ModelRegistry setup
- **Net**: -450 lines of code

### Reliability

- ✅ No iteration limit
- ✅ SDK-tested error handling
- ✅ Automatic retry logic
- ✅ Better streaming

### Maintenance

- ✅ SDK updates automatically
- ✅ Bug fixes from upstream
- ✅ New features for free
- ✅ Less code to maintain

### Performance

- ✅ Optimized streaming
- ✅ Better context management
- ✅ Efficient tool execution

---

## ⚠️ Potential Issues & Solutions

### Issue 1: Model Not Found

**Symptom**: `Model not found in registry`

**Solution**: Ensure provider is registered before calling `find()`:

```typescript
modelRegistry.registerProvider('bedrock', {...});
const model = modelRegistry.find('bedrock', 'zai.glm-5');
```

### Issue 2: Auth Errors

**Symptom**: `401 Unauthorized`

**Solution**: Verify apiKey is passed in registerProvider:

```typescript
modelRegistry.registerProvider("bedrock", {
  apiKey: process.env.BEDROCK_API_KEY!, // Required!
  // ...
});
```

### Issue 3: Wrong API Type

**Symptom**: `Unsupported API type`

**Solution**: Use `openai-completions` for Mantle:

```typescript
{
  api: 'openai-completions', // Not 'openai' or 'bedrock'
}
```

### Issue 4: Missing baseUrl

**Symptom**: Requests go to wrong endpoint

**Solution**: Set baseUrl in provider config:

```typescript
{
  baseUrl: process.env.BEDROCK_BASE_URL!,
}
```

---

## 🎓 Key Learnings

### 1. Pi Agent SDK Already Supports Custom Providers

Your personal Pi Agent setup (`~/.pi/agent/models.json`) proves this works. We just need to use the same API programmatically.

### 2. ModelRegistry is the Key

`ModelRegistry.registerProvider()` is how Pi Agent CLI loads custom providers. This is the official way to add custom models.

### 3. No Need for Custom Streaming

Pi Agent SDK handles OpenAI-compatible APIs natively via `api: 'openai-completions'`. No need to implement SSE parsing ourselves.

### 4. Iteration Limits are Artificial

The 10 iteration limit was our own creation. Pi Agent SDK has no such limit - it lets the model decide when to stop.

### 5. Less Code = Better Code

Custom implementation: ~500 lines
SDK implementation: ~50 lines
**90% reduction in code complexity**

---

## 📚 References

### Pi Agent SDK Documentation

- ModelRegistry: `@mariozechner/pi-coding-agent`
- Custom Providers: `registerProvider()` API
- OpenAI-compatible APIs: `api: 'openai-completions'`

### Your Personal Setup

- Config: `~/.pi/agent/models.json`
- Proves custom Bedrock provider works
- Same approach, programmatic API

### POC Files

- Test script: `apps/server/test-bedrock-sdk-v2.ts`
- Results: 25 tool calls, no iteration limit
- Proves migration will work

---

## 🚀 Next Steps

1. **Review this document** with team
2. **Create backup branch** before migration
3. **Run POC again** to verify current state
4. **Start Phase 2** (Implementation)
5. **Test thoroughly** before deploying
6. **Monitor production** after deployment

---

## 💡 Pro Tips

### Tip 1: Test Incrementally

Don't migrate everything at once. Start with one model (e.g., zai.glm-5), verify it works, then add others.

### Tip 2: Keep Custom Provider Temporarily

Don't delete `bedrock-mantle-provider.ts` immediately. Keep it as backup until SDK version is proven in production.

### Tip 3: Use Feature Flag

Add environment variable to toggle between custom and SDK:

```typescript
const USE_SDK_BEDROCK = process.env.USE_SDK_BEDROCK === "true";

if (USE_SDK_BEDROCK) {
  // Use ModelRegistry
} else {
  // Use custom provider (fallback)
}
```

### Tip 4: Monitor Tool Call Counts

Add logging to track tool call counts in production:

```typescript
console.log(`[Bedrock] Tool calls: ${toolCallCount}`);
```

### Tip 5: Document Edge Cases

If you find any edge cases during migration, document them here for future reference.

---

## ✅ Success Criteria

Migration is successful when:

1. ✅ Bedrock models work via ModelRegistry
2. ✅ Tool calls exceed 10 without stopping
3. ✅ All existing tests pass
4. ✅ No regression in other providers
5. ✅ Production metrics stable
6. ✅ Custom provider deleted
7. ✅ Code complexity reduced
8. ✅ Team confident in new approach

---

**Last Updated**: 2026-04-07
**POC Status**: ✅ PROVEN (25 tool calls, no iteration limit)
**Migration Status**: 📋 READY TO START
