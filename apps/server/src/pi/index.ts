/**
 * Pi Agent Main Module
 * 
 * Provides the main entry point for creating Pi Agent sessions
 * and initializing the Pi Agent on server startup.
 */

import { Agent } from "@mariozechner/pi-agent-core";
import { getModel, type Model, type Message } from "@mariozechner/pi-ai";
import { loadPiConfig, validatePiConfig, getValidatedModel } from "./config.js";
import { NormieSessionManager } from "./session-manager.js";
import { EventAdapter } from "./event-adapter.js";
import { buildWorkspaceTools, type ToolBuilderOptions } from "./tools/index.js";
import type { StreamChunk } from '@normie/types';

export interface CreatePiSessionParams {
  workspaceId: string;
  chatId: string;
  userId: string;
  provider: string;
  model: string;
}

/**
 * Pi Agent session result with everything needed to run queries
 */
export interface PiAgentSession {
  agent: Agent;
  model: Model<any>;
  sessionManager: NormieSessionManager;
  eventAdapter: EventAdapter;
}

/**
 * Options for running a query with Pi Agent
 */
export interface RunPiQueryOptions {
  /** Provider name (e.g., 'anthropic', 'openai') */
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
  /** Conversation history with current message */
  messages: Array<{ role: string; content: string }>;
  /** Composio client for workspace integrations */
  composioClient?: unknown;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Existing session ID from DB (for resumption) */
  sessionId?: string;
}

/**
 * Create a Pi Agent session for a chat with all tools configured.
 * 
 * This sets up the Agent with:
 * - Workspace tools (coding tools + Composio integrations)
 * - Event adapter for SSE translation
 * - Session manager for persistence
 */
export async function createPiSession(params: CreatePiSessionParams): Promise<PiAgentSession> {
  const { workspaceId, chatId, userId, provider, model } = params;

  // Get validated model
  const piModel = getValidatedModel(provider, model);

  // Create session manager for persistence
  const sessionManager = new NormieSessionManager({
    workspaceId,
    chatId,
  });

  // Create event adapter for SSE translation
  const eventAdapter = new EventAdapter({
    provider,
    chatId,
  });

  // Create Agent with default settings
  const agent = new Agent({
    initialState: {
      model: piModel,
      thinkingLevel: 'medium',
    },
  });

  return {
    agent,
    model: piModel,
    sessionManager,
    eventAdapter,
  };
}

/**
 * Run a query with Pi Agent and stream events through the EventAdapter.
 * 
 * This is the main entry point for chat queries. It:
 * 1. Creates or resumes a Pi Agent session
 * 2. Builds workspace tools with Composio integration
 * 3. Sets up the agent with system prompt and tools
 * 4. Subscribes to events via the EventAdapter
 * 5. Sends the prompt and streams responses
 * 
 * @yields StreamChunk events compatible with the frontend SSE format
 */
export async function* runPiQuery(
  options: RunPiQueryOptions
): AsyncGenerator<StreamChunk> {
  const {
    provider,
    model,
    workspaceId,
    chatId,
    userId,
    systemPrompt,
    messages,
    composioClient,
    signal,
    sessionId,
  } = options;

  console.log('[PiAgent] Running query:', { provider, model, workspaceId, chatId });

  // Get validated model
  const piModel = getValidatedModel(provider, model);

  // Create session manager
  const sessionManager = new NormieSessionManager({
    workspaceId,
    chatId,
  });

  // Create event adapter
  const eventAdapter = new EventAdapter({
    provider,
    chatId,
    sessionId,
  });

  // Build workspace tools
  const toolOptions: ToolBuilderOptions = {
    workspaceId,
    userId,
    composioClient: composioClient as any,
    includeCodingTools: true,
    includeWebTools: true,
    includeComposioTools: !!composioClient,
  };
  
  const tools = await buildWorkspaceTools(toolOptions);
  console.log('[PiAgent] Built tools:', tools.length);

  // Create Agent with tools and system prompt
  const agent = new Agent({
    initialState: {
      systemPrompt: systemPrompt || '',
      model: piModel,
      tools,
      thinkingLevel: 'medium',
    },
    sessionId,
  });

  // Queue to collect events from the agent
  const eventQueue: StreamChunk[] = [];
  let resolveEventPromise: ((value: IteratorResult<StreamChunk>) => void) | null = null;
  let done = false;

  // Subscribe to agent events
  const unsubscribe = agent.subscribe((agentEvent) => {
    // Translate agent event to StreamChunk
    const chunk = eventAdapter.translate(agentEvent);
    
    if (chunk) {
      if (resolveEventPromise) {
        // Someone is waiting for an event
        resolveEventPromise({ value: chunk, done: false });
        resolveEventPromise = null;
      } else {
        // No one waiting, queue the event
        eventQueue.push(chunk);
      }
    }

    // Check for agent_end
    if (agentEvent.type === 'agent_end') {
      done = true;
      if (resolveEventPromise) {
        resolveEventPromise({ value: undefined as any, done: true });
        resolveEventPromise = null;
      }
    }
  });

  // Yield initial connected event
  yield {
    type: 'connected',
    message: 'Processing request...',
  };

  try {
    // Convert messages to Pi format
    const piMessages: Message[] = messages.map((msg) => {
      if (msg.role === 'user') {
        return {
          role: 'user',
          content: msg.content,
          timestamp: Date.now(),
        };
      } else {
        // For assistant messages in history
        return {
          role: 'assistant',
          content: [{ type: 'text', text: msg.content }],
          api: 'unknown',
          provider: provider,
          model: model,
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: 'stop',
          timestamp: Date.now(),
        } as Message;
      }
    });

    // Start the agent prompt (non-blocking)
    const promptPromise = agent.prompt(piMessages);

    // Yield events as they come
    while (!done) {
      // Check for abort
      if (signal?.aborted) {
        agent.abort();
        yield eventAdapter.translateAbort();
        break;
      }

      // Check if there's an event in the queue
      if (eventQueue.length > 0) {
        yield eventQueue.shift()!;
        continue;
      }

      // Wait for the next event or prompt completion
      const eventPromise = new Promise<IteratorResult<StreamChunk>>((resolve) => {
        resolveEventPromise = resolve;
      });

      // Race between event and prompt completion
      const result = await Promise.race([
        eventPromise,
        promptPromise.then(() => ({ value: undefined as any, done: true as const })),
      ]);

      if (result.done) {
        done = true;
        break;
      }

      yield result.value;
    }

    // Yield any remaining events
    while (eventQueue.length > 0) {
      yield eventQueue.shift()!;
    }

  } catch (error) {
    // Handle errors
    if ((error as Error).name === 'AbortError' || signal?.aborted) {
      console.log('[PiAgent] Query aborted');
      yield eventAdapter.translateAbort();
    } else {
      console.error('[PiAgent] Query error:', error);
      yield {
        type: 'error',
        message: (error as Error).message,
        provider,
      };
    }
  } finally {
    unsubscribe();
  }
}

/**
 * Initialize Pi Agent on server startup
 * 
 * Loads configuration, validates providers, and logs
 * the Pi Agent status.
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

  // Try to get default model info
  try {
    const defaultModel = getModel(config.defaultProvider as any, config.defaultModel as any);
    if (defaultModel) {
      console.log(`[PiAgent] Default model info:`);
      console.log(`  Name: ${defaultModel.name}`);
      console.log(`  Context window: ${defaultModel.contextWindow} tokens`);
      console.log(`  Max output: ${defaultModel.maxTokens} tokens`);
      
      if (defaultModel.cost) {
        console.log(
          `  Cost: $${defaultModel.cost.input}/M input, ` +
          `$${defaultModel.cost.output}/M output`
        );
      }
    }
  } catch (error) {
    console.log(
      `[PiAgent] Could not load default model info: ${(error as Error).message}`
    );
  }

  console.log("[PiAgent] Initialized successfully");
}

// Re-export config functions
export { loadPiConfig, validatePiConfig, getValidatedModel, getEnabledProviders } from "./config.js";

// Re-export session manager and event adapter for consumers
export { NormieSessionManager } from "./session-manager.js";
export { EventAdapter } from "./event-adapter.js";

// Re-export tools
export { buildWorkspaceTools, type ToolBuilderOptions } from "./tools/index.js";
export { getComposioClient } from "./tools/composio-tools.js";
