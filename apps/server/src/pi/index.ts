/**
 * Pi Agent Main Module
 *
 * Provides the main entry point for creating Pi Agent sessions
 * and initializing the Pi Agent on server startup.
 *
 * Credential Flow:
 * - Simple API key providers (Anthropic, OpenAI, etc): Injected via AuthStorage.inMemory()
 * - AWS Bedrock: Uses BEDROCK_API_KEY + BEDROCK_BASE_URL (OpenAI-compatible API)
 * - Owner-managed: Bedrock credentials are server-level, not user-configurable
 */

import {
  createAgentSession,
  AuthStorage,
  ModelRegistry,
  type AgentSession,
  type AgentSessionEvent,
} from "@mariozechner/pi-coding-agent";
import { loadPiConfig, validatePiConfig, PROVIDER_ALIAS } from "./config.js";
import { BEDROCK_MODELS } from "./bedrock-models.js";
import { EventAdapter } from "./event-adapter.js";
import { buildWorkspaceTools, type ToolBuilderOptions } from "./tools/index.js";
import type { ResolvedCredentials } from "./credentials.js";
import type { StreamChunk } from "@normie/types";
import { getDb } from "../db/index.js";

export interface CreatePiSessionParams {
  workspaceId: string;
  chatId: string;
  userId: string;
  provider: string;
  model: string;
}

/**
 * Options for running a query with Pi Agent
 */
export interface RunPiQueryOptions {
  /** Provider name (e.g., 'anthropic', 'openai', 'bedrock') */
  provider: string;
  /** Model ID (e.g., 'claude-opus-4-5') */
  model: string;
  /** Workspace ID for tools and context */
  workspaceId: string;
  /** Chat ID for session management */
  chatId: string;
  /** User ID for Composio entity isolation */
  userId: string;
  /** System prompt from context builder */
  systemPrompt?: string;
  /** Current user message (conversation history handled by Pi Agent session) */
  currentMessage: string;
  /** Composio client for workspace integrations */
  composioClient?: unknown;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Existing session ID from DB (for resumption) */
  sessionId?: string;
  /** Pre-resolved credentials (for simple API key providers) */
  credentials: ResolvedCredentials;
  /** Database client for connect_toolkit tool */
  db?: unknown;
}

/**
 * Map Pi provider names to AuthStorage provider IDs.
 */
function getAuthProviderId(piProvider: string): string {
  const mapping: Record<string, string> = {
    anthropic: "anthropic",
    openai: "openai",
    google: "google",
    groq: "groq",
    xai: "xai",
    mistral: "mistral",
    openrouter: "openrouter",
    cerebras: "cerebras",
    "kimi-coding": "kimi-coding",
    opencode: "opencode",
    minimax: "minimax",
    zai: "zai",
    bedrock: "bedrock", // Add bedrock
  };
  return mapping[piProvider] || piProvider;
}

/**
 * Create an AuthStorage with pre-injected credentials.
 */
function createAuthStorageWithCredentials(
  provider: string,
  credentials: ResolvedCredentials,
): AuthStorage {
  console.log(
    `[PiAgent:AuthStorage] Creating auth storage for provider: ${provider}`,
  );
  console.log(
    `[PiAgent:AuthStorage] Credentials source: ${credentials.source}`,
  );

  const authProviderId = getAuthProviderId(provider);

  // Build auth data for in-memory storage
  const authData: Record<string, { type: "api_key"; key: string }> = {};

  if (credentials.configured && credentials.apiKey) {
    authData[authProviderId] = {
      type: "api_key",
      key: credentials.apiKey,
    };
    console.log(`[PiAgent:AuthStorage] Injected API key for ${authProviderId}`);
  }

  return AuthStorage.inMemory(authData);
}

/**
 * Run a query with Pi Agent and stream events through the EventAdapter.
 *
 * This is the main entry point for chat queries. It:
 * 1. Validates credentials (from DB for user keys, from env for owner keys)
 * 2. Creates AuthStorage with injected credentials (for simple API key providers)
 * 3. Creates AgentSession via SDK
 * 4. Subscribes to events and streams responses
 *
 * @yields StreamChunk events compatible with the frontend SSE format
 */
export async function* runPiQuery(
  options: RunPiQueryOptions,
): AsyncGenerator<StreamChunk> {
  const {
    provider,
    model,
    workspaceId,
    chatId,
    userId,
    systemPrompt,
    currentMessage,
    composioClient,
    signal,
    sessionId,
    credentials,
    db,
  } = options;

  console.log("=".repeat(60));
  console.log("[PiAgent] Running query");
  console.log(`[PiAgent] Provider: ${provider}`);
  console.log(`[PiAgent] Model: ${model}`);
  console.log(`[PiAgent] Workspace: ${workspaceId}`);
  console.log(`[PiAgent] Chat: ${chatId}`);
  console.log(`[PiAgent] User: ${userId}`);
  console.log(`[PiAgent] Session: ${sessionId || "new"}`);
  console.log("=".repeat(60));

  // Resolve Pi provider name (handle aliases)
  const piProvider = PROVIDER_ALIAS[provider] || provider;
  console.log(`[PiAgent] Pi provider ID: ${piProvider}`);

  // Validate credentials
  if (!credentials.configured) {
    console.error("[PiAgent] ERROR: Credentials not configured");
    yield {
      type: "error",
      message: credentials.error || `No API key configured for ${provider}`,
      provider,
    };
    return;
  }

  console.log(`[PiAgent] Credentials source: ${credentials.source}`);

  // Create event adapter
  const eventAdapter = new EventAdapter({
    provider,
    chatId,
    sessionId,
  });

  // Build workspace tools
  console.log("[PiAgent] Building workspace tools...");
  console.log(`[PiAgent] Composio client available: ${!!composioClient}`);
  const toolOptions: ToolBuilderOptions = {
    workspaceId,
    userId,
    composioClient: composioClient as any,
    includeCodingTools: true,
    includeWebTools: true,
    includeComposioTools: !!composioClient,
    db: getDb(),
  };

  const tools = await buildWorkspaceTools(toolOptions);
  console.log(`[PiAgent] Built ${tools.length} tools`);
  console.log(`[PiAgent] Tool names: ${tools.map((t) => t.name).join(", ")}`);

  // Create AuthStorage with injected credentials
  // For bedrock, use "bedrock" as auth provider (not "amazon-bedrock")
  const authProvider = provider === "amazon-bedrock" ? "bedrock" : provider;
  const authStorage = createAuthStorageWithCredentials(
    authProvider,
    credentials,
  );

  // Create ModelRegistry
  console.log("[PiAgent] Creating ModelRegistry...");
  const modelRegistry = ModelRegistry.inMemory(authStorage);

  // Register custom Bedrock provider if needed
  // Check both "bedrock" and "amazon-bedrock" (aliased name)
  if (provider === "bedrock" || provider === "amazon-bedrock") {
    console.log("[PiAgent] Registering custom Bedrock provider...");
    console.log(
      `[PiAgent]   credentials.apiKey: ${credentials.apiKey?.substring(0, 20)}...`,
    );
    console.log(
      `[PiAgent]   process.env.BEDROCK_API_KEY: ${process.env.BEDROCK_API_KEY?.substring(0, 20)}...`,
    );

    modelRegistry.registerProvider("bedrock", {
      baseUrl: process.env.BEDROCK_BASE_URL!,
      apiKey: process.env.BEDROCK_API_KEY!, // Use env directly like POC
      api: "openai-completions",
      authHeader: true,
      models: BEDROCK_MODELS,
    });
    console.log(`[PiAgent]   Base URL: ${process.env.BEDROCK_BASE_URL}`);
    console.log(`[PiAgent]   API type: openai-completions`);
    console.log(`[PiAgent]   Models: ${BEDROCK_MODELS.length}`);
  }

  // Get model from registry
  // For bedrock, always use "bedrock" as the provider name (not "amazon-bedrock")
  console.log("[PiAgent] Getting model from registry...");
  const registryProvider = provider === "amazon-bedrock" ? "bedrock" : provider;
  const piModel = modelRegistry.find(registryProvider, model);
  if (!piModel) {
    console.error(`[PiAgent] Model not found: ${registryProvider}/${model}`);
    yield {
      type: "error",
      message: `Model '${registryProvider}/${model}' not found`,
      provider,
    };
    return;
  }
  console.log(`[PiAgent] Model: ${piModel.id} (${piModel.name})`);
  console.log(`[PiAgent] Model provider: ${piModel.provider}`);
  console.log(`[PiAgent] Model API: ${(piModel as any).api}`);
  console.log(`[PiAgent] Context window: ${piModel.contextWindow} tokens`);

  // Create or load session manager for conversation persistence
  console.log("[PiAgent] Setting up session manager...");
  let piSessionManager: any = null;

  try {
    const { NormieSessionManager } = await import("./session-manager.js");
    piSessionManager = new NormieSessionManager({
      workspaceId,
      chatId,
    });
    console.log(
      `[PiAgent] Session file: ${piSessionManager.getSessionFilePath()}`,
    );
    console.log(
      `[PiAgent] Session persisted: ${piSessionManager.isPersisted()}`,
    );
  } catch (error) {
    console.warn("[PiAgent] Failed to create session manager:", error);
    // Continue without session persistence
  }

  // Create AgentSession using SDK
  console.log("[PiAgent] Creating AgentSession...");

  let session: AgentSession;
  let extensionsResult: any;

  try {
    const result = await createAgentSession({
      authStorage,
      model: piModel,
      thinkingLevel: "medium",
      tools: tools as any,
      customTools: [],
      sessionManager: piSessionManager?.getPiSessionManager(), // Pass session manager for persistence
    });

    session = result.session;
    extensionsResult = result.extensionsResult;

    console.log("[PiAgent] AgentSession created successfully");
    console.log(
      `[PiAgent] Extensions loaded: ${extensionsResult?.extensions?.length || 0}`,
    );

    if (result.modelFallbackMessage) {
      console.log(`[PiAgent] Model fallback: ${result.modelFallbackMessage}`);
    }
  } catch (error) {
    console.error("[PiAgent] Failed to create AgentSession:", error);
    yield {
      type: "error",
      message: `Failed to initialize agent: ${(error as Error).message}`,
      provider,
    };
    return;
  }

  // Queue to collect events from the session
  const eventQueue: StreamChunk[] = [];
  let resolveEventPromise:
    | ((value: IteratorResult<StreamChunk>) => void)
    | null = null;
  let done = false;
  let errorMessage: string | null = null;

  // Subscribe to session events
  const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
    console.log(`[PiAgent:Event] Received: ${event.type}`);

    // Log tool execution events specially
    if (event.type === "tool_execution_start") {
      const te = event as any;
      console.log(
        `[PiAgent:Event] TOOL EXECUTION START - ID: ${te.toolCallId}`,
      );
    }
    if (event.type === "tool_execution_end") {
      const te = event as any;
      console.log(
        `[PiAgent:Event] TOOL EXECUTION END - ID: ${te.toolCallId}, Error: ${te.isError}`,
      );
    }

    // Log full event for debugging
    if (event.type === "agent_end") {
      console.log(
        `[PiAgent:Event] Full agent_end event:`,
        JSON.stringify(event, null, 2),
      );
    }
    if (event.type === "message_update") {
      const me = event as any;
      // Log toolcall_start events
      if (me.assistantMessageEvent?.type === "toolcall_start") {
        console.log(`[PiAgent:Event] TOOLCALL START - Tool requested!`);
      }
    }

    // Translate to StreamChunk
    const chunk = translateSessionEvent(event, eventAdapter);

    if (chunk) {
      if (resolveEventPromise) {
        resolveEventPromise({ value: chunk, done: false });
        resolveEventPromise = null;
      } else {
        eventQueue.push(chunk);
      }
    }

    // Check for completion
    if (event.type === "agent_end") {
      console.log("[PiAgent:Event] Agent completed");
      done = true;
      if (resolveEventPromise) {
        resolveEventPromise({ value: undefined as any, done: true });
        resolveEventPromise = null;
      }
    }

    // Track errors
    if (event.type === "agent_end" && "error" in event && event.error) {
      errorMessage = String(event.error);
    }
  });

  // Yield initial connected event
  yield {
    type: "connected",
    message: "Processing request...",
  };

  try {
    // Get text content for logging
    const contentPreview = currentMessage.substring(0, 100);
    console.log(`[PiAgent] Sending prompt: "${contentPreview}..."`);
    console.log(`[PiAgent] Session manager will handle conversation history`);

    // Send prompt to session
    // Pi Agent's session manager automatically loads conversation history
    await session.prompt(currentMessage);

    // Track last activity for stuck detection
    let lastActivityTime = Date.now();
    const stuckThresholdMs = 60000; // 60 seconds

    // Yield events as they come
    while (!done) {
      // Check for abort
      if (signal?.aborted) {
        console.log("[PiAgent] Request aborted by client");
        await session.abort();
        yield eventAdapter.translateAbort();
        break;
      }

      // Check for stuck stream (no events for 60s)
      const timeSinceActivity = Date.now() - lastActivityTime;
      if (timeSinceActivity > stuckThresholdMs) {
        console.error(
          `[PiAgent] ⚠️ Stream stuck - no events for ${Math.round(timeSinceActivity / 1000)}s`,
        );
        throw new Error(
          `Stream timeout - no response from model for ${Math.round(timeSinceActivity / 1000)}s`,
        );
      }

      // Check if there's an event in the queue
      if (eventQueue.length > 0) {
        lastActivityTime = Date.now(); // Reset activity timer
        yield eventQueue.shift()!;
        continue;
      }

      // Wait for the next event
      const eventPromise = new Promise<IteratorResult<StreamChunk>>(
        (resolve) => {
          resolveEventPromise = resolve;
        },
      );

      // Wait with timeout to allow abort checking and stuck detection
      const timeoutPromise = new Promise<IteratorResult<StreamChunk>>(
        (resolve) => {
          setTimeout(() => {
            if (!done) {
              resolve({ value: undefined as any, done: false });
            }
          }, 1000); // Increased to 1s to reduce CPU usage
        },
      );

      const result = await Promise.race([eventPromise, timeoutPromise]);

      if (result.done) {
        done = true;
        break;
      }

      if (result.value) {
        lastActivityTime = Date.now(); // Reset activity timer
        yield result.value;
      }
    }

    // Yield any remaining events
    while (eventQueue.length > 0) {
      yield eventQueue.shift()!;
    }

    // Check for errors
    if (errorMessage) {
      console.error("[PiAgent] Agent ended with error:", errorMessage);
      yield {
        type: "error",
        message: errorMessage,
        provider,
      };
    }

    console.log("[PiAgent] Query completed successfully");
  } catch (error) {
    console.error("[PiAgent] Query error:", error);

    if ((error as Error).name === "AbortError" || signal?.aborted) {
      console.log("[PiAgent] Query aborted");
      yield eventAdapter.translateAbort();
    } else {
      yield {
        type: "error",
        message: (error as Error).message,
        provider,
      };
    }
  } finally {
    unsubscribe();
    console.log("[PiAgent] Session cleanup complete");
    console.log("=".repeat(60));
  }
}

/**
 * Translate AgentSessionEvent to StreamChunk format.
 */
function translateSessionEvent(
  event: AgentSessionEvent,
  adapter: EventAdapter,
): StreamChunk | null {
  // Log all event details for debugging
  console.log(`[PiAgent:Translate] Event type: ${event.type}`);

  switch (event.type) {
    case "agent_start":
      return {
        type: "session_init",
        session_id: adapter.sessionId || "new",
        provider: adapter.provider,
      };

    case "message_update":
      console.log("[PiAgent:Translate] Processing message_update");
      return adapter.translate(event as any);

    case "tool_execution_start":
    case "tool_execution_end":
      return adapter.translate(event as any);

    case "agent_end":
      // Check for error in agent_end
      if ("error" in event && event.error) {
        console.log("[PiAgent:Translate] Agent ended with error:", event.error);
      }
      return { type: "done", provider: adapter.provider };

    case "turn_start":
    case "turn_end":
    case "message_start":
    case "message_end":
      return null;

    default:
      console.log(
        `[PiAgent:Event] Unhandled event type: ${(event as any).type}`,
      );
      return null;
  }
}

/**
 * Initialize Pi Agent on server startup
 *
 * Validates configuration and logs Pi Agent status.
 */
export async function initializePiAgent(): Promise<void> {
  console.log("[PiAgent] Initializing...");

  // Load and validate config
  const config = loadPiConfig();
  validatePiConfig(config);

  console.log("[PiAgent] Configuration:");
  console.log(`  Default provider: ${config.defaultProvider}`);
  console.log(`  Default model: ${config.defaultModel}`);
  console.log(`  Enabled providers: ${config.enabledProviders.join(", ")}`);

  // Log AWS Bedrock configuration
  if (process.env.BEDROCK_API_KEY && process.env.BEDROCK_BASE_URL) {
    console.log("[PiAgent] AWS Bedrock configured:");
    console.log(`  API Key: ***${process.env.BEDROCK_API_KEY.slice(-8)}`);
    console.log(`  Base URL: ${process.env.BEDROCK_BASE_URL}`);
    console.log(`  Models: ${BEDROCK_MODELS.length}`);
  } else {
    console.log(
      "[PiAgent] AWS Bedrock: Not configured (need BEDROCK_API_KEY and BEDROCK_BASE_URL)",
    );
  }

  console.log("[PiAgent] Initialized successfully");
}

// Re-export config functions
export {
  loadPiConfig,
  validatePiConfig,
  getEnabledProviders,
} from "./config.js";

// Re-export event adapter for consumers
export { EventAdapter } from "./event-adapter.js";

// Re-export tools
export { buildWorkspaceTools, type ToolBuilderOptions } from "./tools/index.js";
export { getComposioClient } from "./tools/composio-tools.js";

// Re-export credentials
export { resolveCredentials, type ResolvedCredentials } from "./credentials.js";
