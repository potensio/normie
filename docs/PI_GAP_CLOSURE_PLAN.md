# Pi Integration Gap Closure Plan

## Current State

| Feature | Pi Agent SDK | Bedrock Mantle | Gap |
|---------|-------------|----------------|-----|
| Tools (bash, read, write, edit) | ✅ Native | ✅ Implemented | None |
| Tools (grep, find, ls) | ✅ Native | ✅ Implemented | ✅ Done |
| Web tools (search, fetch) | ✅ Native | ✅ Implemented | None |
| Composio tools | ✅ Dynamic | ✅ Dynamic | None |
| Skills | ✅ Auto-loaded | ✅ Implemented | ✅ Done |
| Extensions | ✅ Auto-loaded | ❌ Missing | Need to implement |
| Settings/themes | ✅ From ~/.pi | ❌ Missing | Need to implement |
| Session branching | ✅ Native | ⚠️ Partial | Via DB, not JSONL |
| Compaction | ✅ Native | ✅ Implemented | ✅ Done |

---

## Completed

### ✅ Gap #1: Missing Tools (grep, find, ls)

**Status:** Done (commit `b4f3c0c`)

**What was done:**
- Added `grepTool`, `findTool`, `lsTool` from `@mariozechner/pi-coding-agent`
- Included in full mode tools alongside `codingTools`
- Tools now available for file searching and directory listing

**Files modified:**
- `apps/server/src/pi/tools/index.ts`

---

### ✅ Gap #2: Compaction

**Status:** Done (commit `3fade16`)

**What was done:**
- Simple token estimation (~4 chars/token)
- Context check before each API call
- Warning log at 70% usage
- Auto-truncation when approaching limit
- Reserves 8000 tokens for response
- Keeps system message + most recent messages

**Files modified:**
- `apps/server/src/providers/bedrock-mantle-provider.ts`
- `apps/server/src/pi/index.ts`

**How it works:**
```
[Mantle:Context] ⚠️ Context usage: 75% (96000/128000 tokens)  # Warning >70%
[Mantle:Context] 🔧 Compacting context: 125000 > 120000      # Triggered
[Mantle:Context] Removed 5 old messages, new usage: 85000    # Result
```

---

## Remaining Gaps

### Gap #3: Skills

**What skills do:**
- Provide specialized workflows (e.g., langsearch for web search)
- Loaded on-demand when task matches description
- Can include scripts, references, templates

**How Pi SDK loads skills:**
```typescript
const skills = await loadSkills({
  agentDir: getAgentDir(),
  cwd: process.cwd(),
  settingsManager,
});
const skillPrompt = formatSkillsForPrompt(skills);
```

**Implementation:**

```typescript
// NEW FILE: apps/server/src/pi/skills.ts

import { loadSkills, formatSkillsForPrompt, SettingsManager } from '@mariozechner/pi-coding-agent';
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
      return '';
    }
    
    console.log(`[Skills] Loaded ${skills.length} skills:`, skills.map(s => s.name).join(', '));
    return formatSkillsForPrompt(skills);
  } catch (error) {
    console.error('[Skills] Error:', error);
    return '';
  }
}
```

**Files to modify:**
- `apps/server/src/pi/skills.ts` (NEW)
- `apps/server/src/pi/index.ts`
- `apps/server/src/providers/bedrock-mantle-provider.ts`

---

### Gap #4: Extensions

**What extensions do:**
- Register custom tools
- Hook into events (tool_call, session_start, etc.)
- Add commands
- Modify behavior (permission gates, custom renderers)

**Challenge:** Extensions expect TUI environment with `ctx.ui` for prompts, selects, etc. Normie runs as a backend API.

**Approach Options:**

1. **Skip for now** - Document limitation, extensions work in Pi TUI only
2. **Tool-only extensions** - Load extensions that only register tools without UI
3. **Full adapter** - Virtual UI mapping to frontend via WebSocket

**Recommendation:** Defer. Document that extensions are Pi TUI-only for now.

---

### Gap #5: Settings Integration

**What it does:**
- Read `~/.pi/agent/settings.json` for defaults
- Allow same settings for Pi TUI and Normie
- Provider/model preferences, thinking level, theme

**Implementation:**

```typescript
// NEW FILE: apps/server/src/pi/settings-loader.ts

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
    console.error('[Settings] Error:', error);
    return { defaultProvider: undefined, defaultModel: undefined, thinkingLevel: 'medium', theme: 'dark' };
  }
}
```

**Files to modify:**
- `apps/server/src/pi/settings-loader.ts` (NEW)
- `apps/server/src/pi/index.ts`
- `apps/server/src/routes/chats.ts`

---

## Implementation Priority

| Priority | Gap | Effort | Status |
|----------|-----|--------|--------|
| 1 | Missing tools (grep, find, ls) | Low | ✅ Done |
| 2 | Compaction | Medium | ✅ Done |
| 3 | Skills loading | Medium | ❌ Next |
| 4 | Settings integration | Low | ❌ Pending |
| 5 | Extensions support | High | ❌ Defer |

---

## Testing Checklist

- [x] `grep`, `find`, `ls` tools work in Bedrock Mantle path
- [x] Compaction triggers when context approaches limit
- [x] Context warning logged at 70% usage
- [ ] Skills from `~/.pi/agent/skills/` loaded and formatted
- [ ] Pi settings used for default provider/model
- [ ] Extensions: Document limitation (Pi TUI only)

---

## Summary

**Completed:**
- ✅ Missing tools added
- ✅ Compaction implemented

**Next:**
- Skills loading
- Settings integration

**Deferred:**
- Extensions (complex, requires UI adapter)