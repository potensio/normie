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
import { existsSync, mkdirSync } from "fs";
import path from "path";
import { loadPiConfig, validatePiConfig, PROVIDER_ALIAS } from "./config.js";
import { BEDROCK_MODELS } from "./bedrock-models.js";
import { buildWorkspaceTools, type ToolBuilderOptions } from "./tools/index.js";
import type { ResolvedCredentials } from "./credentials.js";

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
  /** User ID for context */
  userId: string;
  /** System prompt from context builder */
  systemPrompt?: string;
  /** Current user message (conversation history handled by Pi Agent session) */
  currentMessage: string;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Existing session ID from DB (for resumption) */
  sessionId?: string;
  /** Pre-resolved credentials (for simple API key providers) */
  credentials: ResolvedCredentials;
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
 * Run a query with Pi Agent and return the complete response.
 *
 * This is the main entry point for chat queries. It:
 * 1. Validates credentials (from DB for user keys, from env for owner keys)
 * 2. Creates AuthStorage with injected credentials (for simple API key providers)
 * 3. Creates AgentSession via SDK
 * 4. Waits for complete response
 *
 * @returns Complete response text
 */
export async function runPiQuery(options: RunPiQueryOptions): Promise<string> {
  const {
    provider,
    model,
    workspaceId,
    chatId,
    userId,
    systemPrompt,
    currentMessage,
    signal,
    sessionId,
    credentials,
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

  // Change working directory to isolate from project codebase
  const originalCwd = process.cwd();
  const isolatedWorkDir = path.join(
    originalCwd,
    ".pi",
    "workspaces",
    workspaceId,
  );

  // Ensure isolated directory exists
  if (!existsSync(isolatedWorkDir)) {
    mkdirSync(isolatedWorkDir, { recursive: true });
  }

  process.chdir(isolatedWorkDir);
  console.log(
    `[PiAgent] Changed cwd to isolated workspace: ${isolatedWorkDir}`,
  );

  // Resolve Pi provider name (handle aliases)
  const piProvider = PROVIDER_ALIAS[provider] || provider;
  console.log(`[PiAgent] Pi provider ID: ${piProvider}`);

  // Validate credentials
  if (!credentials.configured) {
    console.error("[PiAgent] ERROR: Credentials not configured");
    throw new Error(
      credentials.error || `No API key configured for ${provider}`,
    );
  }

  console.log(`[PiAgent] Credentials source: ${credentials.source}`);

  // Build workspace tools
  console.log("[PiAgent] Building workspace tools...");
  const toolOptions: ToolBuilderOptions = {
    workspaceId,
    userId,
    includeCodingTools: true,
    includeWebTools: true,
  };

  const tools = await buildWorkspaceTools(toolOptions);
  console.log(`[PiAgent] Built ${tools.length} tools`);

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
  console.log("[PiAgent] Getting model from registry...");
  const registryProvider = provider === "amazon-bedrock" ? "bedrock" : provider;
  const piModel = modelRegistry.find(registryProvider, model);
  if (!piModel) {
    console.error(`[PiAgent] Model not found: ${registryProvider}/${model}`);
    throw new Error(`Model '${registryProvider}/${model}' not found`);
  }
  console.log(`[PiAgent] Model: ${piModel.id} (${piModel.name})`);

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

  try {
    const result = await createAgentSession({
      authStorage,
      model: piModel,
      thinkingLevel: "medium",
      tools: tools as any,
      customTools: [],
      sessionManager: piSessionManager?.getPiSessionManager(),
    });

    session = result.session;

    console.log("[PiAgent] AgentSession created successfully");
  } catch (error) {
    console.error("[PiAgent] Failed to create AgentSession:", error);
    throw new Error(`Failed to initialize agent: ${(error as Error).message}`);
  }

  // Collect response
  let completeResponse = "";
  let done = false;
  let errorMessage: string | null = null;

  // Subscribe to session events
  const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
    if (event.type === "message_update") {
      const messageEvent = (event as any).assistantMessageEvent;
      if (messageEvent.type === "text_delta") {
        completeResponse += messageEvent.delta;
      }
    }

    if (event.type === "agent_end") {
      done = true;
      if ("error" in event && event.error) {
        errorMessage = String(event.error);
      }
    }
  });

  try {
    console.log(`[PiAgent] Sending prompt...`);
    await session.prompt(currentMessage);

    // Wait for completion
    while (!done) {
      if (signal?.aborted) {
        console.log("[PiAgent] Request aborted by client");
        await session.abort();
        throw new Error("Request aborted");
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (errorMessage) {
      throw new Error(errorMessage);
    }

    console.log("[PiAgent] Query completed successfully");
    return completeResponse;
  } catch (error) {
    console.error("[PiAgent] Query error:", error);
    throw error;
  } finally {
    unsubscribe();
    process.chdir(originalCwd);
    console.log("[PiAgent] Restored original cwd");
    console.log("=".repeat(60));
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

// Re-export tools
export { buildWorkspaceTools, type ToolBuilderOptions } from "./tools/index.js";

// Re-export credentials
export { resolveCredentials, type ResolvedCredentials } from "./credentials.js";
