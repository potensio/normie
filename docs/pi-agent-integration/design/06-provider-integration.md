# Provider Integration Design

## Overview

Replace custom provider implementations with Pi AI's unified LLM API. Support 15+ providers out of the box with consistent streaming, cost tracking, and model management.

## Pi AI Package

### Installation

```bash
cd apps/server
pnpm add @mariozechner/pi-ai @mariozechner/pi-agent-core @mariozechner/pi-coding-agent
```

### Core Concepts

```typescript
import { getModel, streamSimple, completeSimple } from "@mariozechner/pi-ai";

// Get a model by provider and ID
const model = getModel("anthropic", "claude-opus-4-5");

// Stream responses
const stream = streamSimple(model, {
  systemPrompt: "You are a helpful assistant",
  messages: [{ role: "user", content: "Hello", timestamp: Date.now() }],
});

for await (const event of stream) {
  if (event.type === "text_delta") {
    console.log(event.delta);
  }
}
```

## Supported Providers

### Provider List

| Provider     | ID           | Models                     | API Key Env Var                              |
| ------------ | ------------ | -------------------------- | -------------------------------------------- |
| Anthropic    | `anthropic`  | Claude Opus, Sonnet, Haiku | `ANTHROPIC_API_KEY`                          |
| OpenAI       | `openai`     | GPT-4o, GPT-4, GPT-3.5     | `OPENAI_API_KEY`                             |
| Google       | `google`     | Gemini 2.5 Pro, Flash      | `GEMINI_API_KEY`                             |
| Groq         | `groq`       | Llama 3.3, Mixtral         | `GROQ_API_KEY`                               |
| xAI          | `xai`        | Grok                       | `XAI_API_KEY`                                |
| Mistral      | `mistral`    | Mistral Large, Medium      | `MISTRAL_API_KEY`                            |
| OpenRouter   | `openrouter` | 100+ models                | `OPENROUTER_API_KEY`                         |
| Ollama       | `ollama`     | Local models               | None (local)                                 |
| AWS Bedrock  | `bedrock`    | Claude, Llama via AWS      | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` |
| Azure OpenAI | `azure`      | GPT-4, GPT-3.5             | `AZURE_OPENAI_API_KEY`                       |

### Model Catalog

Pi AI includes a built-in catalog of 2000+ models. Access via:

```typescript
import { getAvailableModels, getModel } from "@mariozechner/pi-ai";

// Get all models
const allModels = getAvailableModels();

// Filter by provider
const anthropicModels = allModels.filter((m) => m.provider === "anthropic");

// Get specific model
const model = getModel("anthropic", "claude-opus-4-5");
```

## Configuration Module

### Module: `apps/server/src/pi/config.ts`

```typescript
import { getModel } from "@mariozechner/pi-ai";
import type { Model } from "@mariozechner/pi-ai";

export interface PiConfig {
  defaultProvider: string;
  defaultModel: string;
  enabledProviders: string[];
  apiKeys: Record<string, string>;
}

/**
 * Load Pi Agent configuration from environment
 */
export function loadPiConfig(): PiConfig {
  return {
    defaultProvider: process.env.DEFAULT_PROVIDER || "anthropic",
    defaultModel: process.env.DEFAULT_MODEL || "claude-opus-4-5",
    enabledProviders: (
      process.env.ENABLED_PROVIDERS || "anthropic,openai,google,groq"
    ).split(","),
    apiKeys: {
      anthropic: process.env.ANTHROPIC_API_KEY || "",
      openai: process.env.OPENAI_API_KEY || "",
      google: process.env.GEMINI_API_KEY || "",
      groq: process.env.GROQ_API_KEY || "",
      xai: process.env.XAI_API_KEY || "",
      mistral: process.env.MISTRAL_API_KEY || "",
      openrouter: process.env.OPENROUTER_API_KEY || "",
      bedrock: process.env.AWS_ACCESS_KEY_ID || "",
      azure: process.env.AZURE_OPENAI_API_KEY || "",
    },
  };
}

/**
 * Validate configuration on startup
 */
export function validatePiConfig(config: PiConfig): void {
  // Check default provider is enabled
  if (!config.enabledProviders.includes(config.defaultProvider)) {
    throw new Error(
      `Default provider ${config.defaultProvider} is not enabled`,
    );
  }

  // Check default model exists
  const model = getModel(config.defaultProvider, config.defaultModel);
  if (!model) {
    throw new Error(
      `Default model ${config.defaultProvider}/${config.defaultModel} not found`,
    );
  }

  // Warn about missing API keys for enabled providers
  for (const provider of config.enabledProviders) {
    if (provider !== "ollama" && !config.apiKeys[provider]) {
      console.warn(
        `[PiConfig] Missing API key for enabled provider: ${provider}`,
      );
    }
  }
}

/**
 * Get model with validation
 */
export function getValidatedModel(provider: string, modelId: string): Model {
  const config = loadPiConfig();

  // Check provider is enabled
  if (!config.enabledProviders.includes(provider)) {
    throw new Error(`Provider ${provider} is not enabled`);
  }

  // Get model
  const model = getModel(provider, modelId);
  if (!model) {
    throw new Error(`Model ${provider}/${modelId} not found`);
  }

  return model;
}

/**
 * Get available providers (enabled only)
 */
export function getEnabledProviders(): string[] {
  const config = loadPiConfig();
  return config.enabledProviders;
}
```

## Provider Registry

### Module: `apps/server/src/pi/index.ts`

```typescript
import { getModel, streamSimple } from "@mariozechner/pi-ai";
import { createAgentSession } from "@mariozechner/pi-coding-agent";
import { NormieSessionManager } from "./session-manager.js";
import { buildWorkspaceTools } from "./tools/index.js";
import { EventAdapter } from "./event-adapter.js";
import { loadPiConfig, validatePiConfig, getValidatedModel } from "./config.js";

export interface CreatePiSessionParams {
  workspaceId: string;
  chatId: string;
  userId: string;
  provider: string;
  model: string;
}

/**
 * Create a Pi Agent session for a chat
 */
export async function createPiSession(params: CreatePiSessionParams) {
  const { workspaceId, chatId, userId, provider, model } = params;

  // Get validated model
  const piModel = getValidatedModel(provider, model);

  // Create session manager
  const sessionManager = new NormieSessionManager({
    workspaceId,
    chatId,
  });

  // Build workspace tools
  const tools = await buildWorkspaceTools({
    workspaceId,
    userId,
    composioClient: getComposioClient(),
  });

  // Create Pi Agent session
  const { session } = await createAgentSession({
    model: piModel,
    sessionManager: sessionManager.getPiSessionManager(),
    customTools: tools,
    thinkingLevel: "off",
  });

  // Set stream function
  session.agent.streamFn = streamSimple;

  // Create event adapter
  const eventAdapter = new EventAdapter({
    provider,
    chatId,
  });

  return {
    session,
    sessionManager,
    eventAdapter,
  };
}

/**
 * Initialize Pi Agent on server startup
 */
export async function initializePiAgent(): Promise<void> {
  console.log("[PiAgent] Initializing...");

  // Load and validate config
  const config = loadPiConfig();
  validatePiConfig(config);

  console.log("[PiAgent] Configuration:");
  console.log(`  Default: ${config.defaultProvider}/${config.defaultModel}`);
  console.log(`  Enabled providers: ${config.enabledProviders.join(", ")}`);

  // Test default model
  const defaultModel = getModel(config.defaultProvider, config.defaultModel);
  console.log(`[PiAgent] Default model: ${defaultModel.name}`);
  console.log(`  Context window: ${defaultModel.contextWindow} tokens`);
  console.log(`  Max output: ${defaultModel.maxTokens} tokens`);
  console.log(
    `  Cost: $${defaultModel.cost.input}/M input, $${defaultModel.cost.output}/M output`,
  );

  console.log("[PiAgent] Initialized successfully");
}
```

## Streaming Configuration

### Stream Function Wrapper

```typescript
import { streamSimple } from "@mariozechner/pi-ai";
import type { StreamFn } from "@mariozechner/pi-agent-core";

/**
 * Wrap streamSimple with custom configuration
 */
export function createStreamFn(options?: {
  cacheRetention?: "none" | "short" | "long";
  headers?: Record<string, string>;
}): StreamFn {
  return (model, context, streamOptions) => {
    return streamSimple(model, context, {
      ...streamOptions,
      ...options,
    });
  };
}

// Usage:
session.agent.streamFn = createStreamFn({
  cacheRetention: "long", // Enable prompt caching for Anthropic
  headers: {
    "X-Title": "Normie",
    "HTTP-Referer": "https://normie.app",
  },
});
```

### Provider-Specific Options

```typescript
// Anthropic: Enable prompt caching
if (provider === "anthropic") {
  session.agent.streamFn = createStreamFn({
    cacheRetention: "long",
  });
}

// OpenRouter: Add attribution headers
if (provider === "openrouter") {
  session.agent.streamFn = createStreamFn({
    headers: {
      "X-Title": "Normie",
      "HTTP-Referer": "https://normie.app",
    },
  });
}

// Ollama: No special config needed
if (provider === "ollama") {
  session.agent.streamFn = streamSimple;
}
```

## Cost Tracking

### Token Usage

Pi AI automatically tracks token usage:

```typescript
session.subscribe((event) => {
  if (event.type === "message_end") {
    const usage = event.message.usage;
    console.log(
      `[Cost] Input: ${usage.inputTokens}, Output: ${usage.outputTokens}`,
    );

    // Calculate cost
    const inputCost = (usage.inputTokens / 1_000_000) * model.cost.input;
    const outputCost = (usage.outputTokens / 1_000_000) * model.cost.output;
    const totalCost = inputCost + outputCost;

    console.log(`[Cost] Total: $${totalCost.toFixed(6)}`);

    // Store in database
    await db.insert(schema.chatUsage).values({
      chatId,
      provider,
      model: model.id,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cost: totalCost,
    });
  }
});
```

### Cost Tracking Table

```typescript
export const chatUsage = pgTable("chat_usage", {
  id: uuid("id").primaryKey().defaultRandom(),
  chatId: uuid("chat_id")
    .notNull()
    .references(() => chats.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  cost: numeric("cost", { precision: 10, scale: 6 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

## Error Handling

### Provider Errors

```typescript
try {
  const { session } = await createPiSession({
    workspaceId,
    chatId,
    userId,
    provider,
    model,
  });

  await session.prompt(message);
} catch (error) {
  if (error.message.includes("API key")) {
    return res.status(401).json({
      error: "Invalid API key",
      code: "INVALID_API_KEY",
    });
  }

  if (error.message.includes("rate limit")) {
    return res.status(429).json({
      error: "Rate limit exceeded",
      code: "RATE_LIMIT",
    });
  }

  if (error.message.includes("context length")) {
    return res.status(400).json({
      error: "Message too long",
      code: "CONTEXT_LENGTH_EXCEEDED",
    });
  }

  // Generic error
  return res.status(500).json({
    error: error.message,
    code: "PROVIDER_ERROR",
  });
}
```

### Fallback Strategy

```typescript
async function createPiSessionWithFallback(params: CreatePiSessionParams) {
  const fallbackProviders = ["anthropic", "openai", "google"];

  for (const provider of fallbackProviders) {
    try {
      return await createPiSession({
        ...params,
        provider,
        model: getDefaultModelForProvider(provider),
      });
    } catch (error) {
      console.warn(`[PiAgent] Provider ${provider} failed, trying next...`);
    }
  }

  throw new Error("All providers failed");
}
```

## Testing

### Provider Tests

```typescript
describe("Pi Provider Integration", () => {
  it("should create session with Anthropic", async () => {
    const { session } = await createPiSession({
      workspaceId: "test-ws",
      chatId: "test-chat",
      userId: "test-user",
      provider: "anthropic",
      model: "claude-opus-4-5",
    });

    expect(session).toBeDefined();
    expect(session.model.provider).toBe("anthropic");
  });

  it("should stream responses", async () => {
    const { session } = await createPiSession({
      workspaceId: "test-ws",
      chatId: "test-chat",
      userId: "test-user",
      provider: "anthropic",
      model: "claude-opus-4-5",
    });

    const chunks: string[] = [];

    session.subscribe((event) => {
      if (
        event.type === "message_update" &&
        event.assistantMessageEvent.type === "text_delta"
      ) {
        chunks.push(event.assistantMessageEvent.delta);
      }
    });

    await session.prompt("Say hello");

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join("")).toContain("hello");
  });

  it("should track token usage", async () => {
    const { session } = await createPiSession({
      workspaceId: "test-ws",
      chatId: "test-chat",
      userId: "test-user",
      provider: "anthropic",
      model: "claude-opus-4-5",
    });

    let usage: any = null;

    session.subscribe((event) => {
      if (event.type === "message_end") {
        usage = event.message.usage;
      }
    });

    await session.prompt("Hello");

    expect(usage).toBeDefined();
    expect(usage.inputTokens).toBeGreaterThan(0);
    expect(usage.outputTokens).toBeGreaterThan(0);
  });
});
```

## Environment Configuration

### .env File

```bash
# Default provider and model
DEFAULT_PROVIDER=anthropic
DEFAULT_MODEL=claude-opus-4-5

# Enabled providers (comma-separated)
ENABLED_PROVIDERS=anthropic,openai,google,groq,ollama

# API Keys
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
GROQ_API_KEY=gsk_...
XAI_API_KEY=xai-...
MISTRAL_API_KEY=...
OPENROUTER_API_KEY=sk-or-...

# AWS Bedrock (optional)
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1

# Azure OpenAI (optional)
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_ENDPOINT=https://....openai.azure.com/
```

## Migration from Current System

### Current State

```typescript
// Custom provider classes
const provider = getProvider("claude"); // Returns ClaudeProvider instance
for await (const chunk of provider.query(params)) {
  // Handle chunk
}
```

### New State

```typescript
// Pi Agent unified API
const { session } = await createPiSession({
  workspaceId,
  chatId,
  userId,
  provider: "anthropic",
  model: "claude-opus-4-5",
});

session.subscribe((event) => {
  // Handle event
});

await session.prompt(message);
```

### Key Differences

| Aspect              | Current             | Pi Agent       |
| ------------------- | ------------------- | -------------- |
| Provider count      | 5                   | 15+            |
| Streaming format    | Custom per provider | Unified events |
| Model switching     | Not supported       | One line       |
| Cost tracking       | Manual              | Automatic      |
| Context compaction  | Manual              | Automatic      |
| Session persistence | In-memory Map + DB  | JSONL files    |
