/**
 * Pi Agent Streaming Module
 *
 * Wraps Pi Agent SDK to provide streaming events for SSE.
 *
 * This is the ACTIVE code path used by the chat streaming endpoint.
 */

import {
  createAgentSession,
  AuthStorage,
  ModelRegistry,
  DefaultResourceLoader,
  type AgentSession,
  type AgentSessionEvent,
} from "@mariozechner/pi-coding-agent";
import { existsSync, mkdirSync } from "fs";
import path from "path";
import { PROVIDER_ALIAS } from "./config.js";
import { BEDROCK_MODELS } from "./bedrock-models.js";
import { buildWorkspaceTools, type ToolBuilderOptions } from "./tools/index.js";
import type { ResolvedCredentials } from "./credentials.js";
import { buildUserMessage } from "./prompt.js";
import { isComposioConfigured } from "./composio/index.js";


/**
 * Pi Agent event for streaming
 */
export interface PiStreamEvent {
  type: "message_update" | "agent_end" | "tool_call" | "thinking" | "auth_required";
  assistantMessageEvent?: {
    type: "text_delta";
    delta: string;
  };
  toolCall?: {
    id: string;
    name: string;
    input?: Record<string, unknown>;
    status: "running" | "success" | "error";
    result?: unknown;
    error?: string;
  };
  /** Auth required event - user needs to connect an account */
  authRequired?: {
    toolkitSlug: string;
    toolkitName: string;
    authUrl: string;
    connectionRequestId: string;
    message: string;
  };
  content?: string;
  error?: string;
}

export type PiStreamCallback = (event: PiStreamEvent) => void;

/**
 * Options for running a streaming query
 */
export interface RunPiStreamOptions {
  provider: string;
  model: string;
  workspaceId: string;
  chatId: string;
  userId: string;
  currentMessage: string;
  signal?: AbortSignal;
  sessionId?: string;
  credentials: ResolvedCredentials;
}

/**
 * Map Pi provider names to AuthStorage provider IDs
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
    bedrock: "bedrock",
  };
  return mapping[piProvider] || piProvider;
}

/**
 * Create AuthStorage with pre-injected credentials
 */
function createAuthStorageWithCredentials(
  provider: string,
  credentials: ResolvedCredentials,
): AuthStorage {
  const authProviderId = getAuthProviderId(provider);
  const authData: Record<string, { type: "api_key"; key: string }> = {};

  if (credentials.configured && credentials.apiKey) {
    authData[authProviderId] = {
      type: "api_key",
      key: credentials.apiKey,
    };
  }

  return AuthStorage.inMemory(authData);
}

/**
 * Run Pi Agent query with streaming events
 */
export async function runPiQueryStream(
  options: RunPiStreamOptions,
  onEvent: PiStreamCallback,
): Promise<void> {
  const {
    provider,
    model,
    workspaceId,
    chatId,
    userId,
    currentMessage,
    signal,
    credentials,
  } = options;

  console.log("[PiAgent:Stream] Starting streaming query");

  // Change to isolated workspace directory
  const originalCwd = process.cwd();
  const isolatedWorkDir = path.join(
    originalCwd,
    ".pi",
    "workspaces",
    workspaceId,
  );

  if (!existsSync(isolatedWorkDir)) {
    mkdirSync(isolatedWorkDir, { recursive: true });
  }

  process.chdir(isolatedWorkDir);

  try {
    // Resolve Pi provider name
    const piProvider = PROVIDER_ALIAS[provider] || provider;

    // Validate credentials
    if (!credentials.configured) {
      throw new Error(
        credentials.error || `No API key configured for ${provider}`,
      );
    }

    // Build workspace tools
    const toolOptions: ToolBuilderOptions = {
      workspaceId,
      userId,
      includeCodingTools: true,
      includeWebTools: true,
    };

    const tools = await buildWorkspaceTools(toolOptions);

    // Prepare custom tools (Composio meta-tools)
    let customTools: any[] = [];

    // Add Composio meta-tools (for autonomous tool discovery)
    console.log("[PiAgent:Stream] Composio configured:", isComposioConfigured());
    console.log("[PiAgent:Stream] COMPOSIO_API_KEY exists:", !!process.env.COMPOSIO_API_KEY);
    if (isComposioConfigured()) {
      try {
        const { getComposioMetaTools } = await import("./composio/index.js");
        // Use workspaceId as Composio userId - 1 workspace = 1 set of connections
        const composioTools = getComposioMetaTools(workspaceId);
        customTools = composioTools;
        console.log("[PiAgent:Stream] Added Composio meta-tools for autonomous tool discovery", composioTools.length, "tools");
      } catch (error) {
        console.warn("[PiAgent:Stream] Failed to load Composio meta-tools:", error);
      }
    }

    // Create AuthStorage
    const authProvider = provider === "amazon-bedrock" ? "bedrock" : provider;
    const authStorage = createAuthStorageWithCredentials(
      authProvider,
      credentials,
    );

    // Create ModelRegistry
    const modelRegistry = ModelRegistry.inMemory(authStorage);

    // Register Bedrock if needed
    if (provider === "bedrock" || provider === "amazon-bedrock") {
      modelRegistry.registerProvider("bedrock", {
        baseUrl: process.env.BEDROCK_BASE_URL!,
        apiKey: process.env.BEDROCK_API_KEY!,
        api: "openai-completions",
        authHeader: true,
        models: BEDROCK_MODELS,
      });
    }

    // Get model
    const registryProvider =
      provider === "amazon-bedrock" ? "bedrock" : provider;
    const piModel = modelRegistry.find(registryProvider, model);
    if (!piModel) {
      throw new Error(`Model '${registryProvider}/${model}' not found`);
    }

    // Create session manager
    let piSessionManager: any = null;
    try {
      const { NormieSessionManager } = await import("./session-manager.js");
      piSessionManager = new NormieSessionManager({
        workspaceId,
        chatId,
      });
    } catch (error) {
      console.warn("[PiAgent:Stream] Failed to create session manager:", error);
    }

    // Create resource loader with minimal defaults
    const loader = new DefaultResourceLoader({
      // Disable AGENTS.md and skills to prevent English context injection
      agentsFilesOverride: () => ({ agentsFiles: [] }),
      skillsOverride: () => ({ skills: [], diagnostics: [] }),
    });
    await loader.reload();

    // Create Agent Session
    console.log("[PiAgent:Stream] Built-in tools:", tools.length, "-", tools.map((t: any) => t.name).join(", "));
    console.log("[PiAgent:Stream] Custom tools:", customTools.length, "-", customTools.map((t: any) => t.name).join(", "));
    
    const result = await createAgentSession({
      authStorage,
      model: piModel,
      thinkingLevel: "medium",
      tools: tools as any,
      customTools: customTools as any,
      sessionManager: piSessionManager?.getPiSessionManager(),
      resourceLoader: loader,
    });

    const session: AgentSession = result.session;

    // Track completion
    let done = false;
    let errorMessage: string | null = null;

    // Subscribe to session events and stream them immediately
    const unsubscribe = session.subscribe((event: AgentSessionEvent) => {
      console.log("[PiAgent:Stream] Event received:", event.type);

      // Stream text deltas
      if (event.type === "message_update") {
        const messageEvent = (event as any).assistantMessageEvent;
        if (messageEvent?.type === "text_delta") {
          console.log("[PiAgent:Stream] Text delta:", messageEvent.delta);
          onEvent({
            type: "message_update",
            assistantMessageEvent: {
              type: "text_delta",
              delta: messageEvent.delta,
            },
          });
        }
      }

      // Stream tool calls
      if (event.type === "tool_execution_start") {
        const toolEvent = event as any;
        console.log(
          "[PiAgent:Stream] Tool execution start:",
          toolEvent.toolCallId,
          toolEvent.toolName,
        );
        onEvent({
          type: "tool_call",
          toolCall: {
            id: toolEvent.toolCallId || `tool-${Date.now()}`,
            name: toolEvent.toolName || "unknown",
            input: toolEvent.input,
            status: "running",
          },
        });
      }

      if (event.type === "tool_execution_end") {
        const toolEvent = event as any;
        console.log(
          "[PiAgent:Stream] Tool execution end:",
          toolEvent.toolCallId,
          "Error:",
          toolEvent.isError,
        );
        
        // Check if tool result indicates auth required
        const result = toolEvent.result;
        if (result?.details?.reason === "auth_required" && result?.details?.toolkitSlug) {
          // Emit auth_required event
          onEvent({
            type: "auth_required",
            authRequired: {
              toolkitSlug: result.details.toolkitSlug,
              toolkitName: result.details.toolkitSlug,
              authUrl: "", // Will be filled by client
              connectionRequestId: "",
              message: `You need to connect your ${result.details.toolkitSlug} account.`,
            },
          });
        }
        
        onEvent({
          type: "tool_call",
          toolCall: {
            id: toolEvent.toolCallId || `tool-${Date.now()}`,
            name: toolEvent.toolName || "unknown",
            status: toolEvent.isError ? "error" : "success",
            result: toolEvent.result,
            error: toolEvent.error,
          },
        });
      }

      // Handle completion
      if (event.type === "agent_end") {
        console.log("[PiAgent:Stream] Agent end");
        done = true;
        if ("error" in event && event.error) {
          errorMessage = String(event.error);
        }
      }
    });

    try {
      // Send prompt with language instruction prepended
      await session.prompt(buildUserMessage(currentMessage));

      // Wait for completion (events are already being streamed via subscription)
      while (!done) {
        if (signal?.aborted) {
          console.log("[PiAgent:Stream] Request aborted");
          await session.abort();
          throw new Error("Request aborted");
        }
        // Small delay to prevent tight loop
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      if (errorMessage) {
        throw new Error(errorMessage);
      }

      console.log("[PiAgent:Stream] Query completed");
    } finally {
      unsubscribe();
    }
  } finally {
    process.chdir(originalCwd);
  }
}