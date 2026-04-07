# Bedrock Implementation Gap Analysis

## 🎯 Problem Statement

Aplikasi kita menggunakan **custom Bedrock Mantle provider** yang implement sendiri tool loop, padahal Pi Agent SDK sudah support Bedrock via **custom provider configuration**.

## 📊 Current State vs Ideal State

### Your Personal Pi Agent Setup (~/.pi/agent/models.json)

```json
{
  "providers": {
    "bedrock": {
      "name": "AWS Bedrock",
      "api": "openai-completions", // ✅ Pi Agent SDK supports this!
      "baseUrl": "https://bedrock-mantle.ap-southeast-3.api.aws/v1",
      "apiKey": "...",
      "compat": {
        "supportsDeveloperRole": false,
        "supportsReasoningEffort": false
      },
      "models": [
        {
          "id": "moonshotai.kimi-k2.5",
          "name": "Kimi K2.5",
          "contextWindow": 128000,
          "maxTokens": 4096,
          "reasoning": false
        },
        {
          "id": "zai.glm-5",
          "name": "GLM-5",
          "contextWindow": 128000,
          "maxTokens": 4096,
          "reasoning": true
        }
      ]
    }
  }
}
```

**Key**: `"api": "openai-completions"` → Pi Agent SDK tahu cara handle ini!

### Our App's Current Implementation

```typescript
// apps/server/src/pi/index.ts
if (isMantle) {
  // ❌ CUSTOM IMPLEMENTATION - We bypass Pi Agent SDK!
  for await (const chunk of streamBedrockMantle(...)) {
    yield chunk;
  }
  return; // Exit early - don't use SDK
}

// ✅ For other providers - use SDK
const result = await createAgentSession({
  authStorage,
  model: piModel,
  tools,
});
```

## 🔍 Gap Analysis

| Aspect                    | Your Personal Setup     | Our App                        | Gap                              |
| ------------------------- | ----------------------- | ------------------------------ | -------------------------------- |
| **Provider Registration** | ✅ Via models.json      | ❌ Hardcoded in code           | Need models.json support         |
| **API Type**              | ✅ `openai-completions` | ❌ Custom streaming            | Need to use SDK's OpenAI adapter |
| **Tool Loop**             | ✅ SDK handles          | ❌ Manual loop (10 iterations) | **ROOT CAUSE**                   |
| **Streaming**             | ✅ SDK handles          | ❌ Manual SSE parsing          | Unnecessary complexity           |
| **Iteration Limit**       | ✅ None (SDK decides)   | ❌ 10 iterations               | **YOUR ISSUE**                   |
| **Error Handling**        | ✅ SDK handles          | ⚠️ Manual                      | More fragile                     |

## 🐛 Root Cause of Your Issue

**File**: `apps/server/src/providers/bedrock-mantle-provider.ts`

```typescript
// ❌ PROBLEM: We implement tool loop ourselves
const maxIterations = 10; // This is why it stops!

while (iteration < maxIterations) {
  // ... make API call
  // ... handle tool calls
  iteration++;
}

// Iteration 10 → STOP! Even if model wants to continue
```

**Your Personal Pi Agent**: No iteration limit! SDK handles everything.

## ✅ Solution: Use Pi Agent SDK Properly

### Option 1: Register Bedrock as Custom Provider (Recommended)

**Step 1**: Create models configuration file

```typescript
// apps/server/src/pi/models.json (NEW FILE)
{
  "providers": {
    "bedrock": {
      "name": "AWS Bedrock",
      "api": "openai-completions",
      "baseUrl": "${BEDROCK_BASE_URL}",
      "apiKey": "${BEDROCK_API_KEY}",
      "compat": {
        "supportsDeveloperRole": false,
        "supportsReasoningEffort": false
      },
      "models": [
        {
          "id": "moonshotai.kimi-k2.5",
          "name": "Kimi K2.5",
          "contextWindow": 128000,
          "maxTokens": 4096
        },
        {
          "id": "zai.glm-5",
          "name": "GLM-5",
          "contextWindow": 128000,
          "maxTokens": 4096,
          "reasoning": true
        }
      ]
    }
  }
}
```

**Step 2**: Load custom models in Pi Agent initialization

```typescript
// apps/server/src/pi/index.ts
import { loadCustomModels } from "@mariozechner/pi-ai";
import customModels from "./models.json";

// On startup
loadCustomModels(customModels);
```

**Step 3**: Remove custom Bedrock provider

```typescript
// apps/server/src/pi/index.ts
// ❌ DELETE THIS:
if (isMantle) {
  for await (const chunk of streamBedrockMantle(...)) {
    yield chunk;
  }
  return;
}

// ✅ Let SDK handle everything (including Bedrock)
const result = await createAgentSession({
  authStorage,
  model: piModel, // SDK will use openai-completions adapter
  tools,
});
```

**Step 4**: Delete custom provider file

```bash
rm apps/server/src/providers/bedrock-mantle-provider.ts
```

### Option 2: Quick Fix (Not Recommended)

Just remove iteration limit:

```typescript
// bedrock-mantle-provider.ts
while (true) {
  // No limit
  // ... existing code
}
```

**Why not recommended**: Still maintaining custom implementation when SDK can do it.

## 📈 Benefits of Using SDK

| Benefit              | Custom Implementation | Pi Agent SDK            |
| -------------------- | --------------------- | ----------------------- |
| **Iteration Limit**  | ❌ 10 (arbitrary)     | ✅ None (model decides) |
| **Code Maintenance** | ❌ ~500 lines         | ✅ ~10 lines            |
| **Bug Risk**         | ❌ High               | ✅ Low (battle-tested)  |
| **Feature Parity**   | ⚠️ Manual updates     | ✅ Automatic            |
| **Tool Loop**        | ❌ Manual             | ✅ Automatic            |
| **Streaming**        | ❌ Manual SSE         | ✅ Automatic            |
| **Error Handling**   | ⚠️ Custom             | ✅ Built-in             |

## 🚀 Migration Plan

### Phase 1: Research (1 hour)

- [ ] Check Pi Agent SDK docs for custom provider support
- [ ] Verify `openai-completions` API type works with our setup
- [ ] Test with one model (e.g., Kimi K2.5)

### Phase 2: Implementation (2-3 hours)

- [ ] Create `apps/server/src/pi/models.json`
- [ ] Load custom models in Pi Agent initialization
- [ ] Remove `isMantle` check in `runPiQuery()`
- [ ] Test Bedrock models use SDK path

### Phase 3: Cleanup (1 hour)

- [ ] Delete `bedrock-mantle-provider.ts`
- [ ] Remove Mantle-specific imports
- [ ] Update documentation
- [ ] Remove iteration limit workarounds

### Phase 4: Testing (2 hours)

- [ ] Test all Bedrock models
- [ ] Test tool calling (multiple iterations)
- [ ] Test streaming
- [ ] Test error handling
- [ ] Compare with your personal Pi Agent behavior

## 🎯 Expected Outcome

After migration:

```typescript
// apps/server/src/pi/index.ts - SIMPLIFIED!

export async function* runPiQuery(options: RunPiQueryOptions) {
  // Build tools
  const tools = await buildWorkspaceTools(toolOptions);

  // Create auth storage
  const authStorage = createAuthStorageWithCredentials(provider, credentials);

  // Get model (works for ALL providers including Bedrock)
  const piModel = getValidatedModel(provider, model);

  // Create session - SDK handles EVERYTHING
  const result = await createAgentSession({
    authStorage,
    model: piModel, // SDK knows it's openai-completions
    tools,
  });

  // Stream events
  for await (const event of result.session.events()) {
    yield translateEvent(event);
  }
}

// ✅ No special cases!
// ✅ No iteration limits!
// ✅ No manual tool loops!
// ✅ Works exactly like your personal Pi Agent!
```

## 📝 Key Insights

1. **Pi Agent SDK already supports OpenAI-compatible APIs** via `"api": "openai-completions"`
2. **Your personal setup proves this works** - you use it daily!
3. **Our custom implementation is unnecessary** - we reinvented the wheel poorly
4. **The iteration limit is artificial** - SDK doesn't have this limitation
5. **Migration is straightforward** - mostly deleting code!

## 🔗 References

- Your personal Pi Agent config: `~/.pi/agent/models.json`
- Pi Agent SDK docs: Check for `loadCustomModels()` or similar
- OpenAI-compatible API: Standard that Pi Agent supports

## ⚠️ Risk Assessment

**Migration Risk**: LOW

- SDK is battle-tested
- Your personal setup proves it works
- Mostly deleting problematic code
- Can test incrementally

**Staying with Custom**: HIGH

- Iteration limit causes issues
- Manual maintenance burden
- Feature lag behind SDK
- More bugs to fix

## 🎬 Next Steps

1. **Verify SDK API**: Check Pi Agent docs for custom provider registration
2. **Create models.json**: Copy from your personal setup
3. **Test in isolation**: Create test script to verify SDK handles Bedrock
4. **Migrate gradually**: Start with one model, then expand
5. **Delete custom code**: Remove bedrock-mantle-provider.ts

---

**Conclusion**: Kita harus migrate ke Pi Agent SDK's custom provider system. Custom implementation kita adalah technical debt yang menyebabkan masalah Anda.
