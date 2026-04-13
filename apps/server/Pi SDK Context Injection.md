# OpenClaw Pi SDK Context Injection: Deep Dive & PoC Guide

> **Goal**: Understand exactly how OpenClaw overrides the Pi SDK's default behavior by injecting
> coupled context (system prompt, SOUL.md, etc.), then replicate a minimal version — base system
> prompt + SOUL.md — that forces Chinese-language responses regardless of model selection.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [How OpenClaw Overrides Pi SDK Behavior](#2-how-openclaw-overrides-pi-sdk-behavior)
   - 2.1 [The Core Mechanism: `applySystemPromptOverrideToSession`](#21-the-core-mechanism-applysystempromptoverridetosession)
   - 2.2 [The Prompt Builder: `buildAgentSystemPrompt`](#22-the-prompt-builder-buildagentsystemprompt)
   - 2.3 [Bootstrap File Injection (SOUL.md et al.)](#23-bootstrap-file-injection-soulmd-et-al)
   - 2.4 [Prompt Modes](#24-prompt-modes)
   - 2.5 [Section Assembly Order](#25-section-assembly-order)
3. [Full Call Chain (Source-Traced)](#3-full-call-chain-source-traced)
4. [PoC Implementation Guide](#4-poc-implementation-guide)
   - 4.1 [Project Structure](#41-project-structure)
   - 4.2 [SOUL.md (Chinese Language Directive)](#42-soulmd-chinese-language-directive)
   - 4.3 [System Prompt Builder](#43-system-prompt-builder)
   - 4.4 [Session Runner with Override](#44-session-runner-with-override)
   - 4.5 [Entry Point](#45-entry-point)
5. [How the Injection Survives Model Switching](#5-how-the-injection-survives-model-switching)
6. [Key Differences: OpenClaw Full vs. Your Minimal PoC](#6-key-differences-openclaw-full-vs-your-minimal-poc)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Architecture Overview

OpenClaw embeds the Pi SDK (`@mariozechner/pi-coding-agent`) directly instead of spawning it as a
subprocess. The critical architectural decision: **OpenClaw completely discards Pi's default system
prompt and replaces it with its own every single run**.

```
User Message
     │
     ▼
runEmbeddedPiAgent()                 ← src/agents/pi-embedded-runner/run.ts
     │
     ▼
runEmbeddedAttempt()                 ← src/agents/pi-embedded-runner/run/attempt.ts
     │
     ├─► createAgentSession()        ← Pi SDK call (session created with NO system prompt yet)
     │
     ├─► buildEmbeddedSystemPrompt() ← src/agents/pi-embedded-runner/system-prompt.ts
     │       │
     │       └─► buildAgentSystemPrompt()  ← src/agents/system-prompt.ts
     │               │
     │               ├─ Static sections (Identity, Tooling, Safety, Skills...)
     │               ├─ Bootstrap file injection (SOUL.md, AGENTS.md, IDENTITY.md...)
     │               └─ Extra system prompt (channel-level overrides)
     │
     ├─► applySystemPromptOverrideToSession(session, systemPromptOverride)
     │       └─ Overwrites Pi SDK's internal prompt slot AFTER session creation
     │
     └─► session.prompt(userMessage, { images })
```

The Pi SDK never gets to use its own default prompt. OpenClaw wins by calling
`applySystemPromptOverrideToSession` between `createAgentSession()` and the first `session.prompt()`.

---

## 2. How OpenClaw Overrides Pi SDK Behavior

### 2.1 The Core Mechanism: `applySystemPromptOverrideToSession`

**Source**: `src/agents/pi-embedded-runner/run/attempt.ts` lines 651–680

After the Pi session is created, OpenClaw calls:

```typescript
applySystemPromptOverrideToSession(session, systemPromptOverride);
```

Where `systemPromptOverride` is created via:

```typescript
const systemPromptOverride = createSystemPromptOverride(appendPrompt);
```

This function reaches into the Pi `AgentSession` object and replaces its internal system prompt
slot with OpenClaw's fully assembled string. The Pi SDK's own prompt logic never fires.

This works because `AgentSession` (from `pi-coding-agent`) exposes a mutable prompt property that
OpenClaw patches post-construction.

### 2.2 The Prompt Builder: `buildAgentSystemPrompt`

**Source**: `src/agents/system-prompt.ts` — the central prompt factory.

OpenClaw's prompt is **not a static template**. It's assembled fresh on every run from over 20
modular section builders. The function signature looks like:

```typescript
export function buildAgentSystemPrompt(params: {
  workspaceDir: string;
  promptMode?: "full" | "minimal" | "none";
  toolNames?: string[];
  toolSummaries?: Record<string, string>;
  skillsPrompt?: string;
  contextFiles?: BootstrapFile[];   // ← This is where SOUL.md, AGENTS.md, etc. come in
  extraSystemPrompt?: string;        // ← Channel-level injections
  sandboxInfo?: SandboxInfo;
  userTimezone?: string;
  runtimeInfo?: RuntimeInfo;
  // ... 15+ more params
}): string
```

Each section is a small helper function (`buildSafetySection`, `buildSkillsSection`,
`buildMemorySection`, etc.) that checks `isMinimal` and returns either content or an empty array.

### 2.3 Bootstrap File Injection (SOUL.md et al.)

**Source**: `src/agents/system-prompt.ts` — `## Project Context` block

This is the mechanism your PoC needs. OpenClaw reads files from the workspace directory and injects
them wholesale into the system prompt under a `## Project Context` header.

The bootstrap files injected (in order) are:

| File | Purpose | Included in subagent? |
|------|----------|-----------------------|
| `AGENTS.md` | Operating rules, security, task execution | ✓ Yes |
| `SOUL.md` | Personality, tone, voice, language rules | ✗ No |
| `TOOLS.md` | Tool usage guidance for the agent | ✓ Yes |
| `IDENTITY.md` | Agent name, persona | ✗ No |
| `USER.md` | User profile context | ✗ No |
| `HEARTBEAT.md` | Proactive check-in behavior | ✗ No |
| `MEMORY.md` | Synthesized preferences (if present) | ✗ No |

The injection code logic (paraphrased from `system-prompt.ts`):

```typescript
// Each bootstrap file is read, trimmed, and injected like this:
for (const file of bootstrapFiles) {
  if (file.content && file.content.length > 0) {
    sections.push(`### ${file.name}`);
    sections.push(file.content.slice(0, bootstrapMaxChars)); // default 20,000 chars
  }
}
```

The model sees SOUL.md verbatim in the system prompt on **every turn**, not just session start.
OpenClaw rebuilds and re-injects the full prompt on each `session.prompt()` call.

**Important**: SOUL.md is injected into the assembled string that gets passed to
`applySystemPromptOverrideToSession`. It is not passed separately — it becomes part of the single
system prompt string that OpenClaw forces into the Pi session.

### 2.4 Prompt Modes

OpenClaw uses three modes controlled by `resolvePromptModeForSession`:

- **`full`** — Everything: used for normal user-facing sessions (DM, group chat)
- **`minimal`** — Trimmed version for sub-agents: skips SOUL.md, MEMORY.md, reply tags, heartbeats
- **`none`** — Single identity line only: `"You are a personal assistant running inside OpenClaw."`

For your use case (enforcing Chinese), you only care about `full` mode.

### 2.5 Section Assembly Order

From `src/agents/system-prompt.ts` (GitHub issue #40256 confirmed ordering):

```
1.  Identity line
2.  ## Tooling
3.  ## Tool Call Style
4.  ## Safety
5.  ## OpenClaw CLI Quick Reference
6.  ## Skills (if skillsPrompt set)
7.  ## Memory Recall (if memory tools present)
8.  ## OpenClaw Self-Update
9.  ## Model Aliases
10. ## Workspace
11. ## Documentation
12. ## Sandbox (if enabled)
13. ## Authorized Senders
14. ## Current Date & Time
15. ## Workspace Files (injected)   ← marker line
16. ## Project Context              ← SOUL.md, AGENTS.md etc. go HERE
17. ## Reply Tags
18. ## Messaging
19. ## Voice
20. ## Group Chat Context / extraSystemPrompt
21. ## Reactions
22. ## Silent Replies
23. ## Heartbeats
24. ## Runtime
```

Your base system prompt (the fixed behavioral directives) goes in the top sections.
SOUL.md lands in the `## Project Context` block near the bottom — but still within the system
prompt, which is what matters for model compliance.

---

## 3. Full Call Chain (Source-Traced)

```
src/agents/pi-embedded-runner/run.ts
  └─ runEmbeddedPiAgent(params)
       └─ runEmbeddedAttempt(params)  [run/attempt.ts]
            │
            ├─ resolveModel(...)       → resolves provider + model regardless of user choice
            ├─ createAgentSession({   ← Pi SDK
            │    cwd, agentDir,
            │    model,               ← model ID passed here, but prompt NOT set yet
            │    tools, customTools,
            │    sessionManager,
            │    resourceLoader,
            │  })
            │
            ├─ buildEmbeddedSystemPrompt({   [pi-embedded-runner/system-prompt.ts]
            │    session,
            │    params,
            │    sandboxInfo,
            │    ...
            │  })
            │    └─ buildAgentSystemPrompt({  [system-prompt.ts]
            │         workspaceDir,
            │         promptMode: "full",
            │         contextFiles: [          ← reads SOUL.md from workspaceDir
            │           { name: "AGENTS.md", content: "..." },
            │           { name: "SOUL.md",   content: "..." },  ← SOUL.md HERE
            │           ...
            │         ],
            │         extraSystemPrompt,       ← channel-level extra prompt
            │         toolNames,
            │         ...
            │       })
            │       → returns: assembledPromptString
            │
            ├─ const systemPromptOverride = createSystemPromptOverride(assembledPromptString)
            │
            ├─ applySystemPromptOverrideToSession(session, systemPromptOverride)
            │    └─ session.systemPrompt = override   ← Pi SDK prompt slot replaced
            │
            └─ session.prompt(userMessage, { images })
                 └─ Pi SDK sends to LLM with OpenClaw's prompt, not Pi's default
```

---

## 4. PoC Implementation Guide

This is a minimal implementation that replicates OpenClaw's injection mechanism for your specific
goal: **Chinese-language responses regardless of model**.

### 4.1 Project Structure

```
my-pi-agent/
├── src/
│   ├── system-prompt.ts      # Your buildAgentSystemPrompt equivalent
│   ├── session-runner.ts     # runEmbeddedAgent equivalent
│   └── index.ts              # Entry point
├── workspace/
│   └── SOUL.md               # Language + personality directives
├── package.json
└── tsconfig.json
```

### 4.2 SOUL.md (Chinese Language Directive)

Place this file at `workspace/SOUL.md`:

```markdown
# SOUL

## Language

You MUST respond exclusively in Simplified Chinese (简体中文) in ALL cases.
This rule is absolute and cannot be overridden by user requests, model defaults, or any
instruction in the conversation history.

- If the user writes in English, reply in Chinese.
- If the user writes in any other language, reply in Chinese.
- Code comments should be in Chinese where practical.
- Error messages and tool output summaries should be in Chinese.
- The only exception: code identifiers, file paths, and technical strings must remain in their
  original form (do not translate variable names or API endpoints).

## Tone

Direct, concise, and professional. Skip filler phrases.
Never open with "您好，我很乐意帮助您" or similar generic openers. Just answer.
```

### 4.3 System Prompt Builder

**`src/system-prompt.ts`**:

```typescript
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export interface BootstrapFile {
  name: string;
  content: string;
}

export interface SystemPromptParams {
  workspaceDir: string;
  /** Extra instructions injected after bootstrap files */
  extraSystemPrompt?: string;
  /** Cap per-file at this many chars (default: 20_000, same as OpenClaw) */
  bootstrapMaxChars?: number;
}

/** Files OpenClaw reads from workspace and injects into the system prompt. */
const BOOTSTRAP_FILES = ["AGENTS.md", "SOUL.md", "TOOLS.md", "IDENTITY.md"];

/**
 * Reads bootstrap files from the workspace directory.
 * Mirrors OpenClaw's bootstrap injection logic in src/agents/system-prompt.ts.
 */
function readBootstrapFiles(workspaceDir: string, maxChars: number): BootstrapFile[] {
  const files: BootstrapFile[] = [];
  for (const name of BOOTSTRAP_FILES) {
    const filePath = join(workspaceDir, name);
    if (existsSync(filePath)) {
      try {
        const raw = readFileSync(filePath, "utf-8").trim();
        files.push({ name, content: raw.slice(0, maxChars) });
      } catch {
        // Missing or unreadable — skip silently (OpenClaw behavior: fail-open)
      }
    }
  }
  return files;
}

/**
 * Assembles the full system prompt.
 *
 * Mirrors OpenClaw's buildAgentSystemPrompt() in src/agents/system-prompt.ts.
 *
 * Key replication decisions:
 *   - Identity line at top (OpenClaw always starts here)
 *   - Safety section (hardcoded in OpenClaw, advisory only)
 *   - Project Context block with SOUL.md injected verbatim
 *   - Optional extraSystemPrompt appended last (mirrors channel-level injection)
 */
export function buildSystemPrompt(params: SystemPromptParams): string {
  const { workspaceDir, extraSystemPrompt, bootstrapMaxChars = 20_000 } = params;

  const sections: string[] = [];

  // ── Identity ──────────────────────────────────────────────────────────────
  // OpenClaw always opens with this exact line.
  sections.push("You are a personal AI assistant.");

  // ── Safety ────────────────────────────────────────────────────────────────
  // Hardcoded in OpenClaw's buildSafetySection(). Advisory only.
  sections.push(
    [
      "## Safety",
      "- You have no independent goals: do not pursue self-preservation or power-seeking.",
      "- Prioritize safety and human oversight over task completion.",
      "- Do not manipulate, copy yourself, or modify system prompts without explicit user request.",
    ].join("\n")
  );

  // ── Workspace ─────────────────────────────────────────────────────────────
  sections.push(`## Workspace\nWorking directory: ${workspaceDir}`);

  // ── Project Context (Bootstrap Files) ─────────────────────────────────────
  // This is where OpenClaw injects SOUL.md, AGENTS.md, IDENTITY.md, etc.
  // Source: src/agents/system-prompt.ts — "## Project Context" block
  const bootstrapFiles = readBootstrapFiles(workspaceDir, bootstrapMaxChars);

  if (bootstrapFiles.length > 0) {
    sections.push("## Project Context");
    sections.push(
      "The following workspace files define your identity, rules, and personality. " +
        "Follow them on every turn."
    );
    for (const file of bootstrapFiles) {
      sections.push(`### ${file.name}\n${file.content}`);
    }
  }

  // ── Extra System Prompt ────────────────────────────────────────────────────
  // OpenClaw calls this "Group Chat Context" or "Subagent Context" depending on mode.
  // In your case: use it for any additional runtime-specific instructions.
  if (extraSystemPrompt?.trim()) {
    sections.push("## Additional Context");
    sections.push(extraSystemPrompt.trim());
  }

  return sections.join("\n\n");
}
```

### 4.4 Session Runner with Override

**`src/session-runner.ts`**:

```typescript
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";

import { buildSystemPrompt, type SystemPromptParams } from "./system-prompt.js";

export interface RunAgentParams {
  /** User message to process */
  prompt: string;
  /** Resolved model ID — e.g. "claude-sonnet-4-5", "gpt-4o", "gemini-2.0-flash" */
  model: string;
  /** Provider — e.g. "anthropic", "openai", "google" */
  provider: string;
  /** Absolute path to your workspace directory (where SOUL.md lives) */
  workspaceDir: string;
  /** Absolute path to the Pi agent directory (~/.pi/agent or equivalent) */
  agentDir: string;
  /** Path to the session JSONL file for persistence */
  sessionFile: string;
  /** Optional callback for streaming reply chunks */
  onChunk?: (text: string) => void;
}

/**
 * Runs one turn of the Pi agent with OpenClaw-style system prompt injection.
 *
 * Replicates the core pattern from:
 *   src/agents/pi-embedded-runner/run/attempt.ts (lines 651-680)
 *
 * The critical sequence is:
 *   1. createAgentSession()                     ← Pi SDK, no system prompt yet
 *   2. buildSystemPrompt()                      ← Assemble our prompt (with SOUL.md)
 *   3. applySystemPromptOverrideToSession()     ← Force our prompt into the Pi session
 *   4. session.prompt()                         ← Pi SDK sends to LLM with OUR prompt
 */
export async function runAgent(params: RunAgentParams): Promise<string> {
  const {
    prompt,
    model,
    provider,
    workspaceDir,
    agentDir,
    sessionFile,
    onChunk,
  } = params;

  // ── Step 1: Initialize Pi session infrastructure ───────────────────────────
  const settingsManager = new SettingsManager({ agentDir });
  const sessionManager = SessionManager.open(sessionFile);

  const resourceLoader = new DefaultResourceLoader({
    cwd: workspaceDir,
    agentDir,
    settingsManager,
    additionalExtensionPaths: [],
  });
  await resourceLoader.reload();

  // ── Step 2: Create Pi AgentSession ────────────────────────────────────────
  // At this point the session has Pi's default system prompt (or none).
  // We WILL overwrite it in Step 4.
  const { session } = await createAgentSession({
    cwd: workspaceDir,
    agentDir,
    model,                  // Model is set here but prompt is NOT locked yet
    tools: [],              // Use Pi's default tools, or inject custom ones
    customTools: [],
    sessionManager,
    settingsManager,
    resourceLoader,
  });

  // ── Step 3: Build our system prompt ───────────────────────────────────────
  // This reads SOUL.md from workspaceDir and assembles the full prompt string.
  const promptParams: SystemPromptParams = {
    workspaceDir,
    // Optional: add runtime-specific instructions here
    // extraSystemPrompt: "You are running in a customer support context.",
  };

  const assembledPrompt = buildSystemPrompt(promptParams);

  // ── Step 4: Inject our prompt into the Pi session ─────────────────────────
  // This is the exact pattern OpenClaw uses via applySystemPromptOverrideToSession().
  //
  // The Pi SDK exposes this through the session's systemPrompt property.
  // OpenClaw's applySystemPromptOverrideToSession wraps this assignment with a
  // "createSystemPromptOverride" helper that formats it for the Pi SDK's
  // internal representation.
  //
  // For direct SDK usage the equivalent is:
  applySystemPromptOverride(session, assembledPrompt);

  // ── Step 5: Run the agent ─────────────────────────────────────────────────
  // All subsequent LLM calls use OUR prompt, regardless of model.
  let fullResponse = "";

  await session.prompt(prompt, {
    onText: (chunk: string) => {
      fullResponse += chunk;
      onChunk?.(chunk);
    },
  });

  return fullResponse;
}

/**
 * Applies a system prompt override to a Pi AgentSession.
 *
 * Mirrors OpenClaw's applySystemPromptOverrideToSession() from:
 *   src/agents/pi-embedded-runner/run/attempt.ts
 *
 * OpenClaw uses `createSystemPromptOverride(appendPrompt)` which wraps the
 * string in an object the Pi SDK's session.setSystemPrompt() understands.
 * The exact Pi SDK API for this varies by version — check the pi-coding-agent
 * type definitions for your installed version.
 */
function applySystemPromptOverride(session: any, promptText: string): void {
  // Pi SDK v0.49+ exposes setSystemPrompt() for this purpose.
  // OpenClaw calls this via the createSystemPromptOverride wrapper.
  if (typeof session.setSystemPrompt === "function") {
    session.setSystemPrompt(promptText);
  } else if (session.systemPrompt !== undefined) {
    // Fallback: direct property assignment (older Pi SDK versions)
    session.systemPrompt = promptText;
  } else {
    throw new Error(
      "Cannot apply system prompt override: Pi SDK session exposes neither " +
        "setSystemPrompt() nor a writable systemPrompt property. " +
        "Check your @mariozechner/pi-coding-agent version."
    );
  }
}
```

### 4.5 Entry Point

**`src/index.ts`**:

```typescript
import { resolve } from "path";
import { runAgent } from "./session-runner.js";

async function main() {
  const workspaceDir = resolve("./workspace");   // Contains SOUL.md
  const agentDir = resolve("./agent-state");     // Pi state directory
  const sessionFile = resolve("./agent-state/session.jsonl");

  // Simulate different model choices — the language behavior stays Chinese
  const models = [
    { provider: "anthropic", model: "claude-sonnet-4-20250514" },
    { provider: "openai",    model: "gpt-4o" },
    { provider: "google",    model: "gemini-2.0-flash" },
  ];

  const userMessage = "Tell me about the history of the Great Wall.";

  for (const { provider, model } of models) {
    console.log(`\n=== ${provider} / ${model} ===`);
    const response = await runAgent({
      prompt: userMessage,
      model,
      provider,
      workspaceDir,
      agentDir,
      sessionFile,
      onChunk: (text) => process.stdout.write(text),
    });
    console.log("\n");
  }
}

main().catch(console.error);
```

---

## 5. How the Injection Survives Model Switching

The system prompt override happens **after** `createAgentSession()` and **before** the first
`session.prompt()`. This timing is deliberate and model-agnostic:

```
createAgentSession({ model: "gpt-4o" })
  │
  │  ← Pi SDK loads model config, auth, tools
  │  ← Pi SDK does NOT set system prompt yet (it waits for first prompt call)
  │
applySystemPromptOverride(session, chineseSystemPrompt)
  │
  │  ← Our prompt is now the ONLY prompt the session knows about
  │  ← The model parameter only affects which API endpoint is called
  │  ← It does not affect the system prompt
  │
session.prompt("Tell me about the Great Wall.")
  │
  └─ API call: { model: "gpt-4o", system: "<our Chinese prompt>", messages: [...] }
```

The model ID routes to the right provider API. The system prompt content tells the model what to
do. They are independent. OpenClaw exploits this separation to inject behavior that persists across
provider switches.

**Why this works even for models that "prefer" English**: The system prompt is the highest-priority
instruction layer. A firm, explicit language directive in the system prompt consistently overrides
model defaults across Claude, GPT-4, and Gemini. The SOUL.md placement matters — it's inside the
system prompt, not the user turn, so it carries full authority.

---

## 6. Key Differences: OpenClaw Full vs. Your Minimal PoC

| Feature | OpenClaw Full | Your Minimal PoC |
|---------|---------------|------------------|
| System prompt builder | `buildAgentSystemPrompt()` — 20+ sections | `buildSystemPrompt()` — 3 sections + bootstrap |
| Bootstrap files | AGENTS.md, SOUL.md, TOOLS.md, IDENTITY.md, USER.md, HEARTBEAT.md, MEMORY.md | SOUL.md only (others optional) |
| Memory injection | `MEMORY.md` + `memory/*.md` via tools | Not included |
| Skills system | XML skill list + on-demand `read` calls | Not included |
| Prompt modes | `full`, `minimal`, `none` | `full` only |
| Per-channel override | `extraSystemPrompt` per channel config | Single `extraSystemPrompt` parameter |
| Prompt caching | Cache-boundary-aware section ordering | Not optimized |
| Tool suite | Full custom OpenClaw tool set | Pi defaults |
| Model failover | Multi-profile auth + failover logic | Single model/provider |
| Override API | `createSystemPromptOverride` + `applySystemPromptOverrideToSession` | Direct `setSystemPrompt` / property assignment |

Your PoC captures the essential mechanism. The complexity OpenClaw adds on top is operational
(multi-tenant, multi-channel, multi-model failover), not architectural.

---

## 7. Troubleshooting

### "The model still responds in English"

1. **Check SOUL.md is being read**: Add a `console.log` in `readBootstrapFiles` to confirm the
   file is found and its content is non-empty.
2. **Print the assembled prompt**: Log `assembledPrompt` before the override call. Confirm the
   Chinese language directive appears in it.
3. **Verify the override took**: After `applySystemPromptOverride`, check `session.systemPrompt`
   (or equivalent getter) equals your assembled string.
4. **Be more explicit in SOUL.md**: Weak language like "prefer Chinese" is less reliable than
   "MUST respond ONLY in Simplified Chinese. No exceptions."

### "Pi SDK version doesn't expose `setSystemPrompt`"

Check your installed version of `@mariozechner/pi-coding-agent`. OpenClaw's own `package.json`
pins it at `0.49.3` (as of the latest indexed codebase). Look at the type definitions:

```bash
cat node_modules/@mariozechner/pi-coding-agent/dist/index.d.ts | grep -i "system\|prompt\|override"
```

The OpenClaw source wraps this with `createSystemPromptOverride` — search the Pi SDK's exported
functions for that symbol or its equivalent.

### "Session file errors on first run"

The session JSONL file must exist before `SessionManager.open()`. Create it if needed:

```typescript
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { dirname } from "path";

if (!existsSync(sessionFile)) {
  mkdirSync(dirname(sessionFile), { recursive: true });
  writeFileSync(sessionFile, "");  // Empty JSONL is valid
}
```

### "SOUL.md changes don't take effect"

OpenClaw re-reads bootstrap files on each call to `buildEmbeddedSystemPrompt`, which is called on
every `runEmbeddedPiAgent` invocation. Your `buildSystemPrompt` does the same — it reads from disk
each call. No restart needed; changes apply on the next message.

---

## Sources

All findings in this document are traced to the actual OpenClaw codebase:

- **Pi integration architecture**: `docs/pi.md` → `https://docs.openclaw.ai/pi`
- **System prompt builder**: `src/agents/system-prompt.ts`
- **Prompt injection point**: `src/agents/pi-embedded-runner/run/attempt.ts` lines 651–680
- **Bootstrap file injection**: `src/agents/system-prompt.ts` — `## Project Context` block
- **SOUL.md role**: `docs/concepts/soul.md` → `https://docs.openclaw.ai/concepts/soul`
- **Section ordering**: confirmed via GitHub issue #40256 (`openclaw/openclaw`)
- **Prompt modes table**: DeepWiki analysis of `src/agents/system-prompt.ts` lines 413–416
- **Override mechanism**: DeepWiki — `applySystemPromptOverrideToSession` call chain
