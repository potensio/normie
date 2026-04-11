# Injecting System Prompt in Pi Agent SDK

Package: `@mariozechner/pi-coding-agent`

---

## The Correct Way: `systemPromptOverride` via `DefaultResourceLoader`

This is the **official SDK approach** — bukan CLI, bukan file-based.

```typescript
import { createAgentSession, DefaultResourceLoader } from "@mariozechner/pi-coding-agent";

const loader = new DefaultResourceLoader({
  systemPromptOverride: () => "You are a helpful assistant. Be concise.",
});
await loader.reload();

const { session } = await createAgentSession({ resourceLoader: loader });
```

---

## Dynamic System Prompt

Karena `systemPromptOverride` menerima **function**, lo bisa inject secara dinamis:

```typescript
const loader = new DefaultResourceLoader({
  systemPromptOverride: () => `
    You are a helpful assistant.
    Current time: ${new Date().toISOString()}
    Environment: ${process.env.NODE_ENV}
  `,
});
await loader.reload();
```

---

## Via Inline Extension (Advanced)

Untuk behavior yang lebih kompleks, gunakan `extensionFactories`:

```typescript
const loader = new DefaultResourceLoader({
  extensionFactories: [
    (pi) => {
      pi.on("agent_start", () => {
        // Modify agent state before it starts
        console.log("Agent is starting...");
      });
    },
  ],
});
await loader.reload();

const { session } = await createAgentSession({ resourceLoader: loader });
```

---

## Complete Example

```typescript
import { getModel } from "@mariozechner/pi-ai";
import {
  AuthStorage,
  ModelRegistry,
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
} from "@mariozechner/pi-coding-agent";

const authStorage = AuthStorage.create();
const modelRegistry = new ModelRegistry(authStorage);

const model = getModel("anthropic", "claude-sonnet-4-5");
if (!model) throw new Error("Model not found");

const loader = new DefaultResourceLoader({
  systemPromptOverride: () => "You are a concise coding assistant.",
});
await loader.reload();

const { session } = await createAgentSession({
  model,
  authStorage,
  modelRegistry,
  resourceLoader: loader,
  sessionManager: SessionManager.inMemory(),
});

session.subscribe((event) => {
  if (
    event.type === "message_update" &&
    event.assistantMessageEvent.type === "text_delta"
  ) {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

await session.prompt("Hello!");
```

---

## ❌ What Does NOT Work in SDK Mode

| Method | Why Invalid |
|---|---|
| `.pi/SYSTEM.md` file | CLI-only, not SDK |
| `~/.pi/agent/SYSTEM.md` | CLI-only, not SDK |
| `applySystemPromptOverrideToSession()` | Internal OpenClaw function, not public API |
| Direct `session.agent.state.systemPrompt =` mutation | Not recommended, may cause unexpected behavior |
