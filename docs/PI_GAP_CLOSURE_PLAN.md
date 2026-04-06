# Pi Integration Gap Closure Plan

## Current State

| Feature | Pi Agent SDK | Bedrock Mantle | Gap |
|---------|-------------|----------------|-----|
| Tools (bash, read, write, edit) | ✅ Native | ✅ Implemented | None |
| Tools (grep, find, ls) | ✅ Native | ❌ Missing | Need to add |
| Web tools (search, fetch) | ✅ Native | ✅ Implemented | None |
| Composio tools | ✅ Dynamic | ✅ Dynamic | None |
| Skills | ✅ Auto-loaded | ❌ Missing | Need to implement |
| Extensions | ✅ Auto-loaded | ❌ Missing | Need to implement |
| Settings/themes | ✅ From ~/.pi | ❌ Missing | Need to implement |
| Session branching | ✅ Native | ⚠️ Partial | Via DB, not JSONL |
| Compaction | ✅ Native | ❌ Missing | Need to implement |

## Gap #1: Skills

**What skills do:**
- Provide specialized workflows (e.g., langsearch for web search)
- Loaded on-demand when task matches description
- Can include scripts, references, templates

**How Pi SDK loads skills:**
```typescript
// pi scans skill directories and builds descriptions
const skills = await loadSkills({
  agentDir: getAgentDir(),
  cwd: process.cwd(),
  settingsManager,
});

// Skills are included in system prompt as XML
const skillPrompt = formatSkillsForPrompt(skills);
```

**Implementation for Mantle:**

```typescript
// NEW FILE: pi/skills.ts

import { loadSkills, formatSkillsForPrompt } from '@mariozechner/pi-coding-agent';

export async function loadWorkspaceSkills(cwd: string): Promise<string> {
  const agentDir = path.join(os.homedir(), '.pi', 'agent');
  
  // Load skills from standard locations
  const skills = await loadSkills({
    agentDir,
    cwd,
    // Use default settings manager
  });
  
  // Format as XML for system prompt
  return formatSkillsForPrompt(skills);
}
```

Then in `pi/index.ts`:

```typescript
// When building system prompt
const skillsPrompt = await loadWorkspaceSkills(cwd);
const fullSystemPrompt = systemPrompt + '\n\n' + skillsPrompt;
```

**Files to modify:**
- `apps/server/src/pi/skills.ts` (NEW)
- `apps/server/src/pi/index.ts`
- `apps/server/src/providers/bedrock-mantle-provider.ts` (add skills to system prompt)

---

## Gap #2: Extensions

**What extensions do:**
- Register custom tools
- Hook into events (tool_call, session_start, etc.)
- Add commands
- Modify behavior (permission gates, custom renderers)

**Challenge:** Extensions are designed for the TUI environment with `ctx.ui` for prompts, selects, etc. Normie runs as a backend API without direct UI.

**Approach A: Extension Adapter (Recommended)**

Create an adapter that provides stub implementations for UI methods:

```typescript
// NEW FILE: pi/extension-adapter.ts

import { ExtensionAPI } from '@mariozechner/pi-coding-agent';

export class NormieExtensionContext {
  ui = {
    notify: (msg: string) => console.log(`[Extension] ${msg}`),
    confirm: async (title: string, message: string) => {
      // Log and auto-approve for now
      console.log(`[Extension] Auto-confirming: ${title} - ${message}`);
      return true;
    },
    select: async () => null, // Not supported in API mode
    input: async () => '',    // Not supported in API mode
    // ... other UI methods as stubs
  };
}
```

**Approach B: Extension Whitelist**

Only load extensions that don't require UI:

```json
// settings.json
{
  "backendExtensions": [
    "~/.pi/agent/extensions/my-backend-tool.ts"
  ]
}
```

**Files to modify:**
- `apps/server/src/pi/extensions.ts` (NEW)
- `apps/server/src/pi/index.ts`

---

## Gap #3: Missing Tools (grep, find, ls)

**Current state:**
```typescript
// codingTools = [readTool, bashTool, editTool, writeTool]
// readOnlyTools = [readTool, grepTool, findTool, lsTool]
```

Only `codingTools` is passed. Need to include `grep`, `find`, `ls`.

**Fix:**
```typescript
// pi/tools/index.ts

// Option A: Add to coding tools
const allCodingTools = [
  ...codingTools,     // read, bash, edit, write
  grepTool,
  findTool,
  lsTool,
];

// Option B: Import separately
import { grepTool, findTool, lsTool } from '@mariozechner/pi-coding-agent';
```

**Files to modify:**
- `apps/server/src/pi/tools/index.ts`

---

## Gap #4: Compaction

**What compaction does:**
- Summarizes old messages when context window fills
- Preserves recent messages
- Avoids context overflow errors

**How Pi SDK does it:**
```typescript
// AgentSession internally manages context
// Triggers compaction on overflow or approaching limit
const compactionResult = await compact(messages, {
  maxTokens: model.contextWindow,
  // ...
});
```

**Implementation for Mantle:**

The Mantle provider needs to track token usage and compact when needed.

```typescript
// bedrock-mantle-provider.ts

import { compact, estimateTokens } from '@mariozechner/pi-coding-agent';

// Track token usage
let totalTokens = 0;

// Before each request, check if compaction needed
const estimatedTokens = estimateTokens(conversationMessages);
if (estimatedTokens > model.contextWindow * 0.9) {
  const { messages: compacted, summary } = await compact(conversationMessages, {
    maxTokens: model.contextWindow,
    keepRecent: 10,
  });
  conversationMessages = compacted;
  console.log('[Mantle] Compacted context, saved', summary);
}
```

**Files to modify:**
- `apps/server/src/providers/bedrock-mantle-provider.ts`
- Import from `@mariozechner/pi-coding-agent`

---

## Gap #5: Theme/Settings Integration

**Current state:** Normie uses its own config, not reading from `~/.pi/agent/settings.json`.

**Goal:** Allow users to use the same settings for both Pi TUI and Normie.

**Implementation:**

```typescript
// NEW FILE: pi/settings-loader.ts

import { SettingsManager } from '@mariozechner/pi-coding-agent';

export async function loadPiSettings() {
  const agentDir = path.join(os.homedir(), '.pi', 'agent');
  const settingsManager = await SettingsManager.create(process.cwd(), agentDir);
  
  return {
    defaultProvider: settingsManager.getDefaultProvider(),
    defaultModel: settingsManager.getDefaultModel(),
    thinkingLevel: settingsManager.getDefaultThinkingLevel(),
    theme: settingsManager.getTheme(),
    // ...
  };
}
```

**Files to modify:**
- `apps/server/src/pi/settings-loader.ts` (NEW)
- `apps/server/src/pi/index.ts`
- `apps/server/src/routes/chats.ts` (use Pi settings for defaults)

---

## Implementation Priority

| Priority | Gap | Effort | Impact |
|----------|-----|--------|--------|
| 1 | Missing tools (grep, find, ls) | Low | High |
| 2 | Skills loading | Medium | High |
| 3 | Settings integration | Low | Medium |
| 4 | Extensions support | High | Medium |
| 5 | Compaction | Medium | High |

---

## Detailed Implementation Plan

### Phase 1: Missing Tools (Quick Win)

**File:** `apps/server/src/pi/tools/index.ts`

```typescript
// Add imports
import { codingTools, readOnlyTools, grepTool, findTool, lsTool } from '@mariozechner/pi-coding-agent';

// In buildWorkspaceTools()
if (includeCodingTools) {
  tools.push(...codingTools);
  // Add these to full mode
  if (!readOnlyMode) {
    tools.push(grepTool, findTool, lsTool);
  }
}
```

### Phase 2: Skills

**New File:** `apps/server/src/pi/skills.ts`

```typescript
import { loadSkills, formatSkillsForPrompt, SettingsManager } from '@mariozechner/pi-coding-agent';
import { getAgentDir } from '@mariozechner/pi-coding-agent';
import path from 'node:path';
import os from 'node:os';

export async function buildSkillsPrompt(cwd: string): Promise<string> {
  try {
    const agentDir = path.join(os.homedir(), '.pi', 'agent');
    const settingsManager = await SettingsManager.create(cwd, agentDir);
    
    const skills = await loadSkills({
      agentDir,
      cwd,
      settingsManager,
    });
    
    if (skills.length === 0) {
      console.log('[Skills] No skills found');
      return '';
    }
    
    console.log(`[Skills] Loaded ${skills.length} skills:`, skills.map(s => s.name).join(', '));
    return formatSkillsForPrompt(skills);
  } catch (error) {
    console.error('[Skills] Error loading skills:', error);
    return '';
  }
}
```

**Modify:** `apps/server/src/pi/index.ts` and `apps/server/src/providers/bedrock-mantle-provider.ts`

### Phase 3: Settings Integration

**New File:** `apps/server/src/pi/settings-loader.ts`

```typescript
import { SettingsManager } from '@mariozechner/pi-coding-agent';
import path from 'node:path';
import os from 'node:os';

export interface PiSettings {
  defaultProvider: string | undefined;
  defaultModel: string | undefined;
  thinkingLevel: string;
  theme: string;
}

export async function loadPiSettings(cwd: string = process.cwd()): Promise<PiSettings> {
  const agentDir = path.join(os.homedir(), '.pi', 'agent');
  
  try {
    const settingsManager = await SettingsManager.create(cwd, agentDir);
    
    return {
      defaultProvider: settingsManager.getDefaultProvider(),
      defaultModel: settingsManager.getDefaultModel(),
      thinkingLevel: settingsManager.getDefaultThinkingLevel() || 'medium',
      theme: settingsManager.getTheme() || 'dark',
    };
  } catch (error) {
    console.error('[Settings] Error loading Pi settings:', error);
    return {
      defaultProvider: undefined,
      defaultModel: undefined,
      thinkingLevel: 'medium',
      theme: 'dark',
    };
  }
}
```

### Phase 4: Extensions (Complex)

This requires more thought. Extensions expect a TUI environment. Options:

1. **Skip for now** - Document that extensions work in Pi TUI but not Normie API
2. **Load tool-only extensions** - Extensions that only register tools without UI
3. **Full adapter** - Create a virtual UI that maps to frontend via WebSocket

**Recommendation:** Start with Option 2, document limitation.

### Phase 5: Compaction

**Modify:** `apps/server/src/providers/bedrock-mantle-provider.ts`

```typescript
import { compact, estimateTokens } from '@mariozechner/pi-coding-agent';

// In streamBedrockMantle, before API call:
async function checkAndCompact(
  messages: ChatMessage[],
  model: { contextWindow: number }
): Promise<ChatMessage[]> {
  const estimatedTokens = estimateTokens(
    messages.map(m => ({ role: m.role, content: m.content || '' }))
  );
  
  if (estimatedTokens > model.contextWindow * 0.85) {
    console.log(`[Mantle] Context approaching limit: ${estimatedTokens}/${model.contextWindow}`);
    
    const result = await compact(messages.map(m => ({
      role: m.role,
      content: m.content || '',
    })), {
      maxTokens: Math.floor(model.contextWindow * 0.7),
      keepRecent: 10,
    });
    
    console.log(`[Mantle] Compacted to ${result.messages.length} messages`);
    return result.messages;
  }
  
  return messages;
}
```

---

## Testing Plan

After each phase:

1. **Phase 1:** Test `grep`, `find`, `ls` tools work
2. **Phase 2:** Verify skills from `~/.pi/agent/skills/` are loaded
3. **Phase 3:** Check default provider/model from `~/.pi/agent/settings.json` used
4. **Phase 4:** Test tool-only extensions load (if implemented)
5. **Phase 5:** Test long conversations trigger compaction

---

## Summary

The biggest gaps are:
1. **Skills** - Essential for workflows like langsearch
2. **Missing tools** - Easy fix
3. **Compaction** - Essential for long conversations
4. **Extensions** - Complex, may defer
5. **Settings** - Nice to have for consistency

**Recommended order:** 1 (tools) → 2 (skills) → 5 (compaction) → 3 (settings) → 4 (extensions)